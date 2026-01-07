/**
 * @jest-environment node
 */

// 1. Mock 'jose' BEFORE importing the function to test
// This bypasses the ESM syntax issues and lets us control verification results
jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
}));

import { getUserFromToken } from '@/lib/auth'; // Adjust path if needed
import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

describe('Auth Helper: getUserFromToken', () => {
  const mockJwtVerify = jwtVerify as jest.Mock;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Set a predictable secret for the test
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // Helper to create a NextRequest with headers
  const createRequestWithToken = (token?: string) => {
    const headers = new Headers();
    if (token !== undefined) {
      // If token is empty string, we send empty header, else valid Bearer
      headers.set('authorization', token ? `Bearer ${token}` : '');
    }
    // If token is explicitly null/undefined in our helper, we don't set header
    if (token === undefined) {
      // do nothing, no header
    }
    
    return new NextRequest('http://localhost:3000', { headers });
  };

  test('Success: Returns user data when token is valid', async () => {
    // Arrange
    const mockPayload = {
      sub: 'user-123',
      organizationId: 'org-1',
      email: 'test@example.com',
      role: 'ADMIN',
    };
    
    // Mock jwtVerify to resolve successfully with our payload
    mockJwtVerify.mockResolvedValue({ payload: mockPayload });

    const req = createRequestWithToken('valid.jwt.token');

    // Act
    const result = await getUserFromToken(req);

    // Assert
    expect(result).toEqual({
      userId: 'user-123',
      organizationId: 'org-1',
      email: 'test@example.com',
      role: 'ADMIN',
    });
    
    // Check that we called verify with the token and the secret
    expect(mockJwtVerify).toHaveBeenCalledWith(
      'valid.jwt.token', 
      expect.any(Uint8Array) // The secret is encoded to Uint8Array
    );
  });

  test('Success: Uses default secret if env var is missing', async () => {
    // Arrange
    delete process.env.JWT_SECRET; // Remove env var
    mockJwtVerify.mockResolvedValue({ payload: { sub: 'u1' } });

    const req = createRequestWithToken('some.token');

    // Act
    await getUserFromToken(req);

    // Assert
    // Verify we used the fallback 'dev_jwt_secret_change_me' encoded
    const expectedFallbackSecret = new TextEncoder().encode('dev_jwt_secret_change_me');
    expect(mockJwtVerify).toHaveBeenCalledWith(
      'some.token',
      expectedFallbackSecret
    );
  });

  test('Error: Throws "Missing Bearer token" if authorization header is missing', async () => {
    const req = new NextRequest('http://localhost:3000'); // No headers
    
    await expect(getUserFromToken(req))
      .rejects
      .toThrow('Missing Bearer token');
  });

  test('Error: Throws "Missing Bearer token" if header exists but has no token', async () => {
    const req = createRequestWithToken(''); // Header is ""
    
    await expect(getUserFromToken(req))
      .rejects
      .toThrow('Missing Bearer token');
  });

  test('Error: Throws "Missing Bearer token" if header does not start with Bearer', async () => {
    const req = new NextRequest('http://localhost:3000', {
        headers: { 'authorization': 'Basic credentials' } 
    });
    
    await expect(getUserFromToken(req))
      .rejects
      .toThrow('Missing Bearer token');
  });

  test('Error: Throws "Invalid token" if jwtVerify fails', async () => {
    // Arrange
    mockJwtVerify.mockRejectedValue(new Error('Signature verification failed'));
    const req = createRequestWithToken('bad.token');

    // Act & Assert
    await expect(getUserFromToken(req))
      .rejects
      .toThrow('Invalid token');
  });
});