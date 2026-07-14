package web

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/maildotnull/maildotnull/internal/faults"
)

type errorBody struct {
	Error string `json:"error"`
}

func (s *server) getErrorTesting(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, faults.Get())
}

func (s *server) putErrorTesting(w http.ResponseWriter, r *http.Request) {
	var body struct {
		HTTP         *string           `json:"http"`
		Providers    map[string]string `json:"providers"`
		SMTP         *string           `json:"smtp"`
		SMTPAuth     *string           `json:"smtpAuth"`
		DelaySeconds *float64          `json:"delaySeconds"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{"Invalid JSON body"})
		return
	}

	patch := faults.Patch{Providers: map[string]string{}}

	if body.HTTP != nil {
		if !faults.IsHTTPFaultMode(*body.HTTP) {
			writeJSON(w, http.StatusBadRequest, errorBody{
				fmt.Sprintf("Invalid http mode: %s (allowed: %s)", *body.HTTP, strings.Join(faults.HTTPFaultModes, ", ")),
			})
			return
		}
		patch.HTTP = *body.HTTP
	}

	for source, mode := range body.Providers {
		if !faults.IsHTTPSource(source) {
			writeJSON(w, http.StatusBadRequest, errorBody{"Unknown provider: " + source})
			return
		}
		if mode != "inherit" && !faults.IsHTTPFaultMode(mode) {
			writeJSON(w, http.StatusBadRequest, errorBody{
				fmt.Sprintf("Invalid mode for %s: %s (allowed: inherit, %s)", source, mode, strings.Join(faults.HTTPFaultModes, ", ")),
			})
			return
		}
		patch.Providers[source] = mode
	}

	if body.SMTP != nil {
		if !faults.IsSMTPFaultMode(*body.SMTP) {
			writeJSON(w, http.StatusBadRequest, errorBody{
				fmt.Sprintf("Invalid smtp mode: %s (allowed: %s)", *body.SMTP, strings.Join(faults.SMTPFaultModes, ", ")),
			})
			return
		}
		patch.SMTP = *body.SMTP
	}

	if body.SMTPAuth != nil {
		if *body.SMTPAuth != "optional" && *body.SMTPAuth != "required" {
			writeJSON(w, http.StatusBadRequest, errorBody{
				fmt.Sprintf("Invalid smtpAuth: %s (allowed: optional, required)", *body.SMTPAuth),
			})
			return
		}
		patch.SMTPAuth = *body.SMTPAuth
	}

	if body.DelaySeconds != nil {
		secs := *body.DelaySeconds
		if secs != float64(int(secs)) || secs < 1 || secs > 300 {
			writeJSON(w, http.StatusBadRequest, errorBody{"Invalid delaySeconds: must be a number between 1 and 300"})
			return
		}
		v := int(secs)
		patch.DelaySeconds = &v
	}

	updated := faults.Update(patch)
	// Piggyback on the mailbox SSE stream so open UIs refresh their view of the state.
	s.store.Notify()
	writeJSON(w, http.StatusOK, updated)
}
