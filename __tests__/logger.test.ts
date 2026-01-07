import { logger } from '../lib//logger';
import { SignJWT } from 'jose';

// 1. Mock 'jose' library
jest.mock('jose', () => ({
  SignJWT: jest.fn().mockImplementation(() => ({
    setProtectedHeader: jest.fn().mockReturnThis(),
    setIssuedAt: jest.fn().mockReturnThis(),
    setExpirationTime: jest.fn().mockReturnThis(),
    sign: jest.fn().mockResolvedValue('mocked_token'),
  })),
}));

describe('Logger Utility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Mock global fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    }) as jest.Mock;
  });

  afterAll(() => {
    process.env = originalEnv;
  });


  it.each([
    ['info', 'INFO'],
    ['debug', 'DEBUG'],
    ['warn', 'WARN'],
    ['error', 'ERROR'],
  ])('should send %s log correctly', async (method, level) => {
    const message = 'Test message';
    await (logger as any)[method](message);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer mocked_token',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          app: 'storage-service',
          level: level,
          message: message,
        }),
      })
    );
  });


  it('should use default values when env vars are missing', async () => {
    delete process.env.JWT_SECRET;
    delete process.env.LOGGING_ENDPOINT;

    // Use isolateModules to ensure the code re-reads the (now deleted) env vars
    let isolatedLogger: any;
    jest.isolateModules(() => {
      isolatedLogger = require('../lib/logger').logger;
    });

    await isolatedLogger.info('testing defaults');

    // Verify fetch used the default localhost endpoint
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4010/api/logs',
      expect.any(Object)
    );
  });

 
  it('should use custom endpoint and secret from process.env', async () => {
    process.env.JWT_SECRET = 'custom_secret';
    process.env.LOGGING_ENDPOINT = 'https://logs.example.com';

    let isolatedLogger: any;
    jest.isolateModules(() => {
      isolatedLogger = require('../lib/logger').logger;
    });

    await isolatedLogger.info('testing custom env');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://logs.example.com',
      expect.any(Object)
    );
  });

 
  it('should silently handle fetch failures', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));

    // This should not throw an error because of the try-catch block in logger.ts
    await expect(logger.error('this failure is caught')).resolves.not.toThrow();
    
    expect(global.fetch).toHaveBeenCalled();
  });
});