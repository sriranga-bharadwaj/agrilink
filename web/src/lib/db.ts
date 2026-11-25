import "server-only";
import mysql from "mysql2/promise";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { agrilinkPool?: mysql.Pool };

export const pool =
  globalForDb.agrilinkPool ??
  mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    decimalNumbers: true, // DECIMAL columns come back as numbers
    dateStrings: true, // DATE/TIMESTAMP come back as 'YYYY-MM-DD[ hh:mm:ss]'
  });

if (process.env.NODE_ENV !== "production") globalForDb.agrilinkPool = pool;

export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

// CALL returns [resultSet, ResultSetHeader]; this gives the first result set.
export async function callProc<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await pool.query(sql, params);
  return (result as unknown[])[0] as T[];
}

// Turn MySQL errors into messages safe to show. SIGNAL '45000' messages come
// from our own triggers/procedures and are written for users.
export function dbErrorMessage(e: unknown): string {
  const err = e as { sqlState?: string; code?: string; sqlMessage?: string };
  if (err.sqlState === "45000" && err.sqlMessage) return err.sqlMessage;
  if (err.code === "ER_CHECK_CONSTRAINT_VIOLATED") return `Invalid value (${err.sqlMessage})`;
  if (err.code === "ER_DUP_ENTRY") return "That record already exists";
  console.error(e);
  return "Something went wrong, please try again";
}
