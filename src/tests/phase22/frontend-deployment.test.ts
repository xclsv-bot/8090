import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const VERCEL_CONFIG_PATH = path.join(ROOT, 'frontend/vercel.json');

type VercelHeader = { key: string; value: string };
type VercelHeaderRule = { source: string; headers: VercelHeader[] };
type VercelRule = { source: string; destination: string; permanent?: boolean };
type VercelConfig = {
  $schema: string;
  framework: string;
  installCommand: string;
  buildCommand: string;
  redirects: VercelRule[];
  rewrites: VercelRule[];
  headers: VercelHeaderRule[];
};

function readVercelConfig(): VercelConfig {
  return JSON.parse(fs.readFileSync(VERCEL_CONFIG_PATH, 'utf8')) as VercelConfig;
}

describe('Phase 22: Frontend deployment pipeline configuration', () => {
  it('validates vercel.json structure and required fields', () => {
    expect(fs.existsSync(VERCEL_CONFIG_PATH)).toBe(true);
    const config = readVercelConfig();

    expect(config.$schema).toContain('vercel.json');
    expect(config.framework).toBe('nextjs');
    expect(Array.isArray(config.redirects)).toBe(true);
    expect(Array.isArray(config.rewrites)).toBe(true);
    expect(Array.isArray(config.headers)).toBe(true);
  });

  it('verifies build/install commands are configured', () => {
    const config = readVercelConfig();
    expect(config.installCommand).toBe('npm ci');
    expect(config.buildCommand).toBe('npm run build');
  });

  it('tests redirects and rewrites are defined', () => {
    const config = readVercelConfig();

    expect(config.redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/signin',
          destination: '/sign-in',
          permanent: false,
        }),
        expect.objectContaining({
          source: '/signup',
          destination: '/sign-up',
          permanent: false,
        }),
      ]),
    );

    expect(config.rewrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/backend/:path*',
          destination: 'https://xclsv-core-platform.onrender.com/:path*',
        }),
      ]),
    );
  });

  it('validates header configurations exist', () => {
    const config = readVercelConfig();
    expect(config.headers.length).toBeGreaterThan(0);

    const allHeaderKeys = config.headers.flatMap((entry) => entry.headers.map((item) => item.key));
    expect(allHeaderKeys).toContain('Cache-Control');
    expect(allHeaderKeys).toContain('X-Content-Type-Options');
    expect(allHeaderKeys).toContain('Referrer-Policy');
    expect(allHeaderKeys).toContain('X-Frame-Options');
  });
});
