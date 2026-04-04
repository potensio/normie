import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from monorepo root (two levels up from this file)
config({ path: resolve(__dirname, '..', '..', '.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
};
