import { NextResponse } from 'next/server';
export function GET(){ return NextResponse.json({ name:'storage-service', version:'0.1.0' }); }


