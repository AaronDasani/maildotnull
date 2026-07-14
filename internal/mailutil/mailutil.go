// Package mailutil has address formatting and MIME parsing shared by the
// HTTP provider emulation and the SMTP listeners.
package mailutil

import (
	"bytes"
	"encoding/base64"
	"regexp"
	"strings"

	"github.com/jhillyerd/enmime/v2"

	"github.com/maildotnull/maildotnull/internal/store"
)

// FormatAddress renders an {email, name} pair as a display address string.
func FormatAddress(email, name string) string {
	if email == "" {
		return ""
	}
	if name != "" {
		return name + " <" + email + ">"
	}
	return email
}

var addressSplit = regexp.MustCompile(`(?:"[^"]*"|[^,])+`)

// SplitAddressList splits a comma-separated address header into individual
// addresses, ignoring commas inside quoted display names.
func SplitAddressList(value string) []string {
	var out []string
	for _, part := range addressSplit.FindAllString(value, -1) {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// Base64Size is the decoded size of a base64 payload, without decoding it.
func Base64Size(content string) int {
	return len(content) * 3 / 4
}

// ParsedMail is the subset of a parsed MIME message the store needs.
type ParsedMail struct {
	From        string
	To          []string
	Cc          []string
	Bcc         []string
	ReplyTo     string
	Subject     string
	Text        string
	HTML        string
	Headers     map[string]string
	Attachments []store.Attachment
}

func addressList(env *enmime.Envelope, key string) []string {
	addrs, err := env.AddressList(key)
	if err != nil {
		return nil
	}
	out := make([]string, 0, len(addrs))
	for _, a := range addrs {
		out = append(out, FormatAddress(a.Address, a.Name))
	}
	return out
}

func first(list []string) string {
	if len(list) > 0 {
		return list[0]
	}
	return ""
}

// ParseMIME parses a raw RFC 5322 message (SMTP DATA or SES raw sends).
func ParseMIME(raw []byte) (ParsedMail, error) {
	env, err := enmime.ReadEnvelope(bytes.NewReader(raw))
	if err != nil {
		return ParsedMail{}, err
	}

	parts := append(env.Attachments, env.Inlines...)
	attachments := make([]store.Attachment, 0, len(parts))
	for _, p := range parts {
		filename := p.FileName
		if filename == "" {
			filename = "attachment"
		}
		attachments = append(attachments, store.Attachment{
			Filename:    filename,
			ContentType: p.ContentType,
			Size:        len(p.Content),
			Content:     base64.StdEncoding.EncodeToString(p.Content),
		})
	}

	return ParsedMail{
		From:        first(addressList(env, "From")),
		To:          addressList(env, "To"),
		Cc:          addressList(env, "Cc"),
		Bcc:         addressList(env, "Bcc"),
		ReplyTo:     first(addressList(env, "Reply-To")),
		Subject:     env.GetHeader("Subject"),
		Text:        env.Text,
		HTML:        env.HTML,
		Headers:     HeadersFromRaw(raw),
		Attachments: attachments,
	}, nil
}

// HeadersFromRaw extracts headers as they appeared on the wire (original
// casing, unfolded), instead of Go's canonicalized keys. Repeated headers
// (e.g. Received) are joined with newlines. Mirrors the TS headersFromParsed.
func HeadersFromRaw(raw []byte) map[string]string {
	headerBlock := raw
	for _, sep := range [][]byte{[]byte("\r\n\r\n"), []byte("\n\n")} {
		if idx := bytes.Index(raw, sep); idx != -1 {
			headerBlock = raw[:idx]
			break
		}
	}

	headers := map[string]string{}
	var lines []string
	// Unfold: continuation lines start with whitespace.
	for _, line := range strings.Split(string(headerBlock), "\n") {
		line = strings.TrimRight(line, "\r")
		if line == "" {
			continue
		}
		if (line[0] == ' ' || line[0] == '\t') && len(lines) > 0 {
			lines[len(lines)-1] += " " + strings.TrimSpace(line)
			continue
		}
		lines = append(lines, line)
	}
	for _, line := range lines {
		colon := strings.Index(line, ":")
		if colon == -1 {
			continue
		}
		name := strings.TrimSpace(line[:colon])
		value := strings.TrimSpace(line[colon+1:])
		if existing, ok := headers[name]; ok {
			headers[name] = existing + "\n" + value
		} else {
			headers[name] = value
		}
	}
	return headers
}
