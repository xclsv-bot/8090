import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PROD_WORKFLOW_PATH = path.join(ROOT, '.github/workflows/backend-deploy-production.yml');
const RUNBOOK_PATH = path.join(ROOT, 'docs/deployment/deployment-runbook.md');
const CI_CD_DOC_PATH = path.join(ROOT, 'docs/deployment/ci-cd-pipeline.md');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Phase 22: Rollback procedures', () => {
  it('validates rollback guidance exists in production workflow', () => {
    const workflow = read(PROD_WORKFLOW_PATH);

    expect(workflow).toContain('- name: Rollback guidance');
    expect(workflow).toContain('if: failure()');
    expect(workflow).toContain('## Rollback Procedure');
    expect(workflow).toContain('Redeploy the previous known-good commit/image.');
  });

  it('verifies rollback docs in deployment-runbook.md', () => {
    const runbook = read(RUNBOOK_PATH);

    expect(runbook).toContain('## Rollback Procedure');
    expect(runbook).toContain('Re-deploy previous known-good image tag.');
    expect(runbook).toContain('execute documented rollback migration');
    expect(runbook).toContain('Re-check health endpoints and smoke tests.');
  });

  it('tests rollback section in ci-cd-pipeline.md', () => {
    const pipeline = read(CI_CD_DOC_PATH);

    expect(pipeline).toContain('## Rollback Procedure');
    expect(pipeline).toContain('Open Render dashboard for production service.');
    expect(pipeline).toContain('Redeploy previous known-good release/commit.');
    expect(pipeline).toContain('Re-run production workflow once fix is validated.');
  });
});
