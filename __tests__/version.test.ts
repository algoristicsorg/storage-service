import { GET } from '../app/version/route';
import { NextResponse } from 'next/server';

describe('Version Route', () => {
  it('should return the correct service name and version', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      name: 'storage-service',
      version: '0.1.0',
    });
  });
});