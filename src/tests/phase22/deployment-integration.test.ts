import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const VERCEL_CONFIG_PATH = path.join(ROOT, 'frontend/vercel.json');
const NEXT_CONFIG_PATH = path.join(ROOT, 'frontend/next.config.ts');
const RENDER_CONFIG_PATH = path.join(ROOT, 'render.yaml');
const STAGING_WORKFLOW_PATH = path.join(ROOT, '.github/workflows/backend-deploy-staging.yml');
const PROD_WORKFLOW_PATH = path.join(ROOT, '.github/workflows/backend-deploy-production.yml');
const CI_CD_DOC_PATH = path.join(ROOT, 'docs/deployment/ci-cd-pipeline.md');

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

describe('Phase 22: Deployment integration chain', () => {
  it('validates frontend vercel.json and next.config.ts alignment', () => {
    const vercel = read(VERCEL_CONFIG_PATH);
    const nextConfig = read(NEXT_CONFIG_PATH);

    expect(vercel).toContain('https://xclsv-core-platform.onrender.com/:path*');
    expect(nextConfig).toContain('process.env.NEXT_PUBLIC_API_URL ?? "https://xclsv-core-platform.onrender.com"');
    expect(nextConfig).toContain('reactStrictMode: true');
  });

  it('validates backend render.yaml and workflows alignment', () => {
    const render = read(RENDER_CONFIG_PATH);
    const stagingWorkflow = read(STAGING_WORKFLOW_PATH);
    const prodWorkflow = read(PROD_WORKFLOW_PATH);

    expect(render).toContain('buildCommand: npm ci && npm run build');
    expect(render).toContain('startCommand: npm start');
    expect(render).toContain('healthCheckPath: /health');

    expect(stagingWorkflow).toContain("- 'render.yaml'");
    expect(stagingWorkflow).toContain('RENDER_STAGING_SERVICE_ID');
    expect(stagingWorkflow).toContain('STAGING_HEALTHCHECK_URL');

    expect(prodWorkflow).toContain('RENDER_PRODUCTION_SERVICE_ID');
    expect(prodWorkflow).toContain('PRODUCTION_HEALTHCHECK_URL');
  });

  it('validates deployment config chain is documented end-to-end', () => {
    const pipelineDoc = read(CI_CD_DOC_PATH);

    expect(pipelineDoc).toContain('.github/workflows/backend-ci.yml');
    expect(pipelineDoc).toContain('.github/workflows/backend-deploy-staging.yml');
    expect(pipelineDoc).toContain('.github/workflows/backend-deploy-production.yml');
    expect(pipelineDoc).toContain('.github/workflows/security.yml');
  });
});
