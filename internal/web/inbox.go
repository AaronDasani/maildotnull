package web

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/maildotnull/maildotnull/internal/store"
)

func (s *server) listMessages(w http.ResponseWriter, _ *http.Request) {
	list := s.store.List()
	if list == nil {
		list = []store.Summary{}
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *server) markAllRead(w http.ResponseWriter, _ *http.Request) {
	s.store.MarkAllRead()
	writeJSON(w, http.StatusOK, okBody)
}

func (s *server) clearMessages(w http.ResponseWriter, _ *http.Request) {
	s.store.Clear()
	writeJSON(w, http.StatusOK, okBody)
}

// attachmentMeta strips content from the detail payload; served separately.
type attachmentMeta struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int    `json:"size"`
	Index       int    `json:"index"`
}

// messageDetail is store.Email with attachment contents replaced by metadata.
type messageDetail struct {
	store.Email
	Attachments []attachmentMeta `json:"attachments"`
}

func (s *server) getMessage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	email, ok := s.store.Get(id)
	if !ok {
		notFound(w)
		return
	}
	s.store.SetRead(id, true)
	email.Read = true
	meta := make([]attachmentMeta, len(email.Attachments))
	for i, a := range email.Attachments {
		meta[i] = attachmentMeta{Filename: a.Filename, ContentType: a.ContentType, Size: a.Size, Index: i}
	}
	writeJSON(w, http.StatusOK, messageDetail{Email: email, Attachments: meta})
}

func (s *server) patchMessage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Read *bool `json:"read"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody{"Invalid JSON body"})
		return
	}
	if body.Read == nil {
		writeJSON(w, http.StatusBadRequest, errBody{"Expected { read: boolean }"})
		return
	}
	if !s.store.SetRead(r.PathValue("id"), *body.Read) {
		notFound(w)
		return
	}
	writeJSON(w, http.StatusOK, okBody)
}

func (s *server) deleteMessage(w http.ResponseWriter, r *http.Request) {
	if !s.store.Remove(r.PathValue("id")) {
		notFound(w)
		return
	}
	writeJSON(w, http.StatusOK, okBody)
}

func (s *server) getAttachment(w http.ResponseWriter, r *http.Request) {
	email, ok := s.store.Get(r.PathValue("id"))
	if !ok {
		notFound(w)
		return
	}
	index, err := strconv.Atoi(r.PathValue("index"))
	if err != nil || index < 0 || index >= len(email.Attachments) {
		notFound(w)
		return
	}
	a := email.Attachments[index]
	w.Header().Set("Content-Type", a.ContentType)
	filename := strings.ReplaceAll(a.Filename, `"`, "")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(a.Content)
}
