#!/bin/bash
set -e

# Agent guard — refuse to run when invoked from an AI-agent session.
# The operator's dev environment is not the agent's to mutate. The agent
# should propose changes; the human runs them. See AI_README_FIRST.MD §7.
if [ -n "$CLAUDECODE" ] || [ -n "$CLAUDE_CODE_ENTRYPOINT" ] || [ -n "$AI_AGENT" ] || [ -n "$ANTHROPIC_AGENT" ]; then
    if [ "$1" != "--i-am-the-human" ]; then
        echo "🛑 scripts/docker-deploy.sh refused to run in an AI-agent session." >&2
        echo "" >&2
        echo "What this script does: builds the apps/service container and brings it up via" >&2
        echo "docker compose, replacing whatever is currently running on the service port." >&2
        echo "Why this guard exists: the operator's docker daemon is not the agent's to mutate." >&2
        echo "" >&2
        echo "If you are the human operator and this heuristic misfired, re-run with --i-am-the-human." >&2
        exit 1
    fi
    shift  # consume the bypass flag so the rest of argv is clean
fi

echo "🐳 Building and deploying UltraTable service..."
docker compose up --build -d service

echo "✅ Docker deployment complete! Service is running on port 8080."
docker compose logs --tail=10 service
