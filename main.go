// MailDotNull — a local mail catcher that emulates the HTTP send APIs of
// popular email providers. Single binary: Go server + embedded Vite SPA.
package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"

	"github.com/maildotnull/maildotnull/internal/smtpd"
	"github.com/maildotnull/maildotnull/internal/store"
	"github.com/maildotnull/maildotnull/internal/web"
)

// The Vite client build must exist before `go build` (see the pnpm build
// script); the binary is self-contained after that.
//
//go:embed all:dist/client
var clientFS embed.FS

func main() {
	log.SetFlags(0)

	spa, err := fs.Sub(clientFS, "dist/client")
	if err != nil {
		log.Fatal(err)
	}

	st := store.New()

	if err := smtpd.Start(st); err != nil {
		log.Fatalf("[maildotnull] SMTP startup failed: %v", err)
	}

	port := os.Getenv("MAILDOTNULL_HTTP_PORT")
	if port == "" {
		port = "8025"
	}
	log.Printf("[maildotnull] web UI and provider APIs listening on port %s (all interfaces)", port)
	// "[::]:" binds dual-stack so rootless podman/pasta can forward host ::1
	// (localhost) connections as well as IPv4.
	if err := http.ListenAndServe("[::]:"+port, web.NewHandler(st, spa)); err != nil {
		log.Fatalf("[maildotnull] web server failed: %v", err)
	}
}
