import { z } from 'zod';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Load .env.local first if it exists, then .env
const envLocalPath = join(process.cwd(), '.env.local');
const envPath = join(process.cwd(), '.env');

if (existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Clerk Auth (optional for initial deployment)
  CLERK_SECRET_KEY: z.string().optional().default(''),
  CLERK_PUBLISHABLE_KEY: z.string().optional().default(''),

  // AWS S3 (optional for initial deployment)
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_BUCKET_NAME: z.string().optional().default('xclsv-core-platform'),

  // AI Vision Service (WO-68)
  AI_VISION_API_URL: z.string().optional().default(''),
  AI_VISION_API_KEY: z.string().optional().default('mock'),

  // Customer.io Integration (WO-69)
  CUSTOMERIO_SITE_ID: z.string().optional().default(''),
  CUSTOMERIO_API_KEY: z.string().optional().default(''),

  // Rate Limiting
  RATE_LIMIT_MAX: z.string().default('100').transform(Number),
  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export type Env = z.infer<typeof envSchema>;
