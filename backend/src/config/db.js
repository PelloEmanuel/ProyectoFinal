/**
 * Archivo: backend/src/config/db.js
 * Descripción: Pool de conexiones MySQL / MariaDB para el Campus con soporte de transacciones.
 * Se conecta con: Todos los controladores, servicios, middlewares y scripts de migración/seed.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

// Forzar zona horaria oficial del Campus a Buenos Aires, Argentina (UTC-3)
process.env.TZ = 'America/Argentina/Buenos_Aires';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'skilltrack',
  waitForConnections: true,
  connectionLimit: 12,
  dateStrings: true,
};

// Soporte nativo para TiDB Cloud Serverless y conexiones SSL seguras
if (
  process.env.DB_SSL === 'true' ||
  (process.env.DB_HOST && process.env.DB_HOST.includes('tidbcloud.com')) ||
  Number(process.env.DB_PORT) === 4000
) {
  dbConfig.ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  };
}

const pool = mysql.createPool(dbConfig);

// Asegurar que toda conexión al pool use la zona horaria oficial de Buenos Aires (UTC-3)
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '-03:00'").catch((err) => {
    console.error('Error al configurar zona horaria -03:00 en la conexión:', err.message);
  });
});

/**
 * Ejecuta una serie de consultas dentro de una transacción ACID (BEGIN / COMMIT / ROLLBACK).
 */
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  pool,
  dbConfig,
  execute: (sql, params = []) => pool.execute(sql, params),
  query: (sql, params = []) => pool.query(sql, params),
  withTransaction,
};
