// Package store holds the singleton in-memory mailbox. Nothing is persisted;
// a restart clearing the inbox is a feature.
package store

import (
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Oldest messages are dropped beyond this cap; raise it if you need longer sessions.
const maxMessages = 1000

// Attachment is stored with base64 content, mirroring the JSON wire shape.
type Attachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int    `json:"size"`
	Content     string `json:"content"`
}

// Email is the full stored message. JSON tags match the TypeScript StoredEmail
// shape the SPA consumes — do not rename fields without updating the client.
type Email struct {
	ID          string            `json:"id"`
	Source      string            `json:"source"`
	From        string            `json:"from"`
	To          []string          `json:"to"`
	Cc          []string          `json:"cc"`
	Bcc         []string          `json:"bcc"`
	ReplyTo     string            `json:"replyTo,omitempty"`
	Subject     string            `json:"subject"`
	Text        string            `json:"text,omitempty"`
	HTML        string            `json:"html,omitempty"`
	Headers     map[string]string `json:"headers"`
	Attachments []Attachment      `json:"attachments"`
	// Payload as received: MIME for SMTP/SES raw sends, request body for HTTP APIs.
	Raw        string `json:"raw,omitempty"`
	ReceivedAt string `json:"receivedAt"`
	Read       bool   `json:"read"`
	// Computed once in Add; List would otherwise re-run the regexes per fetch.
	snippet string
}

// Summary is the listing shape sent to the UI (no bodies/attachments).
type Summary struct {
	ID             string   `json:"id"`
	Source         string   `json:"source"`
	From           string   `json:"from"`
	To             []string `json:"to"`
	Subject        string   `json:"subject"`
	ReceivedAt     string   `json:"receivedAt"`
	Read           bool     `json:"read"`
	HasAttachments bool     `json:"hasAttachments"`
	Snippet        string   `json:"snippet"`
}

// Store is the in-memory mailbox with change notification for the SSE stream.
type Store struct {
	mu     sync.Mutex
	emails []*Email
	subs   map[chan struct{}]struct{}
}

func New() *Store {
	return &Store{subs: make(map[chan struct{}]struct{})}
}

// Subscribe returns a channel that receives a signal on every mailbox change.
// Call the returned cancel func when done.
func (s *Store) Subscribe() (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	s.mu.Lock()
	s.subs[ch] = struct{}{}
	s.mu.Unlock()
	return ch, func() {
		s.mu.Lock()
		delete(s.subs, ch)
		s.mu.Unlock()
	}
}

// notify must be called with s.mu held.
func (s *Store) notify() {
	for ch := range s.subs {
		select {
		case ch <- struct{}{}:
		default: // subscriber already has a pending signal
		}
	}
}

// Notify wakes all SSE subscribers without a mailbox change (e.g. when the
// error-testing state changes and open UIs should refresh).
func (s *Store) Notify() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.notify()
}

func nowISO() string {
	return time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
}

// Add stores a message (ID/receivedAt/read are assigned here) and returns it.
// Nil slices/maps are normalized so the JSON API always emits [] and {}.
func (s *Store) Add(email Email) Email {
	email.ID = uuid.NewString()
	email.ReceivedAt = nowISO()
	email.Read = false
	if email.To == nil {
		email.To = []string{}
	}
	if email.Cc == nil {
		email.Cc = []string{}
	}
	if email.Bcc == nil {
		email.Bcc = []string{}
	}
	if email.Headers == nil {
		email.Headers = map[string]string{}
	}
	if email.Attachments == nil {
		email.Attachments = []Attachment{}
	}
	email.snippet = snippet(&email)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.emails = append([]*Email{&email}, s.emails...)
	if len(s.emails) > maxMessages {
		s.emails = s.emails[:maxMessages]
	}
	s.notify()
	return email
}

func (s *Store) List() []Summary {
	s.mu.Lock()
	defer s.mu.Unlock()
	summaries := make([]Summary, len(s.emails))
	for i, e := range s.emails {
		summaries[i] = Summary{
			ID:             e.ID,
			Source:         e.Source,
			From:           e.From,
			To:             e.To,
			Subject:        e.Subject,
			ReceivedAt:     e.ReceivedAt,
			Read:           e.Read,
			HasAttachments: len(e.Attachments) > 0,
			Snippet:        e.snippet,
		}
	}
	return summaries
}

// Get returns a copy of the message, or false if it does not exist.
func (s *Store) Get(id string) (Email, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.emails {
		if e.ID == id {
			return *e, true
		}
	}
	return Email{}, false
}

func (s *Store) SetRead(id string, read bool) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, e := range s.emails {
		if e.ID == id {
			if e.Read != read {
				e.Read = read
				s.notify()
			}
			return true
		}
	}
	return false
}

func (s *Store) MarkAllRead() {
	s.mu.Lock()
	defer s.mu.Unlock()
	changed := false
	for _, e := range s.emails {
		if !e.Read {
			e.Read = true
			changed = true
		}
	}
	if changed {
		s.notify()
	}
}

func (s *Store) Remove(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, e := range s.emails {
		if e.ID == id {
			s.emails = append(s.emails[:i], s.emails[i+1:]...)
			s.notify()
			return true
		}
	}
	return false
}

func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emails = nil
	s.notify()
}

// Go's RE2 has no backreferences, so the block regex matches any of the four
// closing tags instead of the exact opener — close enough for a 140-char snippet.
var (
	reBlocks   = regexp.MustCompile(`(?is)<(?:style|script|head|title)[^>]*>.*?</(?:style|script|head|title)\s*>`)
	reComments = regexp.MustCompile(`(?s)<!--.*?-->`)
	reTags     = regexp.MustCompile(`<[^>]*>`)
	reSpace    = regexp.MustCompile(`\s+`)
	entities   = strings.NewReplacer(
		"&nbsp;", " ", "&amp;", "&", "&lt;", "<", "&gt;", ">",
		"&#39;", "'", "&apos;", "'", "&quot;", `"`,
	)
)

// snippet extracts visible text only: drop style/script/head blocks and
// comments before stripping tags. Mirrors the TS snippetSource logic.
func snippet(e *Email) string {
	source := e.Text
	if strings.TrimSpace(source) == "" {
		if e.HTML == "" {
			return ""
		}
		source = reBlocks.ReplaceAllString(e.HTML, " ")
		source = reComments.ReplaceAllString(source, " ")
		source = reTags.ReplaceAllString(source, " ")
		source = entities.Replace(source)
	}
	source = strings.TrimSpace(reSpace.ReplaceAllString(source, " "))
	if len(source) > 140 {
		source = string([]rune(source)[:min(140, len([]rune(source)))])
	}
	return source
}
