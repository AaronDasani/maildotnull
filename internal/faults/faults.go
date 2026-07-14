// Package faults holds the error-testing state: simulated failures for the
// HTTP provider APIs and the SMTP listeners, controlled from the UI.
package faults

import (
	"net/http"
	"slices"
	"sync"
	"time"
)

// Fault modes applied to HTTP provider APIs.
var HTTPFaultModes = []string{"off", "delay", "rate-limit", "server-error", "timeout"}

// Fault modes applied to the SMTP listeners (at MAIL FROM).
var SMTPFaultModes = []string{"off", "delay", "timeout", "reject-temporary", "reject-permanent"}

// HTTPSources are the provider keys that accept per-provider overrides.
var HTTPSources = []string{"resend", "sendgrid", "mailjet", "mailgun", "postmark", "brevo", "ses"}

// A "timeout" fault can't hold the request forever; give up long after any sane client timeout.
const TimeoutHold = 5 * time.Minute

// State mirrors the TS ErrorTestingState JSON shape.
type State struct {
	HTTP string `json:"http"`
	// Per-provider overrides; "inherit" follows the global HTTP setting.
	Providers    map[string]string `json:"providers"`
	SMTP         string            `json:"smtp"`
	SMTPAuth     string            `json:"smtpAuth"`
	DelaySeconds int               `json:"delaySeconds"`
}

var (
	mu    sync.Mutex
	state = defaultState()
)

func defaultState() State {
	providers := make(map[string]string, len(HTTPSources))
	for _, s := range HTTPSources {
		providers[s] = "inherit"
	}
	return State{HTTP: "off", Providers: providers, SMTP: "off", SMTPAuth: "optional", DelaySeconds: 10}
}

// Get returns a copy of the current state (the Providers map is cloned).
func Get() State {
	mu.Lock()
	defer mu.Unlock()
	return cloneLocked()
}

func cloneLocked() State {
	s := state
	s.Providers = make(map[string]string, len(state.Providers))
	for k, v := range state.Providers {
		s.Providers[k] = v
	}
	return s
}

// Patch applies non-empty fields and returns the updated state.
type Patch struct {
	HTTP         string
	Providers    map[string]string
	SMTP         string
	SMTPAuth     string
	DelaySeconds *int
}

func Update(p Patch) State {
	mu.Lock()
	defer mu.Unlock()
	if p.HTTP != "" {
		state.HTTP = p.HTTP
	}
	for k, v := range p.Providers {
		state.Providers[k] = v
	}
	if p.SMTP != "" {
		state.SMTP = p.SMTP
	}
	if p.SMTPAuth != "" {
		state.SMTPAuth = p.SMTPAuth
	}
	if p.DelaySeconds != nil {
		state.DelaySeconds = *p.DelaySeconds
	}
	return cloneLocked()
}

// EffectiveHTTPFault resolves a provider's fault: its override, or the global setting.
func EffectiveHTTPFault(s State, source string) string {
	if override, ok := s.Providers[source]; ok && override != "inherit" {
		return override
	}
	return s.HTTP
}

func IsHTTPFaultMode(m string) bool { return slices.Contains(HTTPFaultModes, m) }
func IsSMTPFaultMode(m string) bool { return slices.Contains(SMTPFaultModes, m) }
func IsHTTPSource(s string) bool    { return slices.Contains(HTTPSources, s) }

type failureResponse struct {
	status  int
	body    string
	headers map[string]string
}

// Each provider's real error shape, so official SDKs raise their typed errors.
var failureResponses = map[string]map[string]failureResponse{
	"resend": {
		"rate-limit":   {429, `{"statusCode":429,"name":"rate_limit_exceeded","message":"Too many requests (simulated by MailDotNull)."}`, nil},
		"server-error": {500, `{"statusCode":500,"name":"application_error","message":"An unexpected error occurred (simulated by MailDotNull)."}`, nil},
	},
	"sendgrid": {
		"rate-limit":   {429, `{"errors":[{"message":"too many requests (simulated by MailDotNull)","field":null,"help":null}]}`, nil},
		"server-error": {500, `{"errors":[{"message":"internal server error (simulated by MailDotNull)","field":null,"help":null}]}`, nil},
	},
	"mailjet": {
		"rate-limit":   {429, `{"ErrorMessage":"Too many requests (simulated by MailDotNull).","StatusCode":429}`, nil},
		"server-error": {500, `{"ErrorMessage":"Internal server error (simulated by MailDotNull).","StatusCode":500}`, nil},
	},
	"mailgun": {
		"rate-limit":   {429, `{"message":"Too many requests (simulated by MailDotNull)."}`, nil},
		"server-error": {500, `{"message":"Internal server error (simulated by MailDotNull)."}`, nil},
	},
	"postmark": {
		"rate-limit":   {429, `{"ErrorCode":429,"Message":"Rate limit exceeded (simulated by MailDotNull)."}`, nil},
		"server-error": {500, `{"ErrorCode":0,"Message":"Internal server error (simulated by MailDotNull)."}`, nil},
	},
	"brevo": {
		"rate-limit":   {429, `{"code":"too_many_requests","message":"Too many requests (simulated by MailDotNull)."}`, nil},
		"server-error": {500, `{"code":"internal_error","message":"Internal server error (simulated by MailDotNull)."}`, nil},
	},
	"ses": {
		"rate-limit":   {429, `{"__type":"TooManyRequestsException","message":"Too many requests (simulated by MailDotNull)."}`, map[string]string{"x-amzn-errortype": "TooManyRequestsException"}},
		"server-error": {500, `{"__type":"InternalFailure","message":"Internal server error (simulated by MailDotNull)."}`, map[string]string{"x-amzn-errortype": "InternalFailure"}},
	},
}

// ApplyHTTPFault applies the configured fault for a provider. It returns true
// when it wrote an error response and the request must not proceed; false
// means continue (possibly after a delay).
func ApplyHTTPFault(w http.ResponseWriter, r *http.Request, source string) bool {
	s := Get()
	switch EffectiveHTTPFault(s, source) {
	case "off":
		return false
	case "delay":
		select {
		case <-time.After(time.Duration(s.DelaySeconds) * time.Second):
		case <-r.Context().Done():
		}
		return false
	case "timeout":
		// Hold the request open so the client's own timeout fires; 504 as a backstop.
		select {
		case <-time.After(TimeoutHold):
		case <-r.Context().Done():
			return true
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusGatewayTimeout)
		_, _ = w.Write([]byte(`{"message":"Simulated timeout (MailDotNull)."}`))
		return true
	default:
		f := failureResponses[source][EffectiveHTTPFault(s, source)]
		w.Header().Set("Content-Type", "application/json")
		for k, v := range f.headers {
			w.Header().Set(k, v)
		}
		w.WriteHeader(f.status)
		_, _ = w.Write([]byte(f.body))
		return true
	}
}
