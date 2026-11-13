// Importa los módulos nativos de rutas, variables de entorno y el cliente MySQL con soporte de promesas.
import path from 'path';
import dotenv from 'dotenv';
import mysql, { Pool, PoolConnection, PoolOptions } from 'mysql2/promise';

// Carga las variables de entorno desde el archivo .env ubicado en la raíz del backend.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Fija la zona horaria oficial del Campus en Buenos Aires, Argentina (UTC-3).
process.env.TZ = 'America/Argentina/Buenos_Aires';

// Define la configuración del pool de conexiones a MySQL / TiDB Cloud.
export const dbConfig: PoolOptions = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'skilltrack',
  waitForConnections: true,
  connectionLimit: 12,
  dateStrings: true,
};

// Activa el cifrado TLS v1.2 automáticamente cuando se conecta a TiDB Cloud o al puerto seguro 4000.
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

// Crea la instancia compartida del pool de conexiones a la base de datos.
export const pool: Pool = mysql.createPool(dbConfig);

// Configura cada nueva conexión establecida en el pool para utilizar el huso horario UTC-3.
pool.on('connection', (connection: any) => {
  connection.query("SET time_zone = '-03:00'", (err: Error | null) => {
    if (err) {
      console.error('Error al configurar zona horaria -03:00 en la conexión:', err.message);
    }
  });
});

// Ejecuta una función de trabajo dentro de una transacción ACID garantizando commit o rollback.
export async function withTransaction<T>(work: (conn: PoolConnection) => Promise<T>): Promise<T> {
  // Obtiene una conexión dedicada desde el pool para iniciar la transacción.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    // Revierte todos los cambios si ocurre cualquier error durante la transacción.
    await conn.rollback();
    throw err;
  } finally {
    // Libera la conexión de vuelta al pool sin importar el resultado.
    conn.release();
  }
}

// Ejecuta una sentencia SQL preparada utilizando el pool de conexiones.
export function execute<T = any>(sql: string, params: unknown[] = []): Promise<[T, any]> {
  return pool.execute(sql, params as any) as Promise<[T, any]>;
}

// Ejecuta una consulta SQL directa utilizando el pool de conexiones.
export function query<T = any>(sql: string, params: unknown[] = []): Promise<[T, any]> {
  return pool.query(sql, params as any) as Promise<[T, any]>;
}

// Exporta el objeto de base de datos compatible con importaciones por defecto y desestructuradas.
const db = {
  pool,
  dbConfig,
  execute,
  query,
  withTransaction,
};

export default db;
