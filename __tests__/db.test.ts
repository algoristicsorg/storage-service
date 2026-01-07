import { Pool } from 'pg';

// 1. Mock pg module
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

// 2. Mock env to avoid "DATABASE_URL not found" errors
jest.mock('../lib/env', () => ({
  env: { DATABASE_URL: 'postgresql://localhost:5432/test' }
}));

describe('Database Utility Singleton', () => {
  const mockPool = new Pool();

  beforeEach(() => {
    jest.clearAllMocks();
    // Clean the global singleton before each test to ensure isolation
    delete (global as any).pgPool;
  });

  it('should initialize a new Pool if global.pgPool is undefined', async () => {
    let queryFn: any;

    // Isolate the module to force the "new Pool()" logic to run
    jest.isolateModules(() => {
      const db = require('../lib/db');
      queryFn = db.query;
    });

    (mockPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ id: 1 }] });

    const result = await queryFn('SELECT 1');
    
    expect(Pool).toHaveBeenCalledTimes(1);
    expect(result.rows).toEqual([{ id: 1 }]);
    expect((global as any).pgPool).toBeDefined();
  });

  it('should reuse the existing pool from global scope if already present', async () => {
    // Manually inject a fake pool into the global scope BEFORE requiring the module
    const fakeGlobalPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ source: 'global' }] })
    };
    (global as any).pgPool = fakeGlobalPool;

    let queryFn: any;
    jest.isolateModules(() => {
      const db = require('../lib/db');
      queryFn = db.query;
    });

    const result = await queryFn('SELECT 1');

    // Verification
    expect(Pool).not.toHaveBeenCalled(); // Should NOT call 'new Pool()'
    expect(fakeGlobalPool.query).toHaveBeenCalled();
    expect(result.rows[0].source).toBe('global');
  });

  it('should throw an error if the query fails', async () => {
    let queryFn: any;
    jest.isolateModules(() => {
      const db = require('../lib/db');
      queryFn = db.query;
    });

    (mockPool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Error'));

    await expect(queryFn('SELECT 1')).rejects.toThrow('DB Error');
  });
});