/**
 * Archivo: backend/src/config/db.js
 * Descripción: Configuración del pool de conexiones a PostgreSQL (Render o local).
 * Se conecta con: Todos los controladores, middlewares/auth.js, utils/tokens.js y scripts/init-db.js.
 * Seguridad: Usa exclusivamente variables de entorno y consultas parametrizadas ($1, $2...)
 * para prevenir ataques de inyección SQL. Incluye soporte para transacciones (withTransaction).
 */
const { Pool, types } = require('pg');

// OID 1082 = DATE en PostgreSQL -> lo devolvemos como string 'AAAA-MM-DD' sin desfase horario
types.setTypeParser(1082, (val) => val);
// OID 20 = BIGINT (ej. COUNT(*)) -> lo convertimos a Number de JavaScript
types.setTypeParser(20, (val) => Number(val));

const connectionString = process.env.DATABASE_URL;
const isLocal =
  !connectionString ||
  connectionString.includes('localhost') ||
  connectionString.includes('127.0.0.1');

const poolConfig = connectionString
  ? {
      connectionString,
      // Render requiere SSL en conexiones externas; en interno o con rejectUnauthorized: false funciona en ambos
      ssl: isLocal && process.env.DB_SSL !== 'true' ? false : { rejectUnauthorized: false },
      max: 10,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'taskflow',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
    };

const pool = new Pool(poolConfig);

/**
 * Convierte marcadores '?' al formato '$1, $2...' de PostgreSQL y agrega
 * RETURNING id en sentencias INSERT simples para devolver insertId.
 */
function normalizeSql(sql) {
  let idx = 0;
  let converted = sql.replace(/\?/g, () => `$${++idx}`);
  const trimmed = converted.trim().replace(/;$/, '');
  const isInsert = /^INSERT\s+INTO\s+/i.test(trimmed);
  const hasReturning = /\bRETURNING\b/i.test(trimmed);
  const isTaskTags = /^INSERT\s+INTO\s+task_tags\b/i.test(trimmed);

  if (isInsert && !hasReturning && !isTaskTags) {
    converted = `${trimmed} RETURNING id`;
  }
  return converted;
}

/** Ejecuta una consulta parametrizada sobre un cliente o el pool y devuelve [rows, meta]. */
async function runQuery(runner, sql, params = []) {
  const pgSql = normalizeSql(sql);
  const res = await runner.query(pgSql, params);
  const isSelect = /^\s*SELECT\b/i.test(pgSql);
  if (isSelect) {
    return [res.rows, res];
  }
  const insertId = res.rows?.[0]?.id ?? null;
  return [{ insertId, affectedRows: res.rowCount, rows: res.rows }, res];
}

module.exports = {
  pool,
  execute: (sql, params) => runQuery(pool, sql, params),
  query: (sql, params) => runQuery(pool, sql, params),
  raw: (sql, params) => pool.query(sql, params),

  /**
   * Ejecuta múltiples operaciones dentro de una transacción ACID (BEGIN / COMMIT / ROLLBACK).
   */
  async withTransaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        execute: (sql, params) => runQuery(client, sql, params),
        query: (sql, params) => runQuery(client, sql, params),
        raw: (sql, params) => client.query(sql, params),
      };
      const result = await work(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
