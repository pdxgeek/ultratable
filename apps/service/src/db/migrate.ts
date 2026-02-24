import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
}

const runMigration = async () => {
    const migrationClient = postgres(databaseUrl, { max: 1 });
    const db = drizzle(migrationClient);

    console.log('Running migrations...');

    await migrate(db, {
        migrationsFolder: path.join(__dirname, '../../drizzle'),
    });

    console.log('Migrations complete!');

    await migrationClient.end();
};

runMigration().catch((err) => {
    console.error('Migration failed!');
    console.error(err);
    process.exit(1);
});
