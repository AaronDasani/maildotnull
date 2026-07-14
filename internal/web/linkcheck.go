package web

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// Checks are done server-side to avoid CORS; this only runs on the developer's machine.
const (
	linkCheckMaxURLs = 100
	linkCheckTimeout = 10 * time.Second
)

type linkCheckResult struct {
	URL    string `json:"url"`
	Status int    `json:"status,omitempty"`
	OK     bool   `json:"ok"`
	Error  string `json:"error,omitempty"`
}

var linkCheckClient = &http.Client{Timeout: linkCheckTimeout}

func checkURL(url string) linkCheckResult {
	res, err := linkCheckClient.Head(url)
	// Some servers reject HEAD; retry those with GET before reporting a failure.
	if err == nil && (res.StatusCode == http.StatusMethodNotAllowed || res.StatusCode == http.StatusNotImplemented) {
		res.Body.Close()
		res, err = linkCheckClient.Get(url)
	}
	if err != nil {
		return linkCheckResult{URL: url, OK: false, Error: err.Error()}
	}
	defer res.Body.Close()
	return linkCheckResult{URL: url, Status: res.StatusCode, OK: res.StatusCode >= 200 && res.StatusCode < 300}
}

func (s *server) handleLinkCheck(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URLs []string `json:"urls"`
	}
	if err := readJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, errBody{"Invalid JSON body"})
		return
	}

	seen := map[string]bool{}
	var urls []string
	for _, u := range body.URLs {
		lower := strings.ToLower(u)
		if (strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://")) && !seen[u] {
			seen[u] = true
			urls = append(urls, u)
		}
	}
	if len(urls) == 0 {
		writeJSON(w, http.StatusBadRequest, errBody{"urls must be a non-empty array of http(s) URLs"})
		return
	}
	if len(urls) > linkCheckMaxURLs {
		urls = urls[:linkCheckMaxURLs]
	}

	results := make([]linkCheckResult, len(urls))
	var wg sync.WaitGroup
	for i, u := range urls {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = checkURL(u)
		}()
	}
	wg.Wait()

	writeJSON(w, http.StatusOK, map[string][]linkCheckResult{"results": results})
}
