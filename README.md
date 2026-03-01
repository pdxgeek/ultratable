# UltraTable

UltraTable is a real-time fantasy sports platform. It consists of multiple applications managed in a monorepo setup.

## Project Structure

- `/apps/service` - The core BFF (Back-end for Front-end) service. Built with Fastify, GraphQL Yoga, and Drizzle ORM.
- `/apps/admin` - Administrative interface.
- `/apps/web` - Main consumer-facing web application.

## Local Development

We use Docker Compose to provide a seamless local development environment that closely mirrors our production Kubernetes deployment.

### Prerequisites
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)
- Node.js (for local CLI tooling, though the service runs in Docker)

### Starting the Service

The Fastify GraphQL service relies on external integrations like Supabase and API-Football. Ensure your `.env` file is populated at `apps/service/.env` before starting.

```bash
# Start the service in the background
docker compose up -d
```

This will:
1. Build the `service` Docker image.
2. Inject your `apps/service/.env` secrets.
3. Start the service, binding it to `localhost:8080`.

### Accessing the API

Once the container is running, you can access the GraphQL Yoga playground to test queries and mutations:

- **GraphQL Endpoint:** `http://localhost:8080/graphql`
- **Health Check (Kubernetes Probes):** `http://localhost:8080/health`

### Viewing Logs

To view the stdout logs (powered by Fastify Pino):

```bash
docker compose logs -f service
```

### Stopping the Applications

To tear down the environment:

```bash
docker compose down
```
