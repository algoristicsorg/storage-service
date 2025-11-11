import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'storage-service',
    version: '0.1.0',
    environment: process.env.NODE_ENV || 'unknown'
  });
}


