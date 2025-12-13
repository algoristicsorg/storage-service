import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export async function getUserFromToken(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
  
  if (!token) {
    throw new Error('Missing Bearer token');
  }

  try {
    const encoder = new TextEncoder();
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    return {
      userId: payload.sub as string,
      organizationId: payload.organizationId as string,
      email: payload.email as string,
      role: payload.role as string
    };
  } catch {
    throw new Error('Invalid token');
  }
}