/**
 * @jest-environment node
 */

describe('Environment Configuration (lib/env)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    // Reset process.env to a clean copy before every test
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('successfully parses valid DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    
    const { env } = require('@/lib/env');
    expect(env.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/db');
  });

  it('throws an error if DATABASE_URL is missing in "development" environment', () => {
    // FIX: Use Object.defineProperty to bypass read-only TypeScript error
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      configurable: true,
    });
    
    delete process.env.DATABASE_URL;

    expect(() => {
      require('@/lib/env');
    }).toThrow(); 
  });

  it('returns a placeholder string if DATABASE_URL is missing in non-development (e.g. build) environment', () => {
    // FIX: Use Object.defineProperty to set production
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    
    delete process.env.DATABASE_URL;

    const { env } = require('@/lib/env');
    expect(env.DATABASE_URL).toBe('placeholder');
  });

  it('validates DATABASE_URL even in non-development if it IS provided', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
    
    process.env.DATABASE_URL = 'postgres://real-prod-url';

    const { env } = require('@/lib/env');
    expect(env.DATABASE_URL).toBe('postgres://real-prod-url');
  });
});