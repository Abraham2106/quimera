# fiscal-outbox-worker: multi-stage, sin puertos públicos, usuario no root.
# docker run --read-only --tmpfs /tmp ...

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/fiscal-outbox ./packages/fiscal-outbox
COPY packages/core ./packages/core
COPY packages/data-exodus ./packages/data-exodus
RUN corepack enable && pnpm install --frozen-lockfile

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /tmp && chown -R node:node /app /tmp
USER node
CMD ["pnpm", "--filter", "@quimera/fiscal-outbox", "exec", "tsx", "src/worker/main.ts"]
