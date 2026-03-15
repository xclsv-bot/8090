import { backupSchedules } from '../src/config/backup.js';
import { BackupService } from '../src/services/backupService.js';

function minutesSince(timestamp: Date): number {
  return (Date.now() - timestamp.getTime()) / (1000 * 60);
}

async function main(): Promise<void> {
  const service = new BackupService();

  let hasFailures = false;

  console.log('Backup verification report');
  console.log('==========================');

  for (const schedule of backupSchedules) {
    const latest = await service.getLatestBackupByType(schedule.type);

    if (!latest) {
      hasFailures = true;
      console.log(`- ${schedule.type}: MISSING (no backup records found)`);
      continue;
    }

    const ageMinutes = minutesSince(latest.timestamp);
    const isFresh = ageMinutes <= schedule.maxAllowedAgeMinutes;
    const isVerified = await service.verifyBackup(latest.id);

    const status = isFresh && isVerified ? 'OK' : 'ALERT';
    if (status === 'ALERT') {
      hasFailures = true;
    }

    console.log(
      `- ${schedule.type}: ${status} | age=${ageMinutes.toFixed(1)}m | size=${latest.size} bytes | location=${latest.location}`
    );

    if (!isFresh) {
      console.log(
        `  stale backup: expected <= ${schedule.maxAllowedAgeMinutes} minutes, got ${ageMinutes.toFixed(1)} minutes`
      );
    }

    if (!isVerified) {
      console.log('  integrity verification failed for backup location');
    }
  }

  if (hasFailures) {
    console.error('\nBackup verification completed with alerts.');
    process.exit(1);
  }

  console.log('\nBackup verification completed successfully.');
}

main().catch((error) => {
  console.error('Backup verification script failed:', error);
  process.exit(1);
});
