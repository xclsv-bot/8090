import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Phase 3: API layer coverage', () => {
  it('registers core API route prefixes', () => {
    const content = read('src/routes/index.ts');

    expect(content).toContain("'/api/v1/ambassadors'");
    expect(content).toContain("'/api/v1/events'");
    expect(content).toContain("'/api/v1/signups'");
    expect(content).toContain("'/api/v1/financial'");
    expect(content).toContain("'/api/v1/payroll'");
    expect(content).toContain("'/api/v1/oauth'");
  });

  it('exposes health and root endpoints', () => {
    const content = read('src/routes/index.ts');

    expect(content).toContain('await fastify.register(healthRoutes)');
    expect(content).toContain("fastify.get('/', async () => {");
  });
});
