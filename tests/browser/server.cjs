const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..', '..');
const bundle = esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'angular.mjs')],
    bundle: true,
    write: false,
    format: 'esm',
    nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)
}).outputFiles[0].contents;
const routes = {
    '/': ['tests/browser/angular.html', 'text/html'],
    '/autofill.js': ['autofill.js', 'text/javascript'],
    '/tests/browser/angular.mjs': ['tests/browser/angular.mjs', 'text/javascript']
};
http.createServer((req, res) => {
    if (req.url === '/tests/browser/angular.mjs') {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(bundle);
        return;
    }
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const route = routes[req.url];
    if (!route) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', route[1]);
    res.end(fs.readFileSync(path.join(root, route[0])));
}).listen(18765, '127.0.0.1', () => console.log('Angular audit fixture: http://127.0.0.1:18765'));
