import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, 'docs/deployment');

const CI_CD_DOC = path.join(DOCS_DIR, 'ci-cd-pipeline.md');
const RELEASE_DOC = path.join(DOCS_DIR, 'release-process.md');
const SECRETS_DOC = path.join(DOCS_DIR, 'github-secrets.md');
const FRONTEND_DOCS = [
  path.join(DOCS_DIR, 'frontend-deployment-pipeline.md'),
  path.join(DOCS_DIR, 'frontend-deployment-runbook.md'),
  path.join(DOCS_DIR, 'frontend-environment-config.md'),
  path.join(DOCS_DIR, 'frontend-caching-strategy.md'),
];

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Phase 22: Deployment documentation completeness', () => {
  it('validates ci-cd-pipeline.md has required sections', () => {
    expect(fs.existsSync(CI_CD_DOC)).toBe(true);
    const content = read(CI_CD_DOC);

    const requiredSections = [
      '# CI/CD Pipeline',
      '## Architecture',
      '## Workflow Summary',
      '## Manual Approval Process',
      '## Rollback Procedure',
      '## Secrets Management',
    ];

    for (const section of requiredSections) {
      expect(content).toContain(section);
    }
  });

  it('validates release-process.md completeness', () => {
    expect(fs.existsSync(RELEASE_DOC)).toBe(true);
    const content = read(RELEASE_DOC);

    const requiredSections = [
      '# Release Process',
      '## Release Cadence',
      '## How To Cut A Release',
      '## Version Bumping Strategy',
      '## Changelog Generation',
      '## Communication Plan',
    ];

    for (const section of requiredSections) {
      expect(content).toContain(section);
    }
  });

  it('validates github-secrets.md includes required secrets list', () => {
    expect(fs.existsSync(SECRETS_DOC)).toBe(true);
    const content = read(SECRETS_DOC);

    const requiredSecrets = [
      'RENDER_API_KEY',
      'RENDER_STAGING_SERVICE_ID',
      'RENDER_PRODUCTION_SERVICE_ID',
      'STAGING_HEALTHCHECK_URL',
      'PRODUCTION_HEALTHCHECK_URL',
    ];

    for (const secret of requiredSecrets) {
      expect(content).toContain(secret);
    }
  });

  it('validates frontend deployment documentation exists', () => {
    for (const docPath of FRONTEND_DOCS) {
      expect(fs.existsSync(docPath)).toBe(true);
      expect(read(docPath).trim().length).toBeGreaterThan(0);
    }
  });
});
