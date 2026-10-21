# Multi-stage production build.
# Base image is Node 24 LTS (alpine), pinned by digest. To bump: pick the new digest from
# https://hub.docker.com/_/node (tag 24-alpine) and update NODE_IMAGE below.
ARG NODE_IMAGE=node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81

FROM ${NODE_IMAGE} AS builder

# Build dependencies for native modules (better-sqlite3)
RUN apk upgrade --no-cache && apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
# Skip lifecycle scripts (husky prepare) then rebuild the native binding explicitly
RUN npm ci --omit=dev --omit=optional --ignore-scripts && \
    npm rebuild better-sqlite3 && \
    npm cache clean --force

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE}

ENV NODE_ENV=production

# Apply alpine security updates on top of the pinned base (e.g. openssl 3.5.8 for CVE-2026-14456),
# drop the bundled package managers (unused at runtime, recurring source of
# image-scan findings. Then create the unprivileged runtime user.
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn* && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# eMudhra intermediate CA compromise (2026-10-20, https://emudhra.we-have-a-problem.com/):
# distrust emSign ECC Root CA - G3 in the Alpine system store (Alpine no longer ships
# AAA Certificate Services). Node carries its own roots, so NODE_OPTIONS below points it at
# this store too. The last test fails the build if either root is still in the bundle.
# Same step as homelab umbrel-services/*/Dockerfile (homelab 82e3fc1).
RUN apk add --no-cache ca-certificates \
 && sed -i -e "s|^mozilla/emSign_ECC_Root_CA_-_G3.crt|!&|" /etc/ca-certificates.conf \
 && update-ca-certificates \
 && for f in /usr/share/ca-certificates/mozilla/emSign_ECC_Root_CA_-_G3.crt \
             /usr/share/ca-certificates/mozilla/Comodo_AAA_Services_root.crt; do \
      [ ! -f "$f" ] || ! grep -qxF "$(sed -n 3p "$f")" /etc/ssl/certs/ca-certificates.crt || exit 1; \
    done

ENV NODE_OPTIONS=--use-openssl-ca

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs src ./src

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/v2/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]
