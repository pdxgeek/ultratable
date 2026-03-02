#!/bin/bash
set -e

echo "🐳 Building and deploying UltraTable service..."
docker compose up --build -d service

echo "✅ Docker deployment complete! Service is running on port 8080."
docker compose logs --tail=10 service
