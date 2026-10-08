const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Ensure this test proves routing without requiring PostgreSQL.
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;
delete process.env.POSTGRES_URL_NON_POOLING;
delete process.env.NEON_DATABASE_URL;

const app = require('../src/application');

function withServer(fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', async () => {
      try {
        const { port } = server.address();
        await fn(`http://127.0.0.1:${port}`);
        server.close(resolve);
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
}

test('system ping always returns JSON without database', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/v1/system/ping`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, 'API runtime reachable');
    assert.equal(body.data.databaseConfigured, false);
  });
});

test('health returns diagnostic JSON when database is missing', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    assert.equal(res.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.code, 'DATABASE_NOT_CONFIGURED');
  });
});
