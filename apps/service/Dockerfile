# Build Stage
FROM node:22-alpine AS builder
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./
# Copy service package file
COPY apps/service/package.json ./apps/service/

# Install dependencies (including devDependencies for tsc)
RUN npm ci

# Copy the rest of the service source code
COPY apps/service ./apps/service

# Build the TypeScript code
RUN npm run build --workspace=apps/service

# Production Stage
FROM node:22-alpine AS runner
WORKDIR /app

# Set node environment to production
ENV NODE_ENV=production

# Copy root package files
COPY package.json package-lock.json ./
# Copy service package file
COPY apps/service/package.json ./apps/service/

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Copy compiled code from builder stage
COPY --from=builder /app/apps/service/dist ./apps/service/dist

# Set permissions for the non-root 'node' user
RUN chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose the API port
EXPOSE 8080

# Start the application
CMD ["npm", "run", "start", "--workspace=apps/service"]
