import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { env } from '../config/env.js';
import { getBackupSchedule, type BackupType } from '../config/backup.js';
import { db, type DatabaseService } from './database.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const DEFAULT_BACKUP_DIRECTORY = resolve(process.cwd(), '.backups');

type BackupStatus = 'success' | 'failed';

export interface BackupRecord {
  id: string;
  type: BackupType;
  timestamp: Date;
  size: number;
  location: string;
  verifiedAt: Date | null;
}

export interface BackupTriggerResult {
  record: BackupRecord;
  status: BackupStatus;
}

export class BackupService {
  constructor(
    private readonly database: DatabaseService = db,
    private readonly backupDirectory = process.env.BACKUP_DIRECTORY || DEFAULT_BACKUP_DIRECTORY
  ) {}

  async triggerDatabaseBackup(): Promise<BackupTriggerResult> {
    const filename = `backup-${new Date().toISOString().replace(/[.:]/g, '-')}.sql`;
    const absoluteDirectory = resolve(this.backupDirectory);
    const absolutePath = resolve(absoluteDirectory, filename);

    await fs.mkdir(absoluteDirectory, { recursive: true });

    try {
      const { stderr } = await execFileAsync('pg_dump', ['--dbname', env.DATABASE_URL, '--file', absolutePath]);

      if (stderr.trim()) {
        logger.warn({ stderr, file: absolutePath }, 'pg_dump emitted warnings');
      }

      const stat = await fs.stat(absolutePath);

      const record = await this.recordBackup({
        type: 'database',
        size: stat.size,
        location: absolutePath,
      });

      logger.info(
        {
          backupId: record.id,
          file: basename(absolutePath),
          size: stat.size,
        },
        'Database backup completed'
      );

      return {
        record,
        status: 'success',
      };
    } catch (error) {
      logger.error({ error, file: absolutePath }, 'Database backup failed');
      throw error;
    }
  }

  async verifyBackup(recordId: string): Promise<boolean> {
    const backup = await this.database.queryOne<BackupRecord>(
      `SELECT id, type, timestamp, size, location, verified_at AS "verifiedAt"
       FROM backup_records
       WHERE id = $1`,
      [recordId]
    );

    if (!backup) {
      throw new Error(`Backup record not found: ${recordId}`);
    }

    const isValid = await this.verifyBackupLocation(backup.location, backup.size);

    if (isValid) {
      await this.database.query('UPDATE backup_records SET verified_at = NOW() WHERE id = $1', [backup.id]);
    }

    return isValid;
  }

  async getLatestBackupByType(type: BackupType): Promise<BackupRecord | null> {
    return this.database.queryOne<BackupRecord>(
      `SELECT id, type, timestamp, size, location, verified_at AS "verifiedAt"
       FROM backup_records
       WHERE type = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [type]
    );
  }

  async enforceRetention(type: BackupType): Promise<number> {
    const schedule = getBackupSchedule(type);
    const records = await this.database.queryMany<BackupRecord>(
      `SELECT id, type, timestamp, size, location, verified_at AS "verifiedAt"
       FROM backup_records
       WHERE type = $1
         AND timestamp < NOW() - ($2::text || ' days')::interval`,
      [type, String(schedule.retentionDays)]
    );

    let deletedCount = 0;

    for (const record of records) {
      if (await this.isLocalFile(record.location)) {
        try {
          await fs.unlink(record.location);
        } catch (error: unknown) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT') {
            logger.warn({ error, location: record.location }, 'Failed to delete local backup file during retention cleanup');
          }
        }
      }

      await this.database.query('DELETE FROM backup_records WHERE id = $1', [record.id]);
      deletedCount += 1;
    }

    return deletedCount;
  }

  async recordBackup(input: {
    type: BackupType;
    size: number;
    location: string;
    timestamp?: Date;
  }): Promise<BackupRecord> {
    const timestamp = input.timestamp ?? new Date();

    const result = await this.database.queryOne<BackupRecord>(
      `INSERT INTO backup_records (type, timestamp, size, location)
       VALUES ($1, $2, $3, $4)
       RETURNING id, type, timestamp, size, location, verified_at AS "verifiedAt"`,
      [input.type, timestamp, input.size, input.location]
    );

    if (!result) {
      throw new Error('Failed to persist backup record');
    }

    return result;
  }

  private async verifyBackupLocation(location: string, expectedSize: number): Promise<boolean> {
    if (await this.isLocalFile(location)) {
      try {
        const stat = await fs.stat(location);
        return stat.isFile() && stat.size >= expectedSize && stat.size > 0;
      } catch {
        return false;
      }
    }

    try {
      const response = await fetch(location, { method: 'HEAD' });
      if (!response.ok) {
        return false;
      }

      const lengthHeader = response.headers.get('content-length');
      const size = lengthHeader ? Number(lengthHeader) : undefined;

      return size !== undefined ? size >= expectedSize : true;
    } catch {
      return false;
    }
  }

  private async isLocalFile(location: string): Promise<boolean> {
    return !/^https?:\/\//i.test(location);
  }
}

export const backupService = new BackupService();
