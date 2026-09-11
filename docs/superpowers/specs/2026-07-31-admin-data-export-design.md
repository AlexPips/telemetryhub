# Admin Data Export — Design

**Date:** 2026-07-31
**Status:** Proposed
**Commit:** 5a903ee
**Feature:** Admin can download sensor readings from the database as CSV or JSON, per device, from the device settings modal.

## 1. Overview

The admin opens the settings for a device (existing `DeviceSettingsModal`), where a new **Export Data** tab appears. Inside it, the admin:

1. Selects which chart groups and/or individual sensors of that device to export.
2. Picks a custom `from` / `to` time range.
3. Clicks **Download CSV** or **Download JSON**.

The backend streams the matching readings from TimescaleDB directly into the file response. No intermediate storage, no async jobs.

## 2. Scope

- **Single device only.** The tab lives inside a device's settings modal and exports data for that device. Multi-device export is explicitly out of scope (API shape leaves room for a `device_id` param change later, but no design work now).
- **Admin only.** The endpoint is admin-gated (`RequireRole("admin")`); the tab renders only for admins.
- **Raw readings, not downsampled.** Export gives the actual recorded values (the chart API's downsampling is not applied).
- **Read-only.** No schema changes, no new tables, no new binaries.

## 3. Backend

### 3.1 Endpoint

```
GET /api/v1/devices/:id/export
```

Registered in `adminGroup` in `backend/internal/server/server.go` (admin-only).

Query parameters:

| Param | Required | Description |
|---|---|---|
| `fields` | yes | Comma-separated raw field names (e.g. `temperature,humidity`) |
| `from` | yes | RFC3339 start time (no default) |
| `to` | yes | RFC3339 end time (no default) |
| `format` | no | `csv` (default) or `json` |

Validation (all failures return the existing `{"error": "..."}` shape with HTTP 400):

- `fields` empty → error
- `from` or `to` missing/invalid RFC3339 → error
- `from >= to` → error
- Range longer than **1 year** → error

Response is a streaming attachment:

- **CSV:** `Content-Type: text/csv`, `Content-Disposition: attachment; filename="<deviceId>_<from>_<to>.csv"`. Header row: `timestamp,field_name,display_name,unit,value`.
- **JSON:** `Content-Type: application/json`, attachment. Body: array of `{"timestamp","field_name","display_name","unit","value"}` objects. The key is `timestamp` (not `bucket` as in the chart API) — export is raw readings, not time-bucketed, and the name should say what it is.

Rows ordered `ts ASC, field_name`. Same `LEFT JOIN field_renames` as the existing chart query, so display names and units are applied.

### 3.2 Row cap

A `COUNT(*)` runs first with the same filters (`device_id`, `field_name = ANY(fields)`, `ts` range).

- Count **> 500,000** → HTTP 400, error message: `Export exceeds 500k rows. Narrow the time range or select fewer sensors.` Nothing is streamed.
- Count **≤ 500,000** → stream begins.

Cap is a constant (`maxExportRows = 500_000`) in the handler package.

### 3.3 Store layer

Two functions added to `backend/internal/store/store.go` (or a new `export.go` in the same package — decided at plan time; both match existing layout):

```go
// CountReadings returns the number of matching readings for the export cap check.
func (s *Store) CountReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) (int64, error)

// StreamReadings streams matching readings to fn, one row at a time.
// Memory stays bounded regardless of result size.
func (s *Store) StreamReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time, fn func(ReadingResult) error) error
```

`StreamReadings` reuses the existing `GetReadings` SQL (SELECT with the `field_renames` JOIN) but iterates pgx rows and calls `fn` per row instead of collecting a slice.

### 3.4 Handler

New `backend/internal/handlers/export.go` with `ExportHandler` (or an `Export` method on `ReadingHandler` — decided at plan time; both follow existing patterns). It:

1. Validates query params (rules in §3.1).
2. Calls `CountReadings`; rejects if over cap.
3. Sets `Content-Type` + `Content-Disposition` headers (sanitized filename).
4. Calls `StreamReadings`, writing each row:
   - CSV: via `encoding/csv.Writer`
   - JSON: as a streamed array (`[` … `]` with comma separators)
5. Flushes, returns nil.

Swagger annotations added, matching the other endpoints.

## 4. Frontend

### 4.1 New tab: "Export Data"

Third tab in `frontend/src/components/device-settings-modal.tsx`, next to Sensors and Groups (`<Tabs.Tab value="export">`). Rendered **only when the current user's role is `admin`** (via `useAuth()`).

Contents:

1. **Sensor selection** — a checkbox tree:
   - One checkbox per chart group (from the `renames` prop already passed to the modal), with nested checkboxes for that group's sensors. Group checkbox toggles all its sensors.
   - Ungrouped sensors (no `chart_group`) listed under an "Ungrouped" section.
   - "Select all" / "Clear" buttons.
   - Selected fields collected as raw field names.
2. **Time range** — two `datetime-local` inputs (`from`, `to`), converted to UTC RFC3339 before the API call.
3. **Actions** — **Download CSV** and **Download JSON** buttons, disabled when no sensors are selected or the range is invalid.

Download flow:

- `fetch(exportUrl, { headers: { Authorization: Bearer <token> } })`
- Response `ok` → `res.blob()` → object URL → hidden `<a download>` click → revoke URL.
- Response `!ok` → parse `{"error"}` and display it in the tab (e.g. the 500k cap message, invalid range).

### 4.2 API client

`frontend/src/lib/api.ts` gains:

```ts
export async function exportDeviceData(
  deviceId: string,
  fields: string[],
  from: string, // RFC3339
  to: string,   // RFC3339
  format: 'csv' | 'json'
): Promise<Blob>
```

Throws `Error(message)` from the backend's `{"error"}` on failure, returns the blob on success.

## 5. Edge cases

| Case | Behavior |
|---|---|
| No sensors selected | Buttons disabled; no request sent |
| Empty result (0 rows) | CSV: header row only. JSON: `[]`. Both download as valid files |
| Row cap exceeded | 400 with message shown in tab; nothing downloaded |
| Range > 1 year or `from >= to` | 400 with message shown in tab |
| Device ID contains filename-unsafe chars (`/`, `:`, etc.) | Sanitized in the `Content-Disposition` filename |
| Non-admin user opens settings | Tab not rendered; endpoint also rejects non-admins server-side |
| Large-but-legal export (≤500k rows) | Streamed; memory bounded by the streaming store function |

## 6. Testing

- **Store:** `CountReadings` and `StreamReadings` tests matching existing backend test patterns (same DB/mocking approach used by current store tests).
- **Handler:** table-driven tests for — missing/invalid params, `from >= to`, range > 1 year, cap rejection, CSV shape, JSON shape, streaming with 0 rows.
- **Frontend:** component renders for admin, hidden for non-admin; selection state (group toggle, select all/clear); download buttons disabled state. Uses whatever test setup the frontend already has (none confirmed yet — if none exists, add minimal vitest setup or verify manually; decided at plan time).

## 7. Out of scope

- Multi-device / cross-device export
- Async export jobs, file storage, download history
- Wide-format CSV
- Downsampled/aggregated export
- Row-count preview in UI
- Anything beyond raw readings for a single device

## 8. Open decisions (resolved at plan time)

- `ExportHandler` new file vs `Export` method on `ReadingHandler`
- New `store/export.go` vs appending to `store/store.go`
- Frontend test setup: existing vs minimal new setup vs manual verification
