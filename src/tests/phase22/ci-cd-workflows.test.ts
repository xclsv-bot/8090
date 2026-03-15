import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const WORKFLOWS_DIR = path.join(ROOT, '.github/workflows');

const BACKEND_CI_PATH = path.join(WORKFLOWS_DIR, 'backend-ci.yml');
const SECURITY_PATH = path.join(WORKFLOWS_DIR, 'security.yml');
const STAGING_DEPLOY_PATH = path.join(WORKFLOWS_DIR, 'backend-deploy-staging.yml');
const PROD_DEPLOY_PATH = path.join(WORKFLOWS_DIR, 'backend-deploy-production.yml');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Phase 22: CI/CD workflow configuration', () => {
  it('validates backend-ci.yml structure has lint, test, and build coverage', () => {
    expect(fs.existsSync(BACKEND_CI_PATH)).toBe(true);
    const ci = read(BACKEND_CI_PATH);

    expect(ci).toContain('name: Backend CI');
    expect(ci).toContain('jobs:');
    expect(ci).toContain('test-and-lint:');
    expect(ci).toContain('build-verification:');
    expect(ci).toContain('run: npm run lint');
    expect(ci).toContain('run: npm test -- --run');
    expect(ci).toContain('run: npm run build');
  });

  it('validates security.yml has audit and optional CodeQL', () => {
    expect(fs.existsSync(SECURITY_PATH)).toBe(true);
    const security = read(SECURITY_PATH);

    expect(security).toContain('dependency-audit:');
    expect(security).toContain('npm audit --audit-level=high');
    expect(security).toContain('codeql:');
    expect(security).toContain("vars.ENABLE_CODEQL == 'true'");
    expect(security).toContain('github/codeql-action/analyze@v3');
  });

  it('validates backend-deploy-staging.yml triggers on develop', () => {
    expect(fs.existsSync(STAGING_DEPLOY_PATH)).toBe(true);
    const staging = read(STAGING_DEPLOY_PATH);

    expect(staging).toContain('name: Backend Deploy Staging');
    expect(staging).toContain('push:');
    expect(staging).toContain('- develop');
    expect(staging).toContain('environment: staging');
    expect(staging).toContain("- 'render.yaml'");
  });

  it('validates backend-deploy-production.yml has workflow_dispatch and approval gate config', () => {
    expect(fs.existsSync(PROD_DEPLOY_PATH)).toBe(true);
    const production = read(PROD_DEPLOY_PATH);

    expect(production).toContain('workflow_dispatch:');
    expect(production).toContain('inputs:');
    expect(production).toContain('git_ref:');
    expect(production).toContain('change_ticket:');
    expect(production).toContain('required: true');
    expect(production).toContain('environment: production');
  });
});
