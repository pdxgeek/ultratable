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
});

const server = createServer(yoga);

server.listen(4000, () => {
    console.info('Server is running on http://localhost:4000/graphql');
});
