function notFound(req, res) {
  res.status(404).json({ success:false, code:'NOT_FOUND', message:`Route ${req.method} ${req.originalUrl} tidak ditemukan.`, details:null, requestId:res.locals.requestId || null });
}

function postgresError(err) {
  if (err.code === '23505') return { status:409, code:'CONFLICT', message:'Data duplikat atau resource sudah digunakan.' };
  if (err.code === '23503') return { status:409, code:'REFERENCE_CONFLICT', message:'Data masih direferensikan oleh transaksi lain.' };
  if (err.code === '23514') return { status:422, code:'INVALID_VALUE', message:'Nilai tidak memenuhi aturan database.' };
  if (err.code === '22P02') return { status:400, code:'INVALID_IDENTIFIER', message:'Format identifier tidak valid.' };
  if (err.code === '28P01' || err.code === '28000') return { status:503, code:'DATABASE_AUTH_FAILED', message:'Autentikasi PostgreSQL gagal. Periksa DATABASE_URL dan password database.' };
  if (err.code === '3D000') return { status:503, code:'DATABASE_NOT_FOUND', message:'Database pada connection string tidak ditemukan.' };
  if (err.code === '42501') return { status:503, code:'DATABASE_PERMISSION_DENIED', message:'User database tidak memiliki izin yang diperlukan untuk membuat atau mengubah schema.' };
  if (err.code === '57P01' || err.code === '57P02' || err.code === '57P03') return { status:503, code:'DATABASE_RESTARTING', message:'Database sedang tidak tersedia. Coba lagi beberapa saat.' };
  if (['ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','ECONNRESET'].includes(err.code)) {
    return { status:503, code:'DATABASE_UNAVAILABLE', message:'Database tidak dapat dihubungi. Periksa DATABASE_URL, SSL, dan status provider database.' };
  }
  if (/self[- ]signed certificate|certificate|ssl/i.test(err.message || '')) {
    return { status:503, code:'DATABASE_SSL_ERROR', message:'Koneksi SSL database gagal. Periksa DATABASE_SSL dan connection string provider.' };
  }
  return null;
}

function errorHandler(err, _req, res, _next) {
  const db = postgresError(err);
  const status = Number(err.status || db?.status || 500);
  const code = err.code && !/^\d{5}$/.test(String(err.code)) ? String(err.code) : (db?.code || 'INTERNAL_SERVER_ERROR');
  const knownInfrastructure = new Set([
    'ENVIRONMENT_INVALID','DATABASE_SCHEMA_MISSING','MIGRATION_CHECKSUM_MISMATCH',
    'DATABASE_UNAVAILABLE','DATABASE_AUTH_FAILED','DATABASE_NOT_FOUND','DATABASE_PERMISSION_DENIED',
    'DATABASE_RESTARTING','DATABASE_SSL_ERROR'
  ]);
  const message = status >= 500
    ? (db?.message || (knownInfrastructure.has(code) ? err.message : 'Terjadi kesalahan pada server.'))
    : (err.message || 'Request gagal.');

  console.error('[request-error]', {
    requestId: res.locals.requestId || null,
    code,
    status,
    message: err.message,
    postgresCode: /^\d{5}$/.test(String(err.code || '')) ? err.code : undefined,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });

  if (res.headersSent) return;
  res.status(status).type('application/json').json({
    success:false,
    code,
    message,
    details:err.details || null,
    requestId:res.locals.requestId || null,
  });
}

module.exports = { notFound, errorHandler };
