# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install --no-install-recommends -y g++ make python3 \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NODE_ENV=production
ENV NITRO_PRESET=node-server
RUN rm -rf node_modules/.cache/nuxt .nuxt \
  && pnpm exec nuxt prepare \
  && pnpm run build:gcp

FROM dependencies AS production-dependencies
RUN pnpm prune --prod

FROM node:22-bookworm-slim AS runtime
ENV PNPM_HOME=/pnpm
ENV PATH=/opt/dam-python/bin:$PNPM_HOME:$PATH
RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates curl python3 python3-venv \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.17.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY server/utils/rag_parsers/requirements.txt /tmp/dam-rag-requirements.txt
RUN python3 -m venv /opt/dam-python \
  && pip install --no-cache-dir -r /tmp/dam-rag-requirements.txt \
  && rm /tmp/dam-rag-requirements.txt

COPY --from=build /app/.output ./.output
COPY scripts ./scripts
COPY server/database/migrations ./server/database/migrations
COPY server/utils/rag_parsers ./server/utils/rag_parsers

RUN groupadd --system dam \
  && useradd --system --gid dam --home-dir /app dam \
  && mkdir -p /var/lib/dam \
  && chown -R dam:dam /app /var/lib/dam

ENV NODE_ENV=production
ENV NITRO_PRESET=node-server
ENV HOST=0.0.0.0
ENV PORT=8080
ENV PYTHON_CMD=/opt/dam-python/bin/python
ENV DATABASE_PATH=/var/lib/dam/database.sqlite
ENV DATABASE_MIGRATIONS_DIR=/app/server/database/migrations
ENV LOCAL_DAM_STORAGE_DIR=/var/lib/dam/files

USER dam
EXPOSE 8080
VOLUME ["/var/lib/dam"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8080/api/health || exit 1

CMD ["pnpm", "run", "start:gcp"]
