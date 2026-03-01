import { spawn, exec } from 'child_process';
import net from 'net';

const API_PORT = 8080;
const ADMIN_PORT = 5174;
const WEB_PORT = 5175;

function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true); // Port is in use
            } else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(false); // Port is free
        });
        server.listen(port);
    });
}

function killProcessesOnPort(port) {
    return new Promise((resolve) => {
        exec(`lsof -t -i:${port}`, (error, stdout) => {
            if (error || !stdout) {
                // No process found
                return resolve();
            }

            const pids = stdout.trim().split('\n');
            console.log(`Killing processes on port ${port}: PIDs ${pids.join(', ')}`);

            exec(`kill -9 ${pids.join(' ')}`, () => {
                resolve();
            });
        });
    });
}

async function run() {
    console.log(`Checking if development environment is already running...`);

    const apiInUse = await isPortInUse(API_PORT);
    const adminInUse = await isPortInUse(ADMIN_PORT);
    const webInUse = await isPortInUse(WEB_PORT);

    if (apiInUse || adminInUse || webInUse) {
        console.log(`\n===============================================================`);
        console.log(`⚠️  Development servers are already running!`);
        console.log(`Terminating old processes to start a fresh instance...`);
        console.log(`===============================================================\n`);

        await Promise.all([
            killProcessesOnPort(API_PORT),
            killProcessesOnPort(ADMIN_PORT),
            killProcessesOnPort(WEB_PORT)
        ]);

        // Give OS a moment to free the network sockets
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log('Starting all services cleanly...');

    // Spawn concurrently
    const child = spawn('npx', ['concurrently', '"npm:start:service"', '"npm:start:admin"', '"npm:start:web"'], {
        stdio: 'inherit',
        shell: true
    });

    child.on('close', (code) => {
        process.exit(code);
    });
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
