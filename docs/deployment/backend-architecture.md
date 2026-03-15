# Backend Deployment Architecture

## Platform
- **Primary hosting:** Render Web Service (`https://xclsv-core-platform.onrender.com`)
- **Runtime:** Node.js 20, Fastify + TypeScript
- **Container source:** Docker image built from repository `Dockerfile`

## High-Level Architecture
```text
Clients (Web/App/Integrations)
  -> Render Edge Router / TLS
    -> XCLSV Backend (Fastify, multiple instances)
      -> Neon PostgreSQL (primary data store)
      -> Redis (cache, queue/session support, health dependency)
      -> AWS S3 (object storage)
      -> External providers (Clerk, Customer.io, OAuth APIs)
```

## Containerization Strategy
- Multi-stage Node 20 Alpine build reduces image size.
- Production image runs as a non-root user.
- Startup command: `node dist/index.js`.
- Health probes:
  - `GET /health/live` for liveness
  - `GET /health/ready` for readiness (DB + Redis)

## Networking and Security
- Public ingress terminates TLS at Render.
- Backend binds to `0.0.0.0:$PORT` inside container.
- Outbound traffic allowed to Neon, Redis host, S3, and external APIs.
- Credentials injected as environment variables/secrets.

## Auto-Scaling Direction
- Render autoscaling for production service, with ECS Terraform parity in `infrastructure/backend-service.tf`.
- Baseline: 2 instances.
- Target tracking around CPU 65% and memory 70%.
- Cooldowns and step policies documented in `infrastructure/auto-scaling-policies.yml`.

## Operational Endpoints
- `GET /health` consolidated status + pool stats
- `GET /health/ready` deployment readiness
- `GET /health/live` process liveness
