# XCLSV Core Platform

Backend infrastructure for the XCLSV Events platform, Ambassador App, and Affiliate Portal.

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Fastify
- **Database:** PostgreSQL (Neon)
- **Authentication:** Clerk
- **Storage:** AWS S3
- **Documentation:** Swagger/OpenAPI

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Neon database account
- Clerk account
- AWS account (for S3)

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your credentials
```

### Development

```bash
# Start development server with hot reload
npm run dev
```

Server will start at `http://localhost:3000`

### API Documentation

Once running, visit `http://localhost:3000/documentation` for Swagger UI.

### Health Checks

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Basic health check |
| `GET /health/detailed` | Detailed service status |
| `GET /health/db` | Database health |
| `GET /health/storage` | S3 storage health |
| `GET /ready` | Kubernetes readiness probe |
| `GET /live` | Kubernetes liveness probe |

## Project Structure

```
src/
├── index.ts          # Entry point
├── app.ts            # Fastify app setup
├── config/           # Configuration
│   ├── env.ts        # Environment variables
│   └── database.ts   # Database connection
├── routes/           # API routes
│   ├── index.ts      # Route registration
│   └── health.ts     # Health check endpoints
├── middleware/       # Request middleware
│   ├── auth.ts       # Clerk authentication
│   ├── errorHandler.ts
│   └── validate.ts   # Zod validation
├── services/         # Business logic
│   ├── database.ts   # DB operations
│   └── storage.ts    # S3 operations
├── utils/            # Utilities
│   └── logger.ts     # Pino logger
└── types/            # TypeScript types
    └── index.ts
```

## Environment Variables

See `.env.example` for all required variables.

## Deployment

Build and run:

```bash
npm run build
npm start
```

## Work Order

This project was built following **WO-19** from 8090.ai Software Factory.
