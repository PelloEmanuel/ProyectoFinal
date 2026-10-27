const mysql = require('mysql2/promise');

/** Pool de conexiones MySQL compartido por toda la API. */
module.exports = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'taskflow',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // DATE/DATETIME como string, evita problemas de zona horaria
});
