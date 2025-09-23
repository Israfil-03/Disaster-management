# Syntax: docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy source
COPY src ./src

# Environment
ENV NODE_ENV=production

# The app listens on PORT (default set by platform); expose a default for local
EXPOSE 5174

# Start the server
CMD ["node", "./src/index.js"]
