import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const POLICY_PATH = path.join(ROOT, 'infrastructure/auto-scaling-policies.yml');

function readPolicy(): string {
  return fs.readFileSync(POLICY_PATH, 'utf8');
}

function getNumberValue(content: string, key: string): number {
  const pattern = new RegExp(`${key}:\\s*(\\d+)`);
  const match = content.match(pattern);
  if (!match) {
    throw new Error(`Missing numeric key: ${key}`);
  }
  return Number(match[1]);
}

describe('Phase 21: Auto-scaling policy validation', () => {
  it('has required top-level structure', () => {
    const content = readPolicy();

    expect(content).toContain('service:');
    expect(content).toContain('platform:');
    expect(content).toContain('resources:');
    expect(content).toContain('instance_bounds:');
    expect(content).toContain('target_tracking:');
    expect(content).toContain('step_scaling:');
    expect(content).toContain('alerts:');
  });

  it('uses reasonable CPU and memory target thresholds', () => {
    const content = readPolicy();
    const cpuTarget = getNumberValue(content, 'target_utilization_percent');
    const memoryTargetMatches = [...content.matchAll(/memory:\s*\n\s*target_utilization_percent:\s*(\d+)/g)];
    const memoryTarget = Number(memoryTargetMatches[0]?.[1] ?? 0);

    expect(cpuTarget).toBeGreaterThanOrEqual(50);
    expect(cpuTarget).toBeLessThanOrEqual(80);
    expect(memoryTarget).toBeGreaterThanOrEqual(55);
    expect(memoryTarget).toBeLessThanOrEqual(85);
  });

  it('configures valid min/desired/max instance bounds', () => {
    const content = readPolicy();
    const min = getNumberValue(content, 'min_instances');
    const desired = getNumberValue(content, 'desired_instances');
    const max = getNumberValue(content, 'max_instances');

    expect(min).toBeGreaterThan(0);
    expect(min).toBeLessThanOrEqual(desired);
    expect(desired).toBeLessThanOrEqual(max);
    expect(max).toBeGreaterThan(min);
  });

  it('defines positive cooldown periods with slower scale-in than scale-out', () => {
    const content = readPolicy();
    const scaleOutValues = [...content.matchAll(/scale_out_cooldown_seconds:\s*(\d+)/g)].map((m) => Number(m[1]));
    const scaleInValues = [...content.matchAll(/scale_in_cooldown_seconds:\s*(\d+)/g)].map((m) => Number(m[1]));

    expect(scaleOutValues.length).toBeGreaterThan(0);
    expect(scaleInValues.length).toBeGreaterThan(0);

    for (const value of scaleOutValues) {
      expect(value).toBeGreaterThan(0);
    }
    for (const value of scaleInValues) {
      expect(value).toBeGreaterThan(0);
    }

    expect(Math.min(...scaleInValues)).toBeGreaterThanOrEqual(Math.max(...scaleOutValues));
  });
});
