import { z } from 'zod';

const envSchema = z.object({ 
  DATABASE_URL: z.string().min(1) 
});

// Only validate env vars at runtime, not during build
const getRuntimeEnv = () => {
  if (process.env.NODE_ENV === 'development' || process.env.DATABASE_URL) {
    return envSchema.parse({ DATABASE_URL: process.env.DATABASE_URL });
  }
  // During build time, return a placeholder
  return { DATABASE_URL: process.env.DATABASE_URL || 'placeholder' };
};

export const env = getRuntimeEnv();
