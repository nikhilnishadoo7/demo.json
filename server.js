import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Mock of /api/v1/customers/metadata for load testing, called with GET.
 * The response body is the user's record from data/users.json, exactly as stored in the file.
 * Each hit returns the next user in the file (it holds one user now), and after the last one it starts again from the first.
 */

const PORT = Number(process.env.PORT) || 9100;
const HOST = process.env.HOST || '0.0.0.0';
const LATENCY_MS = Number(process.env.LATENCY_MS) || 0; // simulated work per request
const ROUTE = '/api/v1/customers/metadata';

const users = JSON.parse(readFileSync(new URL('./data/users.json', import.meta.url), 'utf8'));
let nextUser = 0;

const envelope = (status, message, result) => ({
  resultCode: String(status),
  resultStatus: status < 400 ? 'Success' : 'Error',
  resultMessage: message,
  result,
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

function send(res, status, body) {
  // no-store: a cached GET would show the same user again instead of the next one
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

async function handleMetadata(req, res) {
  const user = users[nextUser++ % users.length];
  if (LATENCY_MS > 0) await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  send(res, 200, user);
}

export const server = createServer(async (req, res) => {
  const path = (req.url || '').split('?')[0].replace(/\/+$/, '');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
  if (path !== ROUTE || req.method !== 'GET') {
    send(res, 404, envelope(404, `Route ${req.method} ${req.url} not found`, null));
    return;
  }
  try {
    await handleMetadata(req, res);
  } catch (err) {
    if (!res.headersSent && !res.destroyed) send(res, err.status || 500, envelope(err.status || 500, err.message, null));
  }
});

// Listen only when run directly (the tests import this file and pick their own port)
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  server.listen(PORT, HOST, () => {
    console.log(`Mock ready: GET http://localhost:${PORT}${ROUTE} (${users.length} users, latency ${LATENCY_MS} ms)`);
  });
}
