import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { createYoga } from 'graphql-yoga';
import { builder } from './schema/builder';
import { globalLogger } from './services/log.service';

// Import schema definitions
import './schema/config';
import './schema/football';
import './schema/workers';
import './schema/catalog';
import './schema/graphics';

// Keep GraphQL Yoga setup the same, just wire up Fastify reply
const yoga = createYoga<{
    req: FastifyRequest
    reply: FastifyReply
}>({
    schema: builder.toSchema(),
    context: ({ req, reply }) => ({
        req,
        reply,
        // Add context here (auth, db, etc.)
    }),
    cors: {
        origin: '*',
        methods: ['POST', 'GET', 'OPTIONS'],
    },
    // We use fastify's built-in error handling
    logging: globalLogger
})

const server = Fastify({
    logger: false
})

/**
 * Standard Health Check for Kubernetes Probes
 */
server.get('/health', async (request, reply) => {
    return reply.status(200).send({ status: 'ok' });
});

/**
 * GraphQL Yoga Endpoint
 */
server.route({
    url: yoga.graphqlEndpoint,
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (req, reply) => {
        const response = await yoga.handleNodeRequestAndResponse(req, reply, {
            req,
            reply
        })
        response.headers.forEach((value, key) => {
            reply.header(key, value)
        })

        reply.status(response.status)
        reply.send(response.body)
        return reply
    }
})

/**
 * Graceful Shutdown Handling
 */
const signals = ['SIGINT', 'SIGTERM']
signals.forEach(signal => {
    process.on(signal, async () => {
        server.log.info(`[Server] Received ${signal}, starting graceful shutdown...`)
        await server.close()
        server.log.info('[Server] Closed successfully.')
        process.exit(0)
    })
})

const start = async () => {
    try {
        const host = process.env.HOST || '0.0.0.0'
        const port = Number(process.env.PORT) || 8080
        await server.listen({ host, port })
    } catch (err) {
        server.log.error(err)
        process.exit(1)
    }
}

start();
