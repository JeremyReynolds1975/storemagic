/**
 * StoreMagic — Proxy Server
 * ─────────────────────────
 * Sits between the browser and Shopify's Admin API to solve CORS.
 * Also serves the storemagic.html frontend on /.
 *
 * Usage:
 *   npm install
 *   node server.js
 *
 * Then open http://localhost:3000
 *
 * Environment variables (optional — can also be set via Settings in the UI):
 *   PORT            Port to listen on (default: 3000)
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

// ── CORS HEADERS ──────────────────────────────────────────────────────────────
function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Shopify-Access-Token, X-Shop-Domain, X-Api-Version');
}

// ── JSON RESPONSE HELPERS ─────────────────────────────────────────────────────
function sendJSON(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, message) {
  sendJSON(res, status, { error: message });
}

// ── COLLECT REQUEST BODY ──────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// ── PROXY A REQUEST TO SHOPIFY ────────────────────────────────────────────────
function proxyToShopify({ domain, token, apiVersion, shopifyPath, method, body }) {
  return new Promise((resolve, reject) => {
    const shopifyHost = `${domain}.myshopify.com`;
    const fullPath = `/admin/api/${apiVersion}/${shopifyPath}`;

    const options = {
      hostname: shopifyHost,
      path: fullPath,
      method: method || 'GET',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const proxyReq = https.request(options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', chunk => chunks.push(chunk));
      proxyRes.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({ status: proxyRes.statusCode, body: raw, headers: proxyRes.headers });
      });
    });

    proxyReq.on('error', reject);

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
}

// ── REQUEST ROUTER ────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // ── Preflight CORS ──
  if (req.method === 'OPTIONS') {
    setCORSHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  setCORSHeaders(res);

  // ── Serve the frontend HTML ──
  if (pathname === '/' || pathname === '/index.html') {
    const htmlPath = path.join(__dirname, 'storemagic.html');
    if (!fs.existsSync(htmlPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('storemagic.html not found. Place it in the same directory as server.js.');
      return;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // ── Health check ──
  if (pathname === '/health') {
    sendJSON(res, 200, { status: 'ok', service: 'StoreMagic Proxy', time: new Date().toISOString() });
    return;
  }

  // ── Shopify Proxy ──
  // All requests to /shopify/* are proxied to Shopify's Admin API.
  // Required headers from the browser:
  //   X-Shop-Domain      — e.g. "my-store"
  //   X-Shopify-Access-Token — the Admin API token
  //   X-Api-Version      — e.g. "2025-07"
  if (pathname.startsWith('/shopify/')) {
    const domain = req.headers['x-shop-domain'];
    const token  = req.headers['x-shopify-access-token'];
    const version = req.headers['x-api-version'] || '2025-07';

    if (!domain || !token) {
      sendError(res, 400, 'Missing required headers: X-Shop-Domain and X-Shopify-Access-Token');
      return;
    }

    // Strip the /shopify/ prefix to get the Shopify API path
    const shopifyPath = pathname.replace(/^\/shopify\//, '');

    let body = null;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      body = await readBody(req);
    }

    try {
      console.log(`[Shopify] ${req.method} ${domain}.myshopify.com/admin/api/${version}/${shopifyPath}`);
      const result = await proxyToShopify({ domain, token, apiVersion: version, shopifyPath, method: req.method, body });

      res.writeHead(result.status, {
        'Content-Type': 'application/json',
      });
      res.end(result.body);
    } catch (err) {
      console.error('[Shopify proxy error]', err.message);
      sendError(res, 502, `Shopify proxy error: ${err.message}`);
    }
    return;
  }

  // ── 404 ──
  sendError(res, 404, `Route not found: ${pathname}`);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ✦  StoreMagic Proxy Server');
  console.log('  ─────────────────────────────────────');
  console.log(`  🌐  Frontend:  http://localhost:${PORT}`);
  console.log(`  🔀  Shopify:   http://localhost:${PORT}/shopify/*`);
  console.log(`  💚  Health:    http://localhost:${PORT}/health`);
  console.log('  ─────────────────────────────────────');
  console.log('  Place storemagic.html in the same folder.');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗  Port ${PORT} is already in use. Set a different port:\n     PORT=3001 node server.js\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
