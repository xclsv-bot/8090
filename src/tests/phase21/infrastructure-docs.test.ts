import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Phase 21: Infrastructure documentation completeness', () => {
  it('validates backend-architecture.md required sections', () => {
    const file = read('docs/deployment/backend-architecture.md');
    expect(file).toContain('# Backend Deployment Architecture');
    expect(file).toContain('## Platform');
    expect(file).toContain('## High-Level Architecture');
    expect(file).toContain('## Operational Endpoints');
  });

  it('validates database-hosting-config.md completeness', () => {
    const file = read('docs/deployment/database-hosting-config.md');
    expect(file).toContain('## Provider and Topology');
    expect(file).toContain('## Connection Pool Settings');
    expect(file).toContain('## Backup and Recovery');
    expect(file).toContain('## Monitoring');
  });

  it('validates container-registry-strategy.md completeness', () => {
    const file = read('docs/deployment/container-registry-strategy.md');
    expect(file).toContain('## Registry');
    expect(file).toContain('## Build and Publish');
    expect(file).toContain('## Security Controls');
    expect(file).toContain('## Lifecycle Policy');
  });

  it('validates deployment-runbook.md pre/post deployment content', () => {
    const file = read('docs/deployment/deployment-runbook.md');
    expect(file).toContain('## Pre-Deployment Checklist');
    expect(file).toContain('## Deployment Steps');
    expect(file).toContain('## Rollback Procedure');
    expect(file).toContain('## Post-Deployment Verification');
  });

  it('validates secrets-management.md completeness', () => {
    const file = read('docs/deployment/secrets-management.md');
    expect(file).toContain('## Provider Options');
    expect(file).toContain('## Secret Key Definitions');
    expect(file).toContain('## Access Control Model');
    expect(file).toContain('## Audit Logging');
    expect(file).toContain('## Runtime Validation');
  });

  it('validates secrets-rotation-policy.md includes rotation schedules', () => {
    const file = read('docs/deployment/secrets-rotation-policy.md');
    expect(file).toContain('## Rotation Schedules');
    expect(file).toContain('every 90 days');
    expect(file).toContain('every 180 days');
    expect(file).toContain('runScheduledRotationCheck()');
  });
});
