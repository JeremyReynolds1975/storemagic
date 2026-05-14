# StoreMagic — Setup Guide

AI-powered Shopify product page generator.

---

## Quick Start

### 1. Install Node.js
Download from https://nodejs.org (v18 or later)

### 2. Put all three files in one folder
```
your-folder/
  storemagic.html
  server.js
  package.json
```

### 3. Start the proxy server
```bash
node server.js
```

You'll see:
```
  ✦  StoreMagic Proxy Server
  ─────────────────────────────────────
  🌐  Frontend:  http://localhost:3000
  🔀  Shopify:   http://localhost:3000/shopify/*
  💚  Health:    http://localhost:3000/health
```

### 4. Open in your browser
Go to **http://localhost:3000**

> ⚠️ Do NOT open storemagic.html directly as a file — it must be served
> through the proxy for Shopify publishing to work.

---

## Getting Your API Keys

### Anthropic API Key
1. Go to https://console.anthropic.com
2. API Keys → Create Key
3. Copy the key (starts with `sk-ant-`)

### Shopify Admin API Token
1. Shopify Admin → Settings → Apps and sales channels
2. Develop apps → Create an app
3. Configuration → Admin API scopes: enable **write_products** and **read_products**
4. Install app → API credentials → Copy Admin API access token (starts with `shpat_`)

---

## Deploying to Production

### Option A — Any Node.js host (Railway, Render, Fly.io, Heroku)
1. Push all three files to a Git repo
2. Set start command to `node server.js`
3. Set `PORT` environment variable if required by the host

### Option B — VPS / Linux server
```bash
# Install dependencies (none needed — uses Node built-ins only)
node server.js

# Or run in background with PM2
npm install -g pm2
pm2 start server.js --name storemagic
pm2 save
```

### Option C — Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Changing the Port
```bash
PORT=8080 node server.js
```

---

## Architecture

```
Browser  ──→  server.js (Node.js, port 3000)
                │
                ├── GET /              → serves storemagic.html
                ├── GET /health        → health check JSON
                └── * /shopify/*       → proxies to Shopify Admin API
                                         (adds X-Shopify-Access-Token header,
                                          solves browser CORS restriction)

Browser  ──→  Anthropic API (direct, no proxy needed)
```

The Anthropic API is called directly from the browser using the
`anthropic-dangerous-direct-browser-access` header. Only Shopify requires
the proxy due to its CORS policy.
