import { Pool } from 'pg';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

const pool = global.pgPool || new Pool({ connectionString: env.DATABASE_URL });
if (!global.pgPool) global.pgPool = pool;

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[] }> {
  const result = await pool.query(text, params);
  return { rows: result.rows as T[] };
}

export async function executeQuery<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[] }> {
  return query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (queryFn: typeof query) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(async (text: string, params?: any[]) => {
      const result = await client.query(text, params);
      return { rows: result.rows };
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export { pool };
