import { createYoga } from 'graphql-yoga';
import { createServer } from 'node:http';
import { builder } from './schema/builder';

// Import schema definitions
import './schema/config';
import './schema/football';
import './schema/workers';
import './schema/catalog';

const yoga = createYoga({
    schema: builder.toSchema(),
    context: () => ({
        // Add context here (auth, db, etc.)
    }),
    cors: {
        origin: '*',
        methods: ['POST', 'GET', 'OPTIONS'],
    }
});

const server = createServer(yoga);

server.listen(4000, '127.0.0.1', () => {
    console.info('Server is running on http://127.0.0.1:4000/graphql');
});
