# TelemetryHub

**Multi-broker MQTT sensor data ingestion, storage, and visualization platform.**

Ingest numeric telemetry from one or more MQTT brokers simultaneously, store it in TimescaleDB, and visualize it in real-time through a web dashboard. Built for industrial IoT, environmental monitoring, and any scenario where multiple data streams need a unified view.

![Architecture](https://img.shields.io/badge/Go-1.26-blue) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![TimescaleDB](https://img.shields.io/badge/TimescaleDB-2.27-green) ![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Multi-broker MQTT** — Subscribe to multiple MQTT brokers with independent TLS, credentials, and topics. One bad broker doesn't block the others.
- **TimescaleDB storage** — Hypertables with automatic downsampling (15m/1h/1d buckets), compression, and configurable retention.
- **JWT authentication** — Role-based access (admin/user) with bcrypt passwords and session management.
- **Live dashboard** — Chart.js time-series graphs with configurable time ranges and field selection.
- **Field renaming** — Admin-configurable display names and units per device, persisted in the database.
- **Docker Compose** — Single command to deploy all services: database, MQTT broker, API server, and frontend.
- **QoS-1 dedup** — LRU cache + time-window deduplication for at-least-once MQTT delivery.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  MQTT Broker │     │  MQTT Broker │     │  MQTT Broker │     │  MQTT Simulator  │
│  (coreic)    │     │  (local)     │     │  (any)       │     │  (test data)     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘     └────────┬─────────┘
       │                     │                     │                     │
       └──────────┬──────────┘─────────────────────┘────────────────────┘
                  │
         ┌────────▼────────┐
         │  MQTT Worker    │   Go binary — subscribes, parses, inserts
         │  (embedded in   │
         │   API server)   │
         └────────┬────────┘
                  │
         ┌────────▼────────┐     ┌──────────────────┐
         │   TimescaleDB   │◄────│   API Server     │
         │   (PostgreSQL)  │     │   (Go/Echo)      │
         └─────────────────┘     └────────┬─────────┘
                                          │
                                 ┌────────▼─────────┐
                                 │  Next.js Frontend │
                                 │  (Chart.js)       │
                                 └───────────────────┘
```

## Quick Start

```bash
# 1. Clone and configure
git clone https://github.com/yourusername/telemetryhub
cd telemetryhub
cp .env.example .env
# Edit .env with your MQTT broker credentials and JWT secret

# 2. Start everything
docker compose up -d

# 3. Open the dashboard
open http://localhost:3000
# Login with admin@telemetryhub.local / (your ADMIN_PASSWORD)
```

### Services

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API Health | http://localhost:8080/api/v1/health |
| API Docs | http://localhost:8080/api/v1/swagger/index.html |
| Worker Health | http://localhost:9090/health |

## Configuration

All configuration is via environment variables — no YAML or JSON config files. Copy `.env.example` to `.env` and edit.

### Single Broker

```bash
MQTT_BROKER=broker.example.com
MQTT_PORT=8883
MQTT_TOPIC=#
MQTT_USERNAME=telemetryhub
MQTT_PASSWORD=your_password
MQTT_TLS=true
```

### Multi-Broker (JSON)

```bash
MQTT_BROKERS='[
  {"name":"coreic","broker":"mqtt.coreic.eu","port":8883,"topic":"CARDIMED/#","tls":true,"username":"ebos","password":"secret"},
  {"name":"local","broker":"mosquitto","port":1883,"topic":"sensors/#","tls":false}
]'
```

See [DEPLOY.md](DEPLOY.md) for the full reference of all environment variables.

## Development

```bash
# Backend
make build          # Build Go binaries to bin/
make test           # Run all tests
make migrate-up     # Apply database migrations

# Frontend (standalone)
cd frontend && npm install && npm run dev

# Start test data generator
docker compose up -d mqtt-simulator
```

### Project Structure

```
.
├── backend/
│   ├── cmd/
│   │   ├── api-server/         # HTTP API + embedded MQTT ingestion
│   │   └── mqtt-simulator/     # Test data publisher
│   ├── internal/
│   │   ├── auth/               # JWT, bcrypt, sessions, roles
│   │   ├── config/             # Env-based configuration
│   │   ├── database/           # pgx pool + goose migrations
│   │   ├── handlers/           # Echo HTTP handlers
│   │   ├── middleware/         # JWT auth, role enforcement
│   │   ├── mqtt/               # MQTT client, dedup, parsing
│   │   ├── server/             # Echo setup, routing, store adapter
│   │   └── store/              # TimescaleDB query layer
│   ├── migrations/             # Goose SQL migrations (8 files)
│   └── Makefile
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   ├── components/         # Shared UI components
│   │   ├── lib/                # API client, auth context
│   │   └── styles/             # Global CSS
│   └── Dockerfile
├── docker/                     # Dockerfiles for Go binaries
├── examples/                   # Sample MQTT payloads
├── docker-compose.yml          # All services
├── mosquitto.conf              # Local Mosquitto config
└── .env.example                # Environment variable template
```

## API Overview

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/v1/auth/login` | — | Login |
| `POST /api/v1/auth/register` | Admin | Create user |
| `GET /api/v1/devices` | User | List devices |
| `GET /api/v1/devices/:id/readings?fields=X&from=Y&to=Z` | User | Get time-series data |
| `PUT /api/v1/devices/:id` | Admin | Update device metadata |
| `DELETE /api/v1/devices/:id` | Admin | Delete device |
| `GET/POST/PUT/DELETE /api/v1/devices/:id/renames` | Admin | Field display name/unit CRUD |
| `GET /api/v1/admin/brokers` | Admin | Per-broker connection stats |

Readings are automatically downsampled based on the requested time range:
- **< 24 hours** → 15-minute buckets
- **24 hours – 7 days** → 1-hour buckets
- **> 7 days** → 1-day buckets

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.26, Echo v4, pgx v5 |
| Database | TimescaleDB 2.27 (PostgreSQL 16) |
| Frontend | Next.js 15, React 19, Chart.js 4 |
| Auth | JWT (HMAC-SHA256), bcrypt |
| MQTT | Eclipse Paho MQTT Go client |
| Migrations | Goose |
| Container | Docker Compose |
| Simulator | Built-in Go MQTT test data generator |

## License

MIT
