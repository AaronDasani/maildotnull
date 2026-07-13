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
RUN npm install -g pnpm@10.30.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist
USER node
# Web UI / provider APIs on 8025, SMTP on 1025, STARTTLS on 1587, SMTPS on 1465
EXPOSE 8025 1025 1587 1465
CMD ["node", "dist/server/index.js"]
