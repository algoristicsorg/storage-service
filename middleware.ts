import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

async function verifyToken(token: string, secret: string) {
  const encoder = new TextEncoder();
  await jwtVerify(token, encoder.encode(secret));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/health') || pathname.startsWith('/api/version')) {
    return NextResponse.next();
  }
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
  if (!token) return NextResponse.json({ error: 'Missing Bearer token' }, { status: 401 });
  try { await verifyToken(token, secret); return NextResponse.next(); } catch { return NextResponse.json({ error: 'Invalid token' }, { status: 401 }); }
}

export const config = { matcher: ['/api/:path*'] };


