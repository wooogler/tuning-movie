# Multi-stage build for production deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Install native build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy workspace files before install (monorepo-aware npm ci)
COPY package*.json ./
COPY apps ./apps

# Install dependencies and build only runtime apps
RUN npm install
RUN npm run build --workspace=apps/frontend
RUN npm run build --workspace=apps/backend

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install native build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Install production dependencies for the monorepo runtime
COPY package*.json ./
COPY apps ./apps
RUN npm install --omit=dev

# Copy built files from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/frontend/dist ./apps/frontend/dist

# Startup script and data dir
COPY apps/backend/start.sh ./apps/backend/start.sh
RUN chmod +x ./apps/backend/start.sh
RUN mkdir -p ./apps/backend/data

EXPOSE 3000
ENV NODE_ENV=production

# Start the application with initialization script
CMD ["./apps/backend/start.sh"]
