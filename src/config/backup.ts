export type BackupType = 'database' | 'configuration' | 'application_state';

export interface BackupSchedule {
  type: BackupType;
  frequencyCron: string;
  retentionDays: number;
  maxAllowedAgeMinutes: number;
  description: string;
}

export interface BackupDataScope {
  type: BackupType;
  includes: string[];
  excludes: string[];
}

export const backupSchedules: BackupSchedule[] = [
  {
    type: 'database',
    frequencyCron: '*/15 * * * *',
    retentionDays: 30,
    maxAllowedAgeMinutes: 15,
    description: 'Primary transactional data snapshot and verification cadence.',
  },
  {
    type: 'configuration',
    frequencyCron: '0 */6 * * *',
    retentionDays: 90,
    maxAllowedAgeMinutes: 360,
    description: 'Environment and deployment configuration capture cadence.',
  },
  {
    type: 'application_state',
    frequencyCron: '0 0 * * *',
    retentionDays: 30,
    maxAllowedAgeMinutes: 1_440,
    description: 'Application-level state exports (non-database) cadence.',
  },
];

export const backupDataScopes: BackupDataScope[] = [
  {
    type: 'database',
    includes: ['PostgreSQL schema', 'PostgreSQL data', 'Migration metadata'],
    excludes: ['Transient temp tables', 'Read replicas'],
  },
  {
    type: 'configuration',
    includes: ['Render service settings', 'Vercel project settings', 'Infrastructure manifests'],
    excludes: ['Plaintext secrets', 'Ephemeral deploy logs'],
  },
  {
    type: 'application_state',
    includes: ['Job metadata', 'Export metadata', 'Audit metadata'],
    excludes: ['Compiled artifacts', 'Derived cache records'],
  },
];

export function getBackupSchedule(type: BackupType): BackupSchedule {
  const schedule = backupSchedules.find((item) => item.type === type);

  if (!schedule) {
    throw new Error(`No backup schedule configured for backup type: ${type}`);
  }

  return schedule;
}

export function getBackupScope(type: BackupType): BackupDataScope {
  const scope = backupDataScopes.find((item) => item.type === type);

  if (!scope) {
    throw new Error(`No backup scope configured for backup type: ${type}`);
  }

  return scope;
}
