#!/bin/bash

# Define the ports
SERVICE_PORT=4000
ADMIN_PORT=5174
WEB_PORT=5175

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_port() {
  local port=$1
  local name=$2
  
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$port | grep -q '200\|404'; then
    echo -e "${GREEN}✓ ${name} (Port ${port}) is healthy${NC}"
    return 0
  else
    # Also check if it's accepting connections but maybe returning a 500 or just upgrading connection (like websockets)
    if curl -s http://127.0.0.1:$port > /dev/null; then
       echo -e "${GREEN}✓ ${name} (Port ${port}) is accepting connections${NC}"
       return 0
    else
       echo -e "${RED}✗ ${name} (Port ${port}) is down or unreachable${NC}"
       return 1
    fi
  fi
}

echo "Running health checks..."
echo "------------------------"

all_healthy=true

check_port $SERVICE_PORT "Service (GraphQL API)" || all_healthy=false
check_port $ADMIN_PORT "Admin UI" || all_healthy=false
check_port $WEB_PORT "Web App" || all_healthy=false

echo "------------------------"

if [ "$all_healthy" = true ]; then
  echo -e "${GREEN}All systems are go!${NC}"
  exit 0
else
  echo -e "${RED}One or more services are down.${NC}"
  # Check if anything is running
  if ! lsof -iTCP:$SERVICE_PORT,$ADMIN_PORT,$WEB_PORT -sTCP:LISTEN -P -n > /dev/null; then
      echo "It looks like none of the servers are running. Did you run 'npm run start:all'?"
  fi
  exit 1
fi
