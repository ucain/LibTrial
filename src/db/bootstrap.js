const crypto = require('crypto');
const { pool } = require('../config/db');
const { validateEnvironment } = require('../config/env');
const schemaSql = require('./sql/schema');
const hardeningSql = require('./sql/hardening');
const seedSql = require('./sql/seed');

let readyPromise = null;
let readyAt = null;

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function ensureMigrationTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_migration (
      migration_name VARCHAR(200) PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function applySqlOnce(db, migrationName, sql) {
  const checksum = hash(sql);
  const existing = await db.query('SELECT checksum FROM app_migration WHERE migration_name=$1', [migrationName]);
  if (existing.rows[0]) {
    if (existing.rows[0].checksum !== checksum) {
      const err = new Error(`Migration ${migrationName} tidak sama dengan versi yang sudah diterapkan. Jangan mengubah migration lama; buat migration baru.`);
      err.code = 'MIGRATION_CHECKSUM_MISMATCH';
      err.status = 503;
      err.details = { migrationName };
      throw err;
    }
    return false;
  }
  await db.query(sql);
  await db.query('INSERT INTO app_migration(migration_name,checksum) VALUES($1,$2)', [migrationName, checksum]);
  return true;
}

async function seedDemoIfNeeded(db) {
  const env = validateEnvironment();
  if (!env.demoMode || !env.autoSeedDemo) return false;
  const exists = await db.query("SELECT 1 FROM library_member WHERE institutional_id='230012345' LIMIT 1");
  if (exists.rows[0]) return false;
  await db.query(seedSql);
  return true;
}

async function initializeDatabase() {
  const env = validateEnvironment();
  const client = await pool.connect();
  try {
    // Transaction-scoped advisory lock avoids lock leakage when a serverless instance is frozen.
    await client.query('BEGIN');
    try {
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', ['7420192601']);
      if (env.autoMigrate) {
        await ensureMigrationTable(client);
        await applySqlOnce(client, '001-initial-schema', schemaSql);
        await applySqlOnce(client, '002-production-hardening', hardeningSql);
        await seedDemoIfNeeded(client);
      } else {
        await client.query('SELECT 1 FROM library_member LIMIT 1');
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    }
  } catch (error) {
    if (error.code === '42P01') {
      const err = new Error('Schema database belum dibuat. Set AUTO_MIGRATE=true untuk deployment awal atau jalankan npm run db:migrate dari environment yang terhubung ke database.');
      err.code = 'DATABASE_SCHEMA_MISSING';
      err.status = 503;
      throw err;
    }
    throw error;
  } finally {
    client.release();
  }
  readyAt = new Date();
  return true;
}

function ensureDatabaseReady() {
  if (!readyPromise) {
    readyPromise = initializeDatabase().catch((err) => {
      readyPromise = null;
      readyAt = null;
      throw err;
    });
  }
  return readyPromise;
}

function databaseBootstrapState() {
  return { ready: Boolean(readyAt), readyAt };
}

module.exports = { ensureDatabaseReady, initializeDatabase, databaseBootstrapState };
