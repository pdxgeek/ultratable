import net from 'net';

const port = Number(process.argv[2]);
const host = process.argv[3] || '127.0.0.1';
const timeoutMs = 30000;

if (!port) {
    console.error('Usage: node scripts/wait-for-port.js <port> [host]');
    process.exit(2);
}

const start = Date.now();

const tryConnect = () => {
    if (Date.now() - start > timeoutMs) {
        console.error(`wait-for-port: timed out after ${timeoutMs}ms waiting for ${host}:${port}`);
        process.exit(1);
    }
    const sock = net.connect(port, host);
    sock.once('connect', () => {
        sock.end();
        process.exit(0);
    });
    sock.once('error', () => {
        sock.destroy();
        setTimeout(tryConnect, 200);
    });
};

tryConnect();
