package web

import (
	"encoding/json"
	"net/http"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	// Match the TS server's output: don't escape <, >, & in JSON strings.
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

type errBody struct {
	Message string `json:"message"`
}

func notFound(w http.ResponseWriter) {
	writeJSON(w, http.StatusNotFound, errBody{"Not found"})
}

// readJSON decodes the request body; on failure the caller sends the
// provider-specific "invalid JSON" shape.
func readJSON(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}

var okBody = map[string]bool{"ok": true}
