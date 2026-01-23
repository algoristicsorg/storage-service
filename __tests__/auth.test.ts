import { getUserFromToken } from '../lib/auth';
import { jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

// --- 1. Bypass 'jose' ESM Syntax Errors ---
// We mock the library so Jest doesn't try to parse the real ESM files.
jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
}));

describe('getUserFromToken', () => {
  const MOCK_SECRET = 'test_secret_key';
  const DEFAULT_SECRET = 'dev_jwt_secret_change_me';
  
  // Store original env var to restore later
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // Safely set the specific key (mutation is allowed, reassignment of process.env is not)
    process.env.JWT_SECRET = MOCK_SECRET;
  });

  afterAll(() => {
    // Restore the environment variable to its original state
    process.env.JWT_SECRET = originalSecret;
  });

  // --- Helper: Create Mock Request ---
  // We cast as unknown as NextRequest to satisfy Typescript without mocking complex internals
  const createMockRequest = (cookieValue: string | null) => {
    return {
      cookies: {
        get: jest.fn((name) => {
          if (name === 'auth_token' && cookieValue) {
            return { value: cookieValue };
          }
          return undefined;
        }),
      },
    } as unknown as NextRequest;
  };

  // --- Test Cases ---

  it('should return user details when the token is valid', async () => {
    // 1. Mock jwtVerify to return a success payload
    (jwtVerify as jest.Mock).mockResolvedValue({
      payload: {
        sub: 'user_123',
        organizationId: 'org_999',
        email: 'test@example.com',
        role: 'ADMIN',
      },
    });

    // 2. Create request with a token
    const req = createMockRequest('valid_token_string');

    // 3. Execute function
    const user = await getUserFromToken(req);

    // 4. Assertions
    expect(user).toEqual({
      userId: 'user_123',
      organizationId: 'org_999',
      email: 'test@example.com',
      role: 'ADMIN',
    });

    // Verify it used the correct secret from env
    const expectedSecretBytes = new TextEncoder().encode(MOCK_SECRET);
    expect(jwtVerify).toHaveBeenCalledWith('valid_token_string', expectedSecretBytes);
  });

  it('should throw "Missing authentication token" if the cookie is missing', async () => {
    // 1. Create request with NO cookie
    const req = createMockRequest(null);

    // 2. Expect error
    await expect(getUserFromToken(req)).rejects.toThrow('Missing authentication token');
    
    // Ensure we didn't waste resources trying to verify undefined
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it('should throw "Invalid or expired token" if verification fails', async () => {
    // 1. Mock jwtVerify to throw an error (simulating expired/tampered)
    (jwtVerify as jest.Mock).mockRejectedValue(new Error('Signature verification failed'));

    // 2. Create request
    const req = createMockRequest('bad_token');

    // 3. Expect wrapped error
    await expect(getUserFromToken(req)).rejects.toThrow('Invalid or expired token');
  });

  it('should fallback to default secret if JWT_SECRET env var is missing', async () => {
    // 1. Delete the specific key temporarily
    delete process.env.JWT_SECRET;

    // 2. Mock success
    (jwtVerify as jest.Mock).mockResolvedValue({ payload: { sub: 'u1' } });

    // 3. Execute
    const req = createMockRequest('token');
    await getUserFromToken(req);

    // 4. Verify it used the hardcoded default secret
    const expectedBytes = new TextEncoder().encode(DEFAULT_SECRET);
    expect(jwtVerify).toHaveBeenCalledWith('token', expectedBytes);
  });
});