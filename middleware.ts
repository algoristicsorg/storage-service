import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin?: string) {
  if (!allowedOrigins.length) return true;
  return !!(origin && allowedOrigins.includes(origin));
}

const corsHeaders = (origin?: string) => ({
  'Access-Control-Allow-Origin': origin ?? '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
});

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') || undefined;
  const allowed = isOriginAllowed(origin);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    const res = new NextResponse(null, { status: 204 });
    const headers = corsHeaders(allowed ? origin : '*');
    Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  // Continue with request and add CORS headers
  const res = NextResponse.next();
  const headers = corsHeaders(allowed ? origin : '*');
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

export const config = {
  matcher: ['/:path*'],
};
