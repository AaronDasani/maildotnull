# Stage 1: build the Vite SPA.
FROM --platform=$BUILDPLATFORM node:24-alpine AS client
WORKDIR /app
RUN npm install -g pnpm@10.30.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec vite build

# Stage 2: build the Go binary with the SPA embedded (cross-compiles natively).
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS server
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY internal ./internal
COPY --from=client /app/dist/client ./dist/client
ARG TARGETOS TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /maildotnull .

# Stage 3: static binary on distroless (includes CA certs for link checking).
FROM gcr.io/distroless/static:nonroot
COPY --from=server /maildotnull /maildotnull
# Web UI / provider APIs on 8025, SMTP on 1025, STARTTLS on 1587, SMTPS on 1465
EXPOSE 8025 1025 1587 1465
ENTRYPOINT ["/maildotnull"]
