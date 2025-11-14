import { SignJWT } from 'jose';

async function getToken(): Promise<string> {
  const secret = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
  const encoder = new TextEncoder();
  return await new SignJWT({ sub: 'storage-service' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(encoder.encode(secret));
}

async function send(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', message: string) {
  const endpoint = process.env.LOGGING_ENDPOINT || 'http://localhost:4010/api/logs';
  const token = await getToken();
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: 'storage-service', level, message }),
    });
  } catch {}
}

export const logger = {
  info: (m: string) => send('INFO', m),
  debug: (m: string) => send('DEBUG', m),
  warn: (m: string) => send('WARN', m),
  error: (m: string) => send('ERROR', m),
};


