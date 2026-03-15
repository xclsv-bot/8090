import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const FRONTEND_ENV_EXAMPLE_PATH = path.join(ROOT, 'frontend/.env.example');
const NEXT_CONFIG_PATH = path.join(ROOT, 'frontend/next.config.ts');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Phase 22: Frontend environment configuration', () => {
  it('validates frontend/.env.example exists with required vars', () => {
    expect(fs.existsSync(FRONTEND_ENV_EXAMPLE_PATH)).toBe(true);
    const content = read(FRONTEND_ENV_EXAMPLE_PATH);

    const requiredVars = [
      'NEXT_PUBLIC_APP_ENV=',
      'NEXT_PUBLIC_APP_URL=',
      'NEXT_PUBLIC_API_URL=',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=',
      'NEXT_PUBLIC_CLERK_SIGN_IN_URL=',
      'NEXT_PUBLIC_CLERK_SIGN_UP_URL=',
      'NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=',
      'NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=',
      'CLERK_SECRET_KEY=',
    ];

    for (const entry of requiredVars) {
      expect(content).toContain(entry);
    }
  });

  it('verifies NEXT_PUBLIC variables are documented', () => {
    const content = read(FRONTEND_ENV_EXAMPLE_PATH);
    const publicLines = content
      .split('\n')
      .filter((line) => line.startsWith('NEXT_PUBLIC_') && line.includes('='));

    expect(publicLines.length).toBeGreaterThanOrEqual(8);
  });

  it('verifies server-only secrets are not exposed with NEXT_PUBLIC_ prefix', () => {
    const content = read(FRONTEND_ENV_EXAMPLE_PATH);
    expect(content).toContain('CLERK_SECRET_KEY=');
    expect(content).not.toContain('NEXT_PUBLIC_CLERK_SECRET_KEY=');
  });

  it('tests next.config.ts environment defaults', () => {
    expect(fs.existsSync(NEXT_CONFIG_PATH)).toBe(true);
    const nextConfig = read(NEXT_CONFIG_PATH);

    expect(nextConfig).toContain('NEXT_PUBLIC_API_URL');
    expect(nextConfig).toContain('NEXT_PUBLIC_APP_ENV');
    expect(nextConfig).toContain('process.env.NEXT_PUBLIC_API_URL ??');
    expect(nextConfig).toContain('process.env.NEXT_PUBLIC_APP_ENV ??');
    expect(nextConfig).toContain('https://xclsv-core-platform.onrender.com');
    expect(nextConfig).toContain('"development"');
  });
});
