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

# Copy only the service package file into the production directory
COPY apps/service/package.json ./ultratable-service/

# Navigate to the service directory and install production dependencies directly
WORKDIR /app/ultratable-service
RUN npm install --omit=dev --legacy-peer-deps

# Navigate back to root for the rest of the setup
WORKDIR /app

# Copy compiled code from builder stage
COPY --from=builder /app/apps/service/dist ./ultratable-service/dist
# Set permissions for the non-root 'node' user
RUN chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose the API port
EXPOSE 8080

# Start the application referencing the local node_modules
# Since the workdir is /app at runtime, we can either cd or use prefix
CMD ["npm", "run", "start", "--prefix", "ultratable-service"]
