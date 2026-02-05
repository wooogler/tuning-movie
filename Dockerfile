# Multi-stage build for production deployment
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/

# Install dependencies
RUN npm ci

# Copy source code
COPY apps/backend ./apps/backend
COPY apps/frontend ./apps/frontend

# Build frontend
RUN npm run build --workspace=apps/frontend

# Build backend
RUN npm run build --workspace=apps/backend

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/frontend/dist ./apps/frontend/dist

# Copy database schema and seed files (needed for runtime DB initialization)
COPY apps/backend/src/db ./apps/backend/src/db

# Copy startup script
COPY apps/backend/start.sh ./apps/backend/start.sh
RUN chmod +x ./apps/backend/start.sh

# Create data directory for SQLite database
RUN mkdir -p ./apps/backend/data

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application with initialization script
CMD ["./apps/backend/start.sh"]
