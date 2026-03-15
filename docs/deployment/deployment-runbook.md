# Deployment Runbook

## Pre-Deployment Checklist
1. Confirm `main` branch is green (build/tests/lint).
2. Confirm database migrations are reviewed and backward-compatible.
3. Confirm image published to GHCR with immutable tag.
4. Validate required secrets in Render/ECS:
   - `DATABASE_URL`
   - `REDIS_URL`
   - Clerk/AWS/OAuth keys (if used)
5. Confirm alerting and dashboards are active.

## Deployment Steps (Render)
1. Trigger deploy from target commit/image.
2. Monitor build logs and release phase output.
3. Validate probes:
   - `GET /health/live` returns 200
   - `GET /health/ready` returns 200
   - `GET /health` returns `healthy`
4. Execute smoke checks on core API endpoints.

## Deployment Steps (ECS Terraform Alternative)
1. Update `var.image` to immutable tag.
2. Run `terraform plan` and `terraform apply` in `infrastructure/`.
3. Watch ECS rollout for healthy replacement tasks.
4. Verify CloudWatch logs and health endpoints.

## Monitoring During Rollout
- Error rate (`5xx`) stays below 1%.
- p95 latency remains below 400ms on health/internal APIs.
- CPU and memory remain within autoscaling targets.
- DB pool waiting count does not trend upward continuously.

## Rollback Procedure
1. Re-deploy previous known-good image tag.
2. If schema incompatibility exists, execute documented rollback migration.
3. Re-check health endpoints and smoke tests.
4. Post incident update in deployment channel with timeline.

## Incident Escalation
- **Primary on-call:** Backend Platform Engineer
- **Secondary on-call:** Infrastructure Engineer
- **DB escalation:** Data Platform owner (Neon branch/restore authority)
- **Business escalation:** Engineering Manager

## Post-Deployment Verification
1. Confirm autoscaling stable for at least 30 minutes.
2. Confirm no new critical alerts.
3. Annotate deployment in monitoring timeline.
4. Record release details and follow-up actions.
