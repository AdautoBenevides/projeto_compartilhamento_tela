# Multi-stage build for screen-share signaling server + coturn
FROM node:18-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-slim

WORKDIR /app

# Install coturn
RUN apt-get update && apt-get install -y \
    coturn \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for production install
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files
COPY --from=builder /app/dist ./dist
COPY coturn.conf ./

# Copy start script
COPY start.sh ./
RUN chmod +x start.sh

# Expose ports
# 3001 = signaling server (WebSocket)
# 3478 = STUN/TURN (UDP/TCP)
# 5349 = TURNS (TLS)
EXPOSE 3001 3478/udp 3478/tcp 5349/tcp

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["./start.sh"]
