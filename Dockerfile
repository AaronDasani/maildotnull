FROM node:24-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@10.30.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8025
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER node
# Web UI / provider APIs on 8025, SMTP on 1025, STARTTLS on 1587, SMTPS on 1465
EXPOSE 8025 1025 1587 1465
# Podman overrides the HOSTNAME env var with the container hostname, which Next.js
# standalone uses as the bind address — force 0.0.0.0 at start time instead.
CMD ["sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
