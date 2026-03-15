# DR Testing Schedule

## Cadence
- Quarterly: Full disaster recovery simulation
- Monthly: Backup verification and restore-to-test-branch validation
- Weekly: Review backup age and retention enforcement logs

## Test Scenarios
1. Database recovery using Neon PITR
2. Render backend redeploy from known-good commit
3. Vercel frontend rollback to prior deployment
4. Combined Tier 1 restoration under RTO pressure (1 hour target)

## Quarterly Full DR Test Checklist
- [ ] Incident declared and timeline started
- [ ] Recovery point selected and justified
- [ ] Database restored or branch promoted
- [ ] Backend redeployed and healthy
- [ ] Frontend redeployed and healthy
- [ ] Tier 1 smoke tests passed
- [ ] RTO and RPO measured and documented

## Monthly Backup Verification Checklist
- [ ] Latest backup for each type exists
- [ ] `scripts/verify-backup.ts` executed successfully
- [ ] Backup freshness is within target windows
- [ ] Integrity verification passed
- [ ] Retention policy cleanup validated

## Results Template
- Test date:
- Test type: (monthly verification / quarterly full DR)
- Owner:
- Scenario:
- Start time:
- Recovery complete time:
- Measured RTO:
- Measured RPO:
- Result: (passed / failed / partial)
- Notes:
- Follow-up actions:
