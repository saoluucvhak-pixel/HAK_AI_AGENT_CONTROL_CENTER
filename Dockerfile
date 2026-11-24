# HAK Control Center: image for containers/CI. No runtime npm dependencies (Node built-ins only).
# The tag (not a digest) is pinned here; pin the digest in your registry policy.

FROM node:22-bookworm-slim AS base
# git: worktrees/bundles. ca-certificates: HTTPS. util-linux: `unshare` (network sandbox when the host allows it).
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates util-linux \
 && rm -rf /var/lib/apt/lists/*
# Non-root user; /data and /tmp are the only writable locations.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin hak \
 && mkdir -p /data && chown hak:hak /data
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY web ./web
COPY scripts/hak.mjs scripts/hak.mjs
ENV NODE_ENV=production HAK_DATA_DIR=/data HAK_SANDBOX=netns

# Acceptance image: the repository test-suite runs inside the hardened container (see .github/workflows/container-acceptance.yml).
FROM base AS acceptance
COPY tests ./tests
COPY test ./test
USER hak
ENTRYPOINT ["node","--test"]

# Runtime image (default target = last stage).
FROM base AS runtime
USER hak
VOLUME ["/data"]
EXPOSE 4317
# docker run IMAGE review --repo /work ...   |   write ...   |   publish ...   |   -p 127.0.0.1:4317:4317 -e HAK_BIND=0.0.0.0 IMAGE serve
ENTRYPOINT ["node","scripts/hak.mjs"]
CMD ["help"]
