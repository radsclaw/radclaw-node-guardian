#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const PUBLIC_STATUS_KEYS = [
  'schema_version', 'service', 'generated_at', 'status', 'network', 'version',
  'block_height', 'normal_channels', 'receive_ready',
];
const ALLOWED_ORIGIN = 'https://radsclaw.github.io';
const MAX_STATUS_BYTES = 16 * 1024;

function securityHeaders(contentType, cacheControl = 'no-store') {
  return {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Content-Security-Policy': "default-src 'none'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function send(req, res, statusCode, body, headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
  res.writeHead(statusCode, { 'Content-Length': payload.length, ...headers });
  if (req.method === 'HEAD') res.end();
  else res.end(payload);
}

function sendJson(req, res, statusCode, value, extraHeaders = {}) {
  send(req, res, statusCode, `${JSON.stringify(value)}\n`, {
    ...securityHeaders('application/json; charset=utf-8'),
    ...extraHeaders,
  });
}

function readPublicStatus(statusPath) {
  const stat = fs.statSync(statusPath);
  if (!stat.isFile() || stat.size > MAX_STATUS_BYTES) throw new Error('invalid status file');
  const parsed = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid status object');
  return Object.fromEntries(PUBLIC_STATUS_KEYS.map(key => [key, parsed[key]]));
}

function createGuardianServer(options = {}) {
  const publicDir = path.resolve(options.publicDir || path.join(__dirname, 'public'));
  const statusPath = path.resolve(options.statusPath || path.join(__dirname, 'runtime', 'status.json'));
  const rateLimit = Number(options.rateLimit || 600);
  const rateWindowMs = Number(options.rateWindowMs || 60_000);
  const buckets = new Map();

  return http.createServer((req, res) => {
    const now = Date.now();
    const client = req.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(client);
    if (!bucket || now - bucket.started >= rateWindowMs) {
      bucket = { started: now, count: 0 };
      buckets.set(client, bucket);
    }
    bucket.count += 1;
    if (bucket.count > rateLimit) {
      sendJson(req, res, 429, { error: 'rate_limited' }, { 'Retry-After': '60' });
      return;
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      sendJson(req, res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD, OPTIONS' });
      return;
    }

    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      sendJson(req, res, 400, { error: 'bad_request' });
      return;
    }

    const origin = req.headers.origin;
    const cors = origin === ALLOWED_ORIGIN
      ? { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, Vary: 'Origin' }
      : {};
    if (req.method === 'OPTIONS') {
      send(req, res, 204, '', {
        ...securityHeaders('text/plain; charset=utf-8'),
        ...cors,
        Allow: 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      });
      return;
    }

    if (pathname === '/health') {
      sendJson(req, res, 200, { status: 'ok' }, cors);
      return;
    }
    if (pathname === '/api/v1/status') {
      try {
        sendJson(req, res, 200, readPublicStatus(statusPath), cors);
      } catch {
        sendJson(req, res, 503, { error: 'status_unavailable' }, cors);
      }
      return;
    }

    const staticRoutes = {
      '/': ['index.html', 'text/html; charset=utf-8'],
      '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
      '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    };
    const route = staticRoutes[pathname];
    if (!route) {
      sendJson(req, res, 404, { error: 'not_found' });
      return;
    }
    try {
      const filePath = path.join(publicDir, route[0]);
      const body = fs.readFileSync(filePath);
      send(req, res, 200, body, securityHeaders(route[1], 'public, max-age=300'));
    } catch {
      sendJson(req, res, 404, { error: 'not_found' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8765);
  const host = process.env.HOST || '127.0.0.1';
  const server = createGuardianServer({
    publicDir: process.env.PUBLIC_DIR,
    statusPath: process.env.STATUS_PATH,
  });
  server.listen(port, host, () => {
    process.stdout.write(`Radclaw Node Guardian listening on http://${host}:${port}\n`);
  });
}

module.exports = { createGuardianServer, readPublicStatus, PUBLIC_STATUS_KEYS };
