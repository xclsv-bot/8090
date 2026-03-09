import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Phase 3: API documentation validation', () => {
  it('configures Swagger OpenAPI with bearer auth', () => {
    const content = read('src/app.ts');

    expect(content).toContain("openapi: '3.0.0'");
    expect(content).toContain('securitySchemes');
    expect(content).toContain("bearerFormat: 'JWT'");
  });

  it('exposes documentation at /documentation', () => {
    const content = read('src/app.ts');

    expect(content).toContain("routePrefix: '/documentation'");
  });
});
