// Package web is the HTTP surface: internal inbox API, SSE stream,
// provider emulation endpoints, and the embedded SPA.
package web

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/maildotnull/maildotnull/internal/store"
)

// apiPrefixes are path prefixes owned by the API; unknown paths under them
// must 404 instead of falling into the SPA.
var apiPrefixes = []string{"/api/", "/email", "/emails", "/v2/", "/v3/", "/v3.1/"}

type server struct {
	store *store.Store
}

// NewHandler builds the full routing table. spa is the built client
// (dist/client), served for all non-API paths with index.html as fallback.
func NewHandler(st *store.Store, spa fs.FS) http.Handler {
	s := &server{store: st}
	mux := http.NewServeMux()

	// Internal inbox API (documented in README "Inbox API").
	mux.HandleFunc("GET /api/messages", s.listMessages)
	mux.HandleFunc("PATCH /api/messages", s.markAllRead)
	mux.HandleFunc("DELETE /api/messages", s.clearMessages)
	mux.HandleFunc("GET /api/messages/{id}", s.getMessage)
	mux.HandleFunc("PATCH /api/messages/{id}", s.patchMessage)
	mux.HandleFunc("DELETE /api/messages/{id}", s.deleteMessage)
	mux.HandleFunc("GET /api/messages/{id}/attachments/{index}", s.getAttachment)
	mux.HandleFunc("GET /api/events", s.handleEvents)
	mux.HandleFunc("GET /api/error-testing", s.getErrorTesting)
	mux.HandleFunc("PUT /api/error-testing", s.putErrorTesting)
	mux.HandleFunc("POST /api/link-check", s.handleLinkCheck)

	// Provider emulation at the paths the real SDKs call. Literal patterns
	// (e.g. /v3/mail/send) take precedence over the Mailgun {domain} wildcard.
	mux.HandleFunc("POST /emails", s.handleResend)                // Resend
	mux.HandleFunc("POST /v3/mail/send", s.handleSendgrid)        // SendGrid
	mux.HandleFunc("POST /v3.1/send", s.handleMailjet)            // Mailjet
	mux.HandleFunc("POST /email", s.handlePostmark)               // Postmark
	mux.HandleFunc("POST /email/batch", s.handlePostmarkBatch)    // Postmark batch
	mux.HandleFunc("POST /v3/smtp/email", s.handleBrevo)          // Brevo
	mux.HandleFunc("POST /v2/email/outbound-emails", s.handleSes) // Amazon SES v2
	mux.HandleFunc("POST /v3/{domain}/messages", s.handleMailgun) // Mailgun

	// Everything else: 404 under API prefixes, SPA otherwise.
	spaServer := http.FileServerFS(spa)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		for _, prefix := range apiPrefixes {
			if strings.HasPrefix(r.URL.Path, prefix) {
				notFound(w)
				return
			}
		}
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" {
			if f, err := spa.Open(path); err == nil {
				f.Close()
				spaServer.ServeHTTP(w, r)
				return
			}
		}
		// SPA fallback: serve index.html for client-side routes.
		http.ServeFileFS(w, r, spa, "index.html")
	})

	return mux
}
