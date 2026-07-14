// Package smtpd runs the three SMTP listeners: plaintext (1025, STARTTLS
// deliberately not advertised), STARTTLS (1587), and implicit TLS (1465).
// Any credentials are accepted; parsed messages land in the store.
package smtpd

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"errors"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"os"
	"strings"
	"time"

	"github.com/emersion/go-sasl"
	"github.com/emersion/go-smtp"

	"github.com/maildotnull/maildotnull/internal/faults"
	"github.com/maildotnull/maildotnull/internal/mailutil"
	"github.com/maildotnull/maildotnull/internal/store"
)

func port(env string, fallback string) string {
	if v := os.Getenv(env); v != "" {
		return v
	}
	return fallback
}

type backend struct {
	store *store.Store
}

func (b *backend) NewSession(_ *smtp.Conn) (smtp.Session, error) {
	return &session{store: b.store}, nil
}

type session struct {
	store         *store.Store
	authenticated bool
}

func (s *session) AuthMechanisms() []string {
	return []string{sasl.Plain, sasl.Login}
}

// loginServer is a server-side LOGIN mechanism (go-sasl only ships the
// client half); obsolete but still used by many SMTP clients.
type loginServer struct {
	// 0 = expecting username, 1 = expecting password
	step int
	done func()
}

func (l *loginServer) Next(response []byte) (challenge []byte, done bool, err error) {
	if l.step == 0 {
		if response == nil { // no initial response: ask for the username first
			return []byte("Username:"), false, nil
		}
		l.step = 1
		return []byte("Password:"), false, nil
	}
	l.done()
	return nil, true, nil
}

// Auth accepts any credentials — this is a local mock.
func (s *session) Auth(mech string) (sasl.Server, error) {
	switch mech {
	case sasl.Plain:
		return sasl.NewPlainServer(func(_, _, _ string) error {
			s.authenticated = true
			return nil
		}), nil
	case sasl.Login:
		return &loginServer{done: func() { s.authenticated = true }}, nil
	}
	return nil, errors.New("unsupported auth mechanism")
}

func smtpError(code int, message string) *smtp.SMTPError {
	return &smtp.SMTPError{Code: code, EnhancedCode: smtp.NoEnhancedCode, Message: message}
}

func (s *session) Mail(_ string, _ *smtp.MailOptions) error {
	state := faults.Get()
	switch state.SMTP {
	case "reject-temporary":
		return smtpError(451, "Requested action aborted: simulated temporary failure (MailDotNull)")
	case "reject-permanent":
		return smtpError(550, "Requested action not taken: simulated permanent failure (MailDotNull)")
	}
	if state.SMTPAuth == "required" && !s.authenticated {
		return smtpError(530, "Authentication required")
	}
	switch state.SMTP {
	case "delay":
		time.Sleep(time.Duration(state.DelaySeconds) * time.Second)
	case "timeout":
		// Stall until the client's own timeout fires; 421 as a backstop.
		time.Sleep(faults.TimeoutHold)
		return smtpError(421, "Timeout (simulated by MailDotNull), closing connection")
	}
	return nil
}

func (s *session) Rcpt(_ string, _ *smtp.RcptOptions) error { return nil }

func (s *session) Data(r io.Reader) error {
	// Buffer the message so the raw MIME can be stored alongside the parsed form.
	raw, err := io.ReadAll(r)
	if err != nil {
		return err
	}
	parsed, err := mailutil.ParseMIME(raw)
	if err != nil {
		return err
	}
	s.store.Add(store.Email{
		Source:      "smtp",
		From:        parsed.From,
		To:          parsed.To,
		Cc:          parsed.Cc,
		Bcc:         parsed.Bcc,
		ReplyTo:     parsed.ReplyTo,
		Subject:     parsed.Subject,
		Text:        parsed.Text,
		HTML:        parsed.HTML,
		Headers:     parsed.Headers,
		Attachments: parsed.Attachments,
		Raw:         string(raw),
	})
	return nil
}

func (s *session) Reset()        {}
func (s *session) Logout() error { return nil }

// selfSignedCert generates an ephemeral in-memory self-signed cert —
// clients must accept it (local testing only).
func selfSignedCert() (tls.Certificate, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, err
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: "localhost"},
		DNSNames:     []string{"localhost"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(1, 0, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		return tls.Certificate{}, err
	}
	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key}, nil
}

func newServer(st *store.Store, tlsConfig *tls.Config) *smtp.Server {
	server := smtp.NewServer(&backend{store: st})
	server.Domain = "maildotnull"
	// Accept any sender/recipient and generous sizes — this is a catcher.
	server.MaxMessageBytes = 100 << 20
	server.MaxRecipients = 1000
	// Advertise AUTH on the plaintext connection so clients configured with
	// user/password (like Mailpit setups) can log in without TLS.
	server.AllowInsecureAuth = true
	server.TLSConfig = tlsConfig
	return server
}

func listen(server *smtp.Server, addr, label string, implicitTLS bool) {
	var ln net.Listener
	var err error
	if implicitTLS {
		ln, err = tls.Listen("tcp", addr, server.TLSConfig)
	} else {
		ln, err = net.Listen("tcp", addr)
	}
	if err != nil {
		if strings.Contains(err.Error(), "address already in use") {
			port := strings.TrimPrefix(addr, ":")
			log.Printf("\n[maildotnull] ⚠️  %s port %s is already in use — incoming mail on it will NOT be captured by this instance!\n"+
				"[maildotnull]     Another maildotnull/mailpit instance is probably still running. Find it with:\n"+
				"[maildotnull]     ss -tlnp | grep :%s\n", label, port, port)
			return
		}
		log.Printf("[maildotnull] %s server error: %v", label, err)
		return
	}
	log.Printf("[maildotnull] %s server listening on port %s (all interfaces)", label, strings.TrimPrefix(addr, ":"))
	go func() {
		if err := server.Serve(ln); err != nil {
			log.Printf("[maildotnull] %s server error: %v", label, err)
		}
	}()
}

// Start boots the three SMTP listeners. Ports are overridable via
// MAILDOTNULL_SMTP_PORT, MAILDOTNULL_STARTTLS_PORT, MAILDOTNULL_SMTPS_PORT.
func Start(st *store.Store) error {
	cert, err := selfSignedCert()
	if err != nil {
		return fmt.Errorf("generate self-signed cert: %w", err)
	}
	tlsConfig := &tls.Config{Certificates: []tls.Certificate{cert}}

	// Port 1025: plaintext only. STARTTLS must NOT be advertised here — clients like
	// nodemailer upgrade opportunistically and then reject the self-signed cert,
	// breaking every existing "host: localhost, port: 1025" setup.
	plain := newServer(st, nil)
	listen(plain, ":"+port("MAILDOTNULL_SMTP_PORT", "1025"), "SMTP", false)

	// Port 1587: STARTTLS. Port 1465: implicit TLS.
	starttls := newServer(st, tlsConfig)
	listen(starttls, ":"+port("MAILDOTNULL_STARTTLS_PORT", "1587"), "SMTP-STARTTLS", false)

	smtps := newServer(st, tlsConfig)
	listen(smtps, ":"+port("MAILDOTNULL_SMTPS_PORT", "1465"), "SMTPS", true)

	return nil
}
