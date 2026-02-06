import { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
 
const AUTH_COOKIE_NAME = 'auth_token';
 
export async function getUserFromToken(req: NextRequest) {
  const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
  //  Safely read cookie
  const cookie = req.cookies.get(AUTH_COOKIE_NAME);
  if (!cookie) {
    throw new Error('Missing authentication token');
  }
  const token = cookie.value;
  try {
    const encoder = new TextEncoder();
    const { payload } = await jwtVerify(token, encoder.encode(secret));
 
    return {
      userId: payload.sub as string,
      organizationId: payload.organizationId as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch (err) {
    throw new Error('Invalid or expired token');
  }
}