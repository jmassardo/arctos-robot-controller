# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Build frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci && npm run build

# Production stage
FROM node:18-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S arctos -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=arctos:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=arctos:nodejs /app/server.js ./
COPY --from=builder --chown=arctos:nodejs /app/lib ./lib
COPY --from=builder --chown=arctos:nodejs /app/client/build ./client/build
COPY --from=builder --chown=arctos:nodejs /app/package.json ./

# Create data directories
RUN mkdir -p /app/data /app/config /app/logs && \
    chown -R arctos:nodejs /app/data /app/config /app/logs

# Install production dependencies
RUN apk add --no-cache sqlite

USER arctos

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => { \
    process.exit(res.statusCode === 200 ? 0 : 1) \
  }).on('error', () => process.exit(1))"

CMD ["npm", "start"]