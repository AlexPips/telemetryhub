# TelemetryHub — Deployment Guide

## Architecture

```
MQTT Broker ──→ MQTT Worker (Go) ──→ TimescaleDB ←── API Server (Go) ←── Next.js Frontend
```

- **MQTT Worker**: Subscribes to broker, stores raw JSONB + numeric readings
- **API Server**: REST API with JWT auth, devices/readings/field-renames endpoints
- **Frontend**: Next.js dashboard with Chart.js, login, admin panel
- **Database**: TimescaleDB (PostgreSQL extension) with hypertables, compression, retention

## Quick Start (Docker Compose)

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env with your MQTT broker credentials and JWT secret

# 2. Start all services
docker compose up -d

# 3. Access the dashboard
# Frontend: http://localhost:3000
# API: http://localhost:8080/api/v1/health
# Worker health: http://localhost:9090/health

# Default admin credentials (set in .env):
# Email: admin@telemetryhub.local
# Password: (whatever you set in ADMIN_PASSWORD)
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `MQTT_BROKERS` | No | - | JSON array of brokers. Overrides the single-broker fields below when set. |
| `MQTT_BROKER` | Yes* | - | MQTT broker hostname (used when `MQTT_BROKERS` is unset) |
| `MQTT_PORT` | No | 1883 | MQTT broker port |
| `MQTT_TOPIC` | No | # | MQTT subscription topic |
| `MQTT_USERNAME` | No | - | MQTT username |
| `MQTT_PASSWORD` | Yes | - | MQTT password |
| `MQTT_QOS` | No | 1 | MQTT QoS level (0-2) |
| `MQTT_CLIENT_ID` | No | hostname | MQTT client ID |
| `MQTT_TLS` | No | true | Enable TLS (sets URL scheme to `ssl://`) |
| `MQTT_TLS_INSECURE` | No | false | Skip TLS verification |
| `JWT_SECRET` | Yes | - | JWT signing key (min 32 chars) |
| `SESSION_EXPIRY_HOURS` | No | 24 | Session duration |
| `ADMIN_EMAIL` | No | admin@telemetryhub.local | Auto-created admin email |
| `ADMIN_PASSWORD` | No | - | Auto-created admin password |
| `FRONTEND_URL` | No | http://localhost:3000 | CORS origin |
| `API_HOST` | No | 0.0.0.0 | API bind address |
| `API_PORT` | No | 8080 | API bind port |
| `RATE_LIMIT_PER_SEC` | No | 20 | API rate limit |
| `DB_MIN_CONNS` | No | 2 | Min DB pool connections |
| `DB_MAX_CONNS` | No | 10 | Max DB pool connections |
| `LOG_LEVEL` | No | info | Log level |

## Multi-Broker MQTT

TelemetryHub subscribes to one or more MQTT brokers. Each broker has its own
connection, topic, credentials, and TLS settings. All messages are stored in a
shared database; devices are uniquely identified by their `ID` payload field,
and the source broker is recorded as `broker_name` on every device.

Set `MQTT_BROKERS` to a JSON array to configure multiple brokers:

```bash
MQTT_BROKERS='[
  {
    "name": "coreic",
    "broker": "mqtt.coreic.eu",
    "port": 8883,
    "topic": "CARDIMED/EBOS/DEMO_9/#",
    "tls": true,
    "username": "ebos",
    "password": "your_password"
  },
  {
    "name": "local",
    "broker": "mosquitto",
    "port": 1883,
    "topic": "sensors/#",
    "tls": false
  }
]'
```

Defaults applied when fields are omitted:
- `name` → `broker-1`, `broker-2`, ...
- `qos` → `1`
- `port` → `8883` if `tls=true`, else `1883`
- `topic` → `#`

If `MQTT_BROKERS` is unset, the single-broker fields (`MQTT_BROKER`, `MQTT_PORT`,
`MQTT_TOPIC`, ...) are used. A single broker named `default` is synthesized.

The `GET /api/v1/admin/brokers` endpoint (admin role) returns per-broker
runtime statistics: connection state, message counts, last error, and last
message timestamp.

## Local Development

### Go Backend

```bash
# Build all binaries
make build

# Run MQTT Worker
DATABASE_URL=postgres://... MQTT_BROKER=localhost MQTT_PASSWORD=xxx JWT_SECRET=xxx go run cmd/mqtt-worker/main.go

# Run API Server
DATABASE_URL=postgres://... JWT_SECRET=xxx go run cmd/api-server/main.go

# Run tests
make test

# Run migrations manually
make migrate-up DATABASE_URL=postgres://...
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # Development server on :3000
npm run build        # Production build
npm start            # Production server
```

### MQTT Simulator

```bash
# Publish test data
go run cmd/mqtt-simulator/main.go --broker localhost:1883 --format all --interval 15s

# Publish specific format
go run cmd/mqtt-simulator/main.go --broker localhost:1883 --format cardimed_9_1 --devices 3
```

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 3000 | Next.js web app |
| API Server | 8080 | REST API |
| MQTT Worker | 9090 | Health check endpoint |
| TimescaleDB | 5432 | Database |

## Database Schema

| Table | Purpose | Retention |
|-------|---------|-----------|
| `raw_payloads` | Raw MQTT JSONB messages | 90 days |
| `readings` | Numeric sensor readings | 2 years |
| `devices` | Discovered devices | Permanent |
| `field_renames` | Admin field display config | Permanent |
| `users` | User accounts | Permanent |
| `sessions` | Active JWT sessions | Manual cleanup |

## API Endpoints

### Public
- `POST /api/v1/auth/login` — Login
- `GET /api/v1/health` — Health check

### Authenticated (JWT Bearer)
- `GET /api/v1/auth/me` — Current user
- `POST /api/v1/auth/logout` — Logout
- `POST /api/v1/auth/change-password` — Change password
- `GET /api/v1/devices` — List devices
- `GET /api/v1/devices/:id` — Get device
- `GET /api/v1/devices/:id/fields` — Get device fields
- `GET /api/v1/devices/:id/readings?fields=X&from=Y&to=Z` — Get readings

### Admin Only
- `POST /api/v1/auth/register` — Create user
- `PUT /api/v1/devices/:id` — Update device
- `DELETE /api/v1/devices/:id` — Delete device
- `POST/GET/PUT/DELETE /api/v1/devices/:id/renames` — Field renames CRUD

## Troubleshooting

### MQTT Worker not connecting
- Check `MQTT_BROKER`, `MQTT_PORT`, `MQTT_PASSWORD` env vars
- Verify TLS settings match broker configuration
- Check health endpoint: `curl http://localhost:9090/health`

### No data appearing
- Verify MQTT topic subscription matches published topics
- Check that messages contain an `ID` field (required)
- Check worker logs for dedup drops or parse errors

### API 401 errors
- Verify `JWT_SECRET` matches between API server and frontend
- Check token expiry (default 24 hours)

### Database connection failures
- Verify TimescaleDB is running and accessible
- Check `DATABASE_URL` format
- Worker and API auto-retry 3 times on startup
