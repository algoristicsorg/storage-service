import { NextResponse } from 'next/server';

// 1. Setup a stable mock for NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn().mockImplementation((data) => ({
      data,
      status: 200,
    })),
  },
}));

describe('Storage Service Health Check Route', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // We clear the mock calls but DON'T reset the whole module system here
    // to avoid losing the mock reference.
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Restore the original environment
    (process.env as any).NODE_ENV = originalEnv;
  });

  // Helper to safely set NODE_ENV and bypass TS read-only error
  const setEnv = (value: string | undefined) => {
    (process.env as any).NODE_ENV = value;
  };

  it('should return 200 and "ok" status', async () => {
    // Re-importing inside the test ensures we get the current process.env
    const { GET } = require('../app/health/route'); 
    
    await GET();
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok' })
    );
  });

  it('should reflect "production" environment', async () => {
    setEnv('production');
    
    const { GET } = require('../app/health/route');
    await GET();

    // Verify the call arguments
    const callArgs = (NextResponse.json as jest.Mock).mock.calls[0][0];
    expect(callArgs.environment).toBe('production');
  });

  it('should return "unknown" when NODE_ENV is falsy', async () => {
    // This forces the branch: process.env.NODE_ENV || 'unknown'
    setEnv(''); 

    const { GET } = require('../app/health/route');
    await GET();

    const callArgs = (NextResponse.json as jest.Mock).mock.calls[0][0];
    expect(callArgs.environment).toBe('unknown');
  });
});