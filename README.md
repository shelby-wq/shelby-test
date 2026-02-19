# Investor CRM

A compliant, full-stack investor lead management platform. Manage property/owner leads through a pipeline with CSV import, deduplication, enrichment, communications tracking, and audit logging.

## Tech Stack

- **Backend:** Node.js + TypeScript + Express + Prisma ORM
- **Database:** PostgreSQL
- **Queue:** BullMQ + Redis (enrichment and import jobs)
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Auth:** JWT-based (email/password)

## Quick Start

### Prerequisites

- Node.js 18+
- Docker and Docker Compose (for Postgres + Redis)

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (port 5432) and Redis (port 6379).

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` if needed (defaults work for local dev).

### 3. Install dependencies

```bash
npm install
```

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Seed the database

```bash
npm run db:seed
```

This creates:
- Organization: "Demo Investment Group"
- Admin user: `admin@demo.com` / `password123`
- Member user: `member@demo.com` / `password123`
- 5 sample leads with contacts, tags, and communications

### 6. Start the application

```bash
# Start both backend and frontend
npm run dev
```

- Backend API: http://localhost:4000
- Frontend: http://localhost:3000

### 7. Start the job worker (separate terminal)

```bash
cd backend && npm run worker
```

The worker processes enrichment requests and CSV imports.

## Project Structure

```
├── docker-compose.yml       # Postgres + Redis
├── .env.example             # Environment variable template
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma    # Data model
│   │   └── seed.ts          # Seed script
│   ├── src/
│   │   ├── index.ts         # Express server entry
│   │   ├── config.ts        # Environment config
│   │   ├── db.ts            # Prisma client
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Business logic
│   │   │   ├── audit.ts
│   │   │   ├── importer.ts
│   │   │   ├── deduper.ts
│   │   │   ├── enrichment/  # Provider adapter pattern
│   │   │   └── messaging/   # Stub gateway
│   │   ├── middleware/      # Auth middleware
│   │   ├── jobs/            # BullMQ workers
│   │   └── utils/           # Address normalizer, CSV parser
│   └── tests/               # Unit tests
└── frontend/
    └── src/
        ├── app/             # Next.js App Router pages
        ├── components/      # Shared components
        └── lib/             # API client, auth context
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register user + organization |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/dashboard/kpis` | Dashboard KPIs |
| GET | `/api/leads` | List leads (filterable) |
| POST | `/api/leads` | Create a lead |
| GET | `/api/leads/:id` | Lead detail |
| PATCH | `/api/leads/:id` | Update lead / status |
| GET | `/api/leads/export` | Export leads CSV |
| POST | `/api/leads/:id/tags` | Add tag |
| POST | `/api/import/upload` | Upload CSV |
| POST | `/api/import/start` | Start import with mapping |
| GET | `/api/import/:id` | Import status |
| POST | `/api/enrichment/request` | Request enrichment |
| GET | `/api/enrichment/purposes` | List permissible purposes |
| POST | `/api/communications` | Log communication |
| POST | `/api/contact-points` | Add contact point |
| GET | `/api/settings` | Get org settings |
| PATCH | `/api/settings/organization` | Update org |
| GET | `/api/settings/audit-log` | View audit log |

## Compliance Features

- **DNC Management:** Contact points carry a DNC flag; outbound SMS/calls are blocked for DNC contacts. Admin override requires a logged reason.
- **Consent Tracking:** Each contact point tracks consent status (Granted/Revoked/Unknown). SMS without consent triggers warnings.
- **Enrichment Compliance:** Every enrichment request requires a permissible purpose attestation and explicit user confirmation. No bulk enrichment.
- **A2P Campaign Metadata:** Organization stores brand and campaign ID for compliant A2P messaging.
- **Audit Log:** All significant actions (imports, status changes, enrichment requests, messaging attempts, DNC overrides) are logged with actor, before/after state, and timestamp.

## Enrichment Providers

The system uses a pluggable provider adapter pattern. By default, a mock provider returns fake data for development.

To configure a real authorized provider, set these environment variables:

```
ENRICHMENT_PROVIDER_NAME="your-provider"
ENRICHMENT_PROVIDER_API_KEY="your-key"
ENRICHMENT_PROVIDER_BASE_URL="https://api.provider.com"
```

The `GenericEnrichmentProvider` sends a POST to `{baseUrl}/lookup` — adjust the request/response mapping in `backend/src/services/enrichment/generic-provider.ts` to match your specific provider's API.

## Import / Deduplication

CSV imports support up to 200,000 rows with:
- Column mapping UI
- Address normalization (abbreviations, directionals, whitespace)
- Three-tier deduplication:
  1. **Primary:** Exact property address + ZIP match
  2. **Secondary:** Parcel ID match
  3. **Fallback:** Fuzzy owner name + address (conservative 85% threshold)
- Row-level error tracking

## Running Tests

```bash
npm test
```

Tests cover address normalization, CSV parsing, and the mock enrichment provider.
