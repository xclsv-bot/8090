import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const VERCEL_CONFIG_PATH = path.join(ROOT, 'frontend/vercel.json');

type HeaderPair = { key: string; value: string };
type HeaderRule = { source: string; headers: HeaderPair[] };
type VercelConfig = { headers: HeaderRule[] };

function readConfig(): VercelConfig {
  return JSON.parse(fs.readFileSync(VERCEL_CONFIG_PATH, 'utf8')) as VercelConfig;
}

function getRule(config: VercelConfig, source: string): HeaderRule {
  const rule = config.headers.find((entry) => entry.source === source);
  expect(rule).toBeDefined();
  return rule as HeaderRule;
}

function getHeaderValue(rule: HeaderRule, key: string): string {
  const header = rule.headers.find((item) => item.key.toLowerCase() === key.toLowerCase());
  expect(header).toBeDefined();
  return (header as HeaderPair).value;
}

describe('Phase 22: CDN caching and security headers', () => {
  it('verifies static asset cache headers are immutable and 1 year', () => {
    const config = readConfig();
    const staticRule = getRule(config, '/_next/static/:path*');
    const staticAssetRule = getRule(
      config,
      '/(.*)\\.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webp)$',
    );

    expect(getHeaderValue(staticRule, 'Cache-Control')).toContain('max-age=31536000');
    expect(getHeaderValue(staticRule, 'Cache-Control')).toContain('immutable');
    expect(getHeaderValue(staticAssetRule, 'Cache-Control')).toContain('max-age=31536000');
    expect(getHeaderValue(staticAssetRule, 'Cache-Control')).toContain('immutable');
  });

  it('verifies HTML/page cache headers include s-maxage 300', () => {
    const config = readConfig();
    const htmlRule = getRule(config, '/((?!_next/static|_next/image|api|.*\\..*).*)');
    const cacheControl = getHeaderValue(htmlRule, 'Cache-Control');

    expect(cacheControl).toContain('s-maxage=300');
    expect(cacheControl).toContain('stale-while-revalidate=300');
  });

  it('verifies API route no-cache headers', () => {
    const config = readConfig();
    const apiRule = getRule(config, '/api/:path*');
    const cacheControl = getHeaderValue(apiRule, 'Cache-Control');

    expect(cacheControl).toContain('no-store');
    expect(cacheControl).toContain('no-cache');
    expect(cacheControl).toContain('must-revalidate');
    expect(cacheControl).toContain('proxy-revalidate');
  });

  it('validates security headers are configured', () => {
    const config = readConfig();
    const htmlRule = getRule(config, '/((?!_next/static|_next/image|api|.*\\..*).*)');

    expect(getHeaderValue(htmlRule, 'X-Content-Type-Options')).toBe('nosniff');
    expect(getHeaderValue(htmlRule, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(getHeaderValue(htmlRule, 'X-Frame-Options')).toBe('SAMEORIGIN');
  });
});
