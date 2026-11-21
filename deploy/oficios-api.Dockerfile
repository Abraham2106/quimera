# oficios-api: build multi-stage, usuario no root, solo /tmp escribible en runtime.
# docker run --read-only --tmpfs /tmp ...

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/oficios ./apps/oficios
COPY packages ./packages
RUN corepack enable && pnpm install --frozen-lockfile \
  && pnpm --filter @quimera/oficios build:web

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
RUN mkdir -p /tmp && chown -R node:node /app /tmp
USER node
EXPOSE 8787
CMD ["pnpm", "--filter", "@quimera/oficios", "exec", "tsx", "src/server.ts"]
