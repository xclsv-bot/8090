import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PROD_DEPLOY_PATH = path.join(ROOT, '.github/workflows/backend-deploy-production.yml');
const CI_CD_DOC_PATH = path.join(ROOT, 'docs/deployment/ci-cd-pipeline.md');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Phase 22: Production approval gates', () => {
  it('verifies production workflow requires workflow_dispatch', () => {
    const workflow = read(PROD_DEPLOY_PATH);
    expect(workflow).toContain('on:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('\n  push:');
  });

  it('verifies production deploy job targets environment: production', () => {
    const workflow = read(PROD_DEPLOY_PATH);
    expect(workflow).toContain('environment: production');
  });

  it('verifies change_ticket input is required', () => {
    const workflow = read(PROD_DEPLOY_PATH);
    expect(workflow).toContain('change_ticket:');
    expect(workflow).toContain("description: 'Change ticket or release note reference'");
    expect(workflow).toContain('required: true');
  });

  it('documents approval gate configuration in CI/CD docs', () => {
    const docs = read(CI_CD_DOC_PATH);
    expect(docs).toContain('## Manual Approval Process');
    expect(docs).toContain('configure environment `production` with required reviewers');
    expect(docs).toContain('GitHub pauses job until reviewer approves deployment');
  });
});
