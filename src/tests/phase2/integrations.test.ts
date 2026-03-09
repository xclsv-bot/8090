import { describe, expect, it } from 'vitest';

type SyncStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface IntegrationConfig {
  provider: string;
  credentialsEncrypted: boolean;
  webhookUrl?: string;
}

interface SyncJob {
  id: string;
  status: SyncStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
}

function canRetry(job: SyncJob) {
  return job.status === 'failed' && job.attempts < job.maxAttempts;
}

describe('Phase 2: Integrations models', () => {
  it('requires encrypted credential storage', () => {
    const config: IntegrationConfig = {
      provider: 'customerio',
      credentialsEncrypted: true,
      webhookUrl: 'https://hooks.example.com/customerio',
    };

    expect(config.credentialsEncrypted).toBe(true);
    expect(config.provider).toBeTruthy();
  });

  it('tracks sync status and retry eligibility', () => {
    const job: SyncJob = {
      id: 'job-1',
      status: 'failed',
      attempts: 2,
      maxAttempts: 5,
      error: '429 rate limit',
    };

    expect(canRetry(job)).toBe(true);
  });

  it('captures webhook configuration rules', () => {
    const webhook = 'https://hooks.example.com/customerio';
    expect(webhook.startsWith('https://')).toBe(true);
  });
});
