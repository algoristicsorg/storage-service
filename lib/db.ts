import { Pool } from 'pg';
import { env } from './env';

declare global { // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

const pool = global.pgPool || new Pool({ connectionString: env.DATABASE_URL });
if (!global.pgPool) global.pgPool = pool;

export async function query<T = any>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const result = await pool.query(text, params); 
  return { rows: result.rows as T[] }; 
}
