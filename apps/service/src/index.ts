
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { createYoga } from 'graphql-yoga';
import { builder } from './schema/builder';
import { globalLogger } from './services/log.service';
import { resolveDomainUser, toWebHeaders } from './services/auth.service';
import { eq } from 'drizzle-orm';
import { GraphQLError, type ASTNode, type ValidationContext, type ASTVisitor } from 'graphql';

// Import schema definitions
import { auth } from './api/auth';
import './schema/config';
import './schema/football';
import './schema/workers';
import './schema/catalog';
import './schema/graphics';

// Database instances for development login overrides
import { db } from './db';
import * as schema from './db/schema';

/**
 * GraphQL Depth Limit Validation Rule
 * Prevents deeply nested queries that could exhaust database resources.
 * Maximum nesting depth: 10 levels (e.g. league > seasons > teams > venue is 4).
 */
const MAX_QUERY_DEPTH = 10;

function measureDepth(node: ASTNode, depth: number): number {
    if ('selectionSet' in node && node.selectionSet) {
        return Math.max(...node.selectionSet.selections.map(s => measureDepth(s, depth + 1)));
    }
    return depth;
}

function depthLimitRule(context: ValidationContext): ASTVisitor {
    return {
        OperationDefinition(node) {
            const depth = measureDepth(node, 0);
            if (depth > MAX_QUERY_DEPTH) {
                context.reportError(
                    new GraphQLError(
                        `Query depth ${depth} exceeds maximum allowed depth of ${MAX_QUERY_DEPTH}`
                    )
                );
            }
        }
    };
}

const yoga = createYoga<{
    req: FastifyRequest
    reply: FastifyReply
}>({
    schema: builder.toSchema(),
    plugins: [
        {
            onValidate({ addValidationRule }: { addValidationRule: (rule: (ctx: ValidationContext) => ASTVisitor) => void }) {
                addValidationRule(depthLimitRule);
            }
        }
    ],
    context: async ({ req }) => {
        const headers = toWebHeaders(req.headers);

        let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
        try {
            session = await auth.api.getSession({ headers });
        } catch {
            // Malformed or expired cookie — treat as unauthenticated Guest
        }

        if (!session?.user?.id) {
            return { req, user: undefined };
        }

        // Resolve domain user via cached authLinks bridge lookup
        const domainUser = await resolveDomainUser(session.user.id);

        return {
            req,
            user: domainUser
                ? { id: domainUser.id, roles: domainUser.roles }
                : { id: session.user.id, roles: ['user'] }
        };
    },
    // We use fastify's built-in error handling
    logging: globalLogger
})

import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';

const server = Fastify({
    logger: false
})

server.register(fastifyCookie);

// Global rate limit: 100 requests per minute per IP
server.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
});

server.register(fastifyCors, {
    origin: (origin, cb) => {
        if (!origin || /localhost:517[4-5]/.test(origin) || /127\.0\.0\.1:517[4-5]/.test(origin)) {
            cb(null, true);
            return;
        }
        // cb(new Error("Not allowed"), false);
        // FIXME: For development, just allow all origins if not explicitly one of the vite ones
        cb(null, true);
    },
    credentials: true,
});

/**
 * Domain User Resolution Endpoint
 * Takes the BetterAuth session cookie and resolves the domain user (UUID + roles)
 * via the authLinks bridge table.
 */
server.get('/api/auth/me', async (request, reply) => {
    const headers = toWebHeaders(request.headers);
    const session = await auth.api.getSession({ headers });

    if (!session?.user?.id) {
        return reply.status(200).send({ user: null });
    }

    const domainUser = await resolveDomainUser(session.user.id);

    return reply.status(200).send({
        user: domainUser ?? { id: session.user.id, roles: ['user'] }
    });
});

/**
 * Development Impersonation Endpoint
 * Bypasses all security to force-mint a real Better Auth session cookie for ANY given role.
 */
server.post('/api/auth/dev-login', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
        return reply.status(403).send({ error: 'Forbidden in production' });
    }

    const { role } = request.body as { role: string };
    const validRoles = ['admin', 'user', 'guest'];

    if (!validRoles.includes(role)) {
        return reply.status(400).send({ error: 'Invalid role' });
    }

    const email = `dev-${role}@ultratable.local`;

    // 1. Check if the domain user exists
    const domainUsers = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    let devUser = domainUsers[0];

    if (!devUser) {
        console.info(`[Dev Login] Seeding missing domain user for role: ${role}...`);
        const insertedUsers = await db.insert(schema.users).values({
            name: `Dev ${role}`,
            email: email,
            roles: [role],
            emailVerified: true
        }).returning();
        devUser = insertedUsers[0];
    }

    // 2. Check if the auth provider user exists natively in BetterAuth
    const providerUsers = await db.select().from(schema.authUsers).where(eq(schema.authUsers.email, email)).limit(1);
    const providerUser = providerUsers[0];

    if (!providerUser) {
        console.info(`[Dev Login] Seeding missing BetterAuth credentials for: ${email}...`);
        try {
            await auth.api.signUpEmail({
                body: {
                    email,
                    password: 'dev-password-123',
                    name: `Dev ${role}`
                }
            });

            // Retrieve the newly minted auth user to establish the bridge link
            const newProviderUsers = await db.select().from(schema.authUsers).where(eq(schema.authUsers.email, email)).limit(1);
            if (newProviderUsers[0]) {
                await db.insert(schema.authLinks).values({
                    authUserId: newProviderUsers[0].id,
                    domainUserId: devUser.id
                }).onConflictDoNothing();
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error('[Dev Login] Error seeding BetterAuth credentials:', message);
            return reply.status(500).send({ error: 'Failed to seed dev auth credentials' });
        }
    }

    console.info(`[Dev Login] Seed verified for: ${email}. The client may now natively sign-in.`);

    return reply.status(200).send({
        message: 'Dev User Seeded',
        user: devUser
    });
});

/**
 * Better Auth Endpoints
 */
server.all('/api/auth/*', async (request, reply) => {
    try {
        // Fastify CORS evaluates dynamically in onSend which BetterAuth bypasses.
        // We manually write the core CORS headers for valid origins directly to the stream.
        const origin = request.headers.origin;
        if (origin && (/localhost:517[4-5]/.test(origin) || /127\.0\.0\.1:517[4-5]/.test(origin))) {
            reply.raw.setHeader('Access-Control-Allow-Origin', origin);
            reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
        }

        // Construct request URL
        const url = new URL(request.url, `http://${request.headers.host}`);

        // Convert Fastify headers to standard Headers object
        const headers = new Headers();
        Object.entries(request.headers).forEach(([key, value]) => {
            if (value) headers.append(key, value.toString());
        });

        // Create Fetch API-compatible request
        const req = new Request(url.toString(), {
            method: request.method,
            headers,
            ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        });

        // Process authentication request natively
        const response = await auth.handler(req);

        // Forward response to client
        reply.status(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        reply.send(response.body ? await response.text() : null);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        server.log.error(`Authentication Error: ${message}`);
        reply.status(500).send({ error: "Internal authentication error" });
    }
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
