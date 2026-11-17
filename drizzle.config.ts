import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const migrationUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error('DATABASE_URL_UNPOOLED o DATABASE_URL debe estar definida para Drizzle Kit.');
}

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: migrationUrl,
  },
});
