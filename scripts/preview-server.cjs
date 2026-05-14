const express = require('express');
const path = require('path');

// Check if http-proxy-middleware is installed. If not, we might need a simpler solution or install it.
// Wait, I cannot rely on a package I haven't installed.
// I can try to install it or use a simple pipe.

// Let's assume I can't easily install new packages without user confirmation (though I could run npm install).
// Better: update start.sh to install it if missing?
// Or: write a simple proxy handler using http.request.

const http = require('http');
const fs = require('fs');

const app = express();
const PORT = 3000;
const API_PORT = 3001;
const DIST_DIR = path.join(__dirname, '../dist');
const BASE_PATH = '/photo-splat-gallery';

// 1. Proxy /api requests to API server
app.use('/api', (req, res) => {
    const options = {
        hostname: 'localhost',
        port: API_PORT,
        path: '/api' + req.url,
        method: req.method,
        headers: req.headers,
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
        console.error(`API Proxy Error: ${e.message}`);
        res.status(502).send('Bad Gateway');
    });

    if (req.body) {
        // This is a naive stream pipe, might fail if body was already consumed (e.g. by body-parser).
        // Since we don't use body-parser globally here, req should be readable.
        req.pipe(proxyReq);
    } else {
        req.pipe(proxyReq);
    }
});

const PUBLIC_DIR = path.join(__dirname, '../public');

// 2. Serve dynamic content from public/ (splats, thumbnails, configs)
// This ensures newly created files are immediately available without rebuild
app.use(BASE_PATH + '/splats', express.static(path.join(PUBLIC_DIR, 'splats')));
app.use(BASE_PATH + '/thumbnails', express.static(path.join(PUBLIC_DIR, 'thumbnails')));
app.use(BASE_PATH + '/configs', express.static(path.join(PUBLIC_DIR, 'configs')));

// 3. Serve Static Files at Base Path (built assets from dist/)
app.use(BASE_PATH, express.static(DIST_DIR));

// 3. Handle SPA Routing (Fallback to index.html for non-asset requests)
app.use((req, res) => {
    // If it's a file request that wasn't found (e.g. 404 asset), send 404?
    // SPA fallback: usually for routes, not assets.
    // Check if it looks like an asset
    if (req.path.includes('.')) {
        res.status(404).send('Not Found');
        return;
    }
    res.sendFile(path.join(DIST_DIR, 'index.html'));
});

// 4. Redirect root to Base Path
app.get('/', (req, res) => {
    res.redirect(BASE_PATH + '/');
});

// Start
app.listen(PORT, () => {
    console.log(`🚀 Preview Server running at http://localhost:${PORT}${BASE_PATH}/`);
    console.log(`   Proxies /api to http://localhost:${API_PORT}`);
});
