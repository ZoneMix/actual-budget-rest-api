# Multi-stage build for production
FROM node:24-alpine AS builder

# Install build dependencies needed for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
# Skip lifecycle scripts (like husky prepare) but then rebuild better-sqlite3 native bindings
RUN npm ci --omit=dev --omit=optional --ignore-scripts && \
    npm rebuild better-sqlite3 && \
    npm cache clean --force

# Production stage
FROM node:24-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Copy dependencies from builder (includes compiled native modules)
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs src ./src

# Switch to non-root user
USER nodejs

EXPOSE 3000

CMD ["node", "src/server.js"]