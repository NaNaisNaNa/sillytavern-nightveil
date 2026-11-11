import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
async function serve(request, response) {
    try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/denied.css') {
            response.writeHead(200, { 'Content-Type': 'text/css' });
            response.end('.external { background: white !important; color: black !important; }');
            return;
        }
        const relative = decodeURIComponent(url.pathname).slice(1) || 'demo/index.html';
        const target = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
        const inside = path.relative(root, target);
        if (inside.startsWith('..') || path.isAbsolute(inside) || inside.split(path.sep).includes('.git')) {
            response.writeHead(403); response.end('Forbidden'); return;
        }
        const bytes = await readFile(target);
        response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(bytes);
    } catch { response.writeHead(404); response.end('Not found'); }
}
const servers = [4173, 4174].map((port) => {
    const server = http.createServer(serve);
    server.listen(port, '127.0.0.1', () => console.log('Nightveil fixture server: http://127.0.0.1:' + port + '/demo/'));
    return server;
});
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { for (const server of servers) server.close(); });
