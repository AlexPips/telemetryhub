# Admin Data Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only "Export Data" tab to the device settings modal that streams a device's raw readings as a downloadable CSV or JSON file.

**Architecture:** New admin-gated endpoint `GET /api/v1/devices/:id/export` streams rows directly from TimescaleDB into the HTTP response (CSV via `encoding/csv`, JSON as a streamed array), bounded by a 500k row cap enforced by a `COUNT(*)` pre-check. The handler depends on a narrow `ExportStore` interface implemented by the existing `StoreAdapter`. Frontend gets a third tab in `DeviceSettingsModal` (admin-only) with group/sensor checkboxes, custom time range, and CSV/JSON download buttons.

**Tech Stack:** Go 1.26 / Echo v4 / pgx v5 (TimescaleDB), Next.js 15 / React 19 / TypeScript.

## Global Constraints

- No YAML/JSON config files — all configuration env-var driven. No new config vars for this feature.
- No raw SQL without parameterized queries (pgx `$1..$N` placeholders). The `fields` list must be passed as a pgx array (`= ANY($2)`), never string-concatenated.
- Admin endpoints MUST be registered under the existing `adminGroup` (which applies `RequireRole("admin")`) — do NOT add the export route to `authGroup`.
- No new binaries outside `backend/cmd/`.
- Do not import `internal/` packages from outside the module.
- Go code must pass `gofmt` and `go vet ./...`.
- Frontend: token from `localStorage('auth_token')` via existing `getHeaders()` — do not hardcode API URLs, always use `API_URL` from `api.ts`. Dashboard pages are client-side authenticated (`'use client'`).
- Row cap constant: `500_000`. Range cap: 1 year (`365 * 24 * time.Hour`).
- Export columns (long format): `timestamp, field_name, display_name, unit, value`. JSON key is `timestamp` (NOT `bucket`).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/internal/handlers/export.go` | Create | `ExportStore` interface, `ExportHandler`, validation, CSV/JSON streaming |
| `backend/internal/handlers/export_test.go` | Create | Unit tests for `ExportHandler` using a fake `ExportStore` |
| `backend/internal/server/store_adapter.go` | Modify | Implement `CountReadings` + `StreamReadings` (+ compile-time interface assertion) |
| `backend/internal/server/server.go` | Modify | Wire `exportH` into `Server` struct, register admin route |
| `frontend/src/lib/api.ts` | Modify | Add `exportDeviceData()` returning `Blob` |
| `frontend/src/components/device-settings-modal.tsx` | Modify | Add admin-gated "Export Data" tab + `ExportTab` component |

---

### Task 1: ExportHandler + unit tests

**Files:**
- Create: `backend/internal/handlers/export.go`
- Test: `backend/internal/handlers/export_test.go`

**Interfaces:**
- Consumes: `ReadingResult` (already defined in `handlers/devices.go` — `Bucket time.Time`, `FieldName`, `DisplayName`, `Unit string`, `Value float64`); `splitFields(string) []string` (already defined in `handlers/readings.go`)
- Produces: `ExportStore` interface (consumed by Task 2's `StoreAdapter` and Task 3's route wiring):
  ```go
  type ExportStore interface {
      CountReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) (int64, error)
      StreamReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time, fn func(ReadingResult) error) error
  }
  ```
  And `ExportHandler` with method `Export(c echo.Context) error`.

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/handlers/export_test.go`:

```go
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
)

// fakeExportStore implements ExportStore with configurable rows/errors.
type fakeExportStore struct {
	count int64
	rows  []ReadingResult
	err   error
}

func (f *fakeExportStore) CountReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) (int64, error) {
	return f.count, f.err
}

func (f *fakeExportStore) StreamReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time, fn func(ReadingResult) error) error {
	if f.err != nil {
		return f.err
	}
	for _, r := range f.rows {
		if err := fn(r); err != nil {
			return err
		}
	}
	return nil
}

// newExportCtx builds an Echo context for a GET request to target.
func newExportCtx(t *testing.T, target string) (echo.Context, *httptest.ResponseRecorder) {
	t.Helper()
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	rec := httptest.NewRecorder()
	return e.NewContext(req, rec), rec
}

func TestExport_RequiresFields(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{})
	c, rec := newExportCtx(t, "/devices/dev1/export?from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestExport_RequiresFrom(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&to=2026-07-02T00:00:00Z")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestExport_ToBeforeFrom(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&from=2026-07-02T00:00:00Z&to=2026-07-01T00:00:00Z")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestExport_RangeTooLong(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&from=2025-01-01T00:00:00Z&to=2026-07-01T00:00:00Z")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestExport_InvalidFormat(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z&format=xml")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}

func TestExport_ExceedsRowCap(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{count: 500_001})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to parse body: %v", err)
	}
	if !strings.Contains(body["error"], "500k") {
		t.Fatalf("expected cap message mentioning 500k, got: %q", body["error"])
	}
}

func TestExport_CSV(t *testing.T) {
	rows := []ReadingResult{
		{Bucket: time.Date(2026, 7, 1, 10, 0, 0, 0, time.UTC), FieldName: "temp", DisplayName: "Temperature", Unit: "°C", Value: 23.4},
		{Bucket: time.Date(2026, 7, 1, 10, 0, 5, 0, time.UTC), FieldName: "temp", DisplayName: "Temperature", Unit: "°C", Value: 23.5},
	}
	h := NewExportHandler(&fakeExportStore{count: 2, rows: rows})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z&format=csv")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/csv" {
		t.Fatalf("expected text/csv, got %q", ct)
	}
	if cd := rec.Header().Get("Content-Disposition"); !strings.Contains(cd, `filename="dev1_`) || !strings.HasSuffix(cd, `.csv"`) {
		t.Fatalf("unexpected Content-Disposition: %q", cd)
	}
	lines := strings.Split(strings.TrimSpace(rec.Body.String()), "\n")
	if len(lines) != 3 {
		t.Fatalf("expected 3 CSV lines, got %d: %q", len(lines), rec.Body.String())
	}
	if lines[0] != "timestamp,field_name,display_name,unit,value" {
		t.Fatalf("unexpected header: %q", lines[0])
	}
	if !strings.Contains(lines[1], "23.4") {
		t.Fatalf("missing value in row: %q", lines[1])
	}
}

func TestExport_JSON(t *testing.T) {
	rows := []ReadingResult{
		{Bucket: time.Date(2026, 7, 1, 10, 0, 0, 0, time.UTC), FieldName: "temp", DisplayName: "Temperature", Unit: "°C", Value: 23.4},
	}
	h := NewExportHandler(&fakeExportStore{count: 1, rows: rows})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z&format=json")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("body is not valid JSON array: %v\nbody: %s", err, rec.Body.String())
	}
	if len(out) != 1 {
		t.Fatalf("expected 1 row, got %d", len(out))
	}
	row := out[0]
	if row["timestamp"] != "2026-07-01T10:00:00Z" || row["field_name"] != "temp" ||
		row["display_name"] != "Temperature" || row["unit"] != "°C" || row["value"] != 23.4 {
		t.Fatalf("unexpected row: %v", row)
	}
}

func TestExport_EmptyCSV(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{count: 0})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != "timestamp,field_name,display_name,unit,value" {
		t.Fatalf("expected header only, got: %q", got)
	}
}

func TestExport_EmptyJSON(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{count: 0})
	c, rec := newExportCtx(t, "/devices/dev1/export?fields=temp&from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z&format=json")
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out []any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("body is not valid JSON array: %v", err)
	}
	if len(out) != 0 {
		t.Fatalf("expected empty array, got %v", out)
	}
}

func TestExport_FilenameSanitized(t *testing.T) {
	h := NewExportHandler(&fakeExportStore{count: 0})
	c, rec := newExportCtx(t, "/devices/we%2Fird/export?fields=temp&from=2026-07-01T00:00:00Z&to=2026-07-02T00:00:00Z")
	c.SetParamNames("id")
	c.SetParamValues("we/ird")

	if err := h.Export(c); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}
	if cd := rec.Header().Get("Content-Disposition"); strings.Contains(cd, "we/ird") {
		t.Fatalf("filename not sanitized: %q", cd)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/handlers/ -run TestExport -v`
Expected: FAIL — compile error `undefined: ExportStore` / `undefined: NewExportHandler`

- [ ] **Step 3: Write the implementation**

Create `backend/internal/handlers/export.go`:

```go
package handlers

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/labstack/echo/v4"
)

// maxExportRows caps the number of rows a single export may contain.
const maxExportRows = 500_000

// maxExportRange caps the allowed from/to span at 1 year.
const maxExportRange = 365 * 24 * time.Hour

// ExportStore defines the data operations needed by the export handler.
type ExportStore interface {
	CountReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) (int64, error)
	StreamReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time, fn func(ReadingResult) error) error
}

// ExportHandler handles data export endpoints.
type ExportHandler struct {
	store ExportStore
}

// NewExportHandler creates a new export handler.
func NewExportHandler(store ExportStore) *ExportHandler {
	return &ExportHandler{store: store}
}

// unsafeFilenameChars matches characters that are unsafe in Content-Disposition filenames.
var unsafeFilenameChars = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

// Export     Export device readings
// @Summary      Export device readings
// @Description  Streams raw readings for a device as a CSV or JSON attachment (admin only).
// @Tags         export
// @Produce      text/csv
// @Produce      application/json
// @Security     BearerAuth
// @Param        id     path  string true  "Device ID"
// @Param        fields query string true  "Comma-separated field names (e.g. temperature,humidity)"
// @Param        from   query string true  "Start time in RFC3339 format"
// @Param        to     query string true  "End time in RFC3339 format"
// @Param        format query string false "csv or json (default: csv)"
// @Success      200 {file} binary
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      403 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id}/export [get]
func (h *ExportHandler) Export(c echo.Context) error {
	deviceID := c.Param("id")

	fields := splitFields(c.QueryParam("fields"))
	if len(fields) == 0 {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "fields parameter required"})
	}

	from, err := parseTimeParam(c.QueryParam("from"), "from")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	to, err := parseTimeParam(c.QueryParam("to"), "to")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	if !to.After(from) {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "'to' must be after 'from'"})
	}
	if to.Sub(from) > maxExportRange {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Export range cannot exceed 1 year"})
	}

	format := c.QueryParam("format")
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "json" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "format must be 'csv' or 'json'"})
	}

	ctx := c.Request().Context()
	count, err := h.store.CountReadings(ctx, deviceID, fields, from, to)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to count readings"})
	}
	if count > maxExportRows {
		return c.JSON(http.StatusBadRequest, map[string]string{
			"error": "Export exceeds 500k rows. Narrow the time range or select fewer sensors.",
		})
	}

	base := unsafeFilenameChars.ReplaceAllString(deviceID, "_")
	fromStamp := from.UTC().Format("20060102-150405")
	toStamp := to.UTC().Format("20060102-150405")

	if format == "json" {
		c.Response().Header().Set(echo.HeaderContentType, "application/json")
		c.Response().Header().Set(echo.HeaderContentDisposition,
			fmt.Sprintf(`attachment; filename="%s_%s_%s.json"`, base, fromStamp, toStamp))
		return h.streamJSON(ctx, c, deviceID, fields, from, to)
	}

	c.Response().Header().Set(echo.HeaderContentType, "text/csv")
	c.Response().Header().Set(echo.HeaderContentDisposition,
		fmt.Sprintf(`attachment; filename="%s_%s_%s.csv"`, base, fromStamp, toStamp))
	return h.streamCSV(ctx, c, deviceID, fields, from, to)
}

func parseTimeParam(s, name string) (time.Time, error) {
	if s == "" {
		return time.Time{}, fmt.Errorf("'%s' parameter required", name)
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid '%s' parameter", name)
	}
	return t, nil
}

func (h *ExportHandler) streamCSV(ctx context.Context, c echo.Context, deviceID string, fields []string, from, to time.Time) error {
	w := csv.NewWriter(c.Response())
	if err := w.Write([]string{"timestamp", "field_name", "display_name", "unit", "value"}); err != nil {
		return err
	}
	err := h.store.StreamReadings(ctx, deviceID, fields, from, to, func(r ReadingResult) error {
		return w.Write([]string{
			r.Bucket.UTC().Format(time.RFC3339),
			r.FieldName,
			r.DisplayName,
			r.Unit,
			strconv.FormatFloat(r.Value, 'f', -1, 64),
		})
	})
	if err != nil {
		return err
	}
	w.Flush()
	return w.Error()
}

func (h *ExportHandler) streamJSON(ctx context.Context, c echo.Context, deviceID string, fields []string, from, to time.Time) error {
	w := c.Response()
	if _, err := w.Write([]byte("[")); err != nil {
		return err
	}
	first := true
	err := h.store.StreamReadings(ctx, deviceID, fields, from, to, func(r ReadingResult) error {
		prefix := ",\n  "
		if first {
			prefix = "\n  "
			first = false
		}
		if _, err := w.Write([]byte(prefix)); err != nil {
			return err
		}
		return json.NewEncoder(w).Encode(struct {
			Timestamp   string  `json:"timestamp"`
			FieldName   string  `json:"field_name"`
			DisplayName string  `json:"display_name"`
			Unit        string  `json:"unit"`
			Value       float64 `json:"value"`
		}{
			Timestamp:   r.Bucket.UTC().Format(time.RFC3339),
			FieldName:   r.FieldName,
			DisplayName: r.DisplayName,
			Unit:        r.Unit,
			Value:       r.Value,
		})
	})
	if err != nil {
		return err
	}
	_, err = w.Write([]byte("\n]\n"))
	return err
}
```

Note: if streaming fails mid-response (DB error after headers sent), the client receives a truncated file — this is inherent to streaming and acceptable; the error is logged by Echo's Recover/Logger middleware.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && gofmt -w internal/handlers/export.go internal/handlers/export_test.go && go test ./internal/handlers/ -run TestExport -v`
Expected: all `TestExport_*` PASS

- [ ] **Step 5: Run full backend test suite**

Run: `cd backend && go vet ./... && go test ./...`
Expected: all PASS (existing auth/config/mqtt tests still green)

- [ ] **Step 6: Commit**

```bash
git add backend/internal/handlers/export.go backend/internal/handlers/export_test.go
git commit -m "feat(handlers): add admin data export handler with csv/json streaming"
```

---

### Task 2: StoreAdapter — CountReadings + StreamReadings

**Files:**
- Modify: `backend/internal/server/store_adapter.go` (append after `GetReadings`, line ~145)

**Interfaces:**
- Consumes: `handlers.ExportStore` (from Task 1), `handlers.ReadingResult` (from `handlers/devices.go`)
- Produces: `StoreAdapter` satisfying `handlers.ExportStore` (compile-time asserted), consumed by Task 3's route wiring

- [ ] **Step 1: Write the implementation**

Append to `backend/internal/server/store_adapter.go`:

```go
func (a *StoreAdapter) CountReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) (int64, error) {
	var count int64
	err := a.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM readings
		WHERE device_id = $1 AND field_name = ANY($2)
		  AND ts > $3 AND ts < $4
	`, deviceID, fields, from, to).Scan(&count)
	return count, err
}

func (a *StoreAdapter) StreamReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time, fn func(handlers.ReadingResult) error) error {
	rows, err := a.pool.Query(ctx, `
		SELECT r.ts as bucket, r.field_name,
		       r.value as value,
		       COALESCE(fr.display_name, r.field_name) as display_name,
		       COALESCE(fr.unit, '') as unit
		FROM readings r
		LEFT JOIN field_renames fr ON fr.device_id = r.device_id AND fr.raw_field = r.field_name
		WHERE r.device_id = $1 AND r.field_name = ANY($2)
		  AND r.ts > $3 AND r.ts < $4
		ORDER BY r.ts, r.field_name
	`, deviceID, fields, from, to)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var r handlers.ReadingResult
		if err := rows.Scan(&r.Bucket, &r.FieldName, &r.Value, &r.DisplayName, &r.Unit); err != nil {
			return err
		}
		if err := fn(r); err != nil {
			return err
		}
	}
	return rows.Err()
}
```

Also append this compile-time assertion at the end of the file (after the last method):

```go
// Compile-time check that StoreAdapter satisfies the handler store interfaces.
var _ handlers.ExportStore = (*StoreAdapter)(nil)
```

- [ ] **Step 2: Verify build**

Run: `cd backend && gofmt -w internal/server/store_adapter.go && go build ./...`
Expected: exit 0, no output. (The `var _` assertion fails to compile if `StoreAdapter` doesn't satisfy `ExportStore`.)

- [ ] **Step 3: Commit**

```bash
git add backend/internal/server/store_adapter.go
git commit -m "feat(store): add CountReadings and StreamReadings for export"
```

---

### Task 3: Wire route in server.go

**Files:**
- Modify: `backend/internal/server/server.go`

**Interfaces:**
- Consumes: `handlers.NewExportHandler(store)` where `store` is the existing `StoreAdapter` (now satisfies `ExportStore`); `handlers.ExportHandler.Export` method (Task 1)
- Produces: live route `GET /api/v1/devices/:id/export` (admin-gated)

- [ ] **Step 1: Add the export handler to the Server struct and constructor**

In `server.go`:

1. Add field to `Server` struct (after `devGroupH` on line 34):
   ```go
   exportH  *handlers.ExportHandler
   ```

2. In `New()` (after `devGroupH := handlers.NewDeviceGroupHandler(store)` on line 63):
   ```go
   exportH := handlers.NewExportHandler(store)
   ```

3. Set it in the struct literal (after `devGroupH: devGroupH,`):
   ```go
   exportH:   exportH,
   ```

- [ ] **Step 2: Register the route in setupRoutes()**

In `setupRoutes()`, inside the `adminGroup` block (after `adminGroup.GET("/brokers", s.listBrokers)` on line 130):

```go
	// Data export (admin)
	adminGroup.GET("/devices/:id/export", s.exportH.Export)
```

- [ ] **Step 3: Verify build and full test suite**

Run: `cd backend && gofmt -w internal/server/server.go && go build ./... && go vet ./... && go test ./...`
Expected: exit 0, all tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/internal/server/server.go
git commit -m "feat(server): register admin export endpoint"
```

---

### Task 4: Frontend API client

**Files:**
- Modify: `frontend/src/lib/api.ts` (append after `setDeviceGroup`, end of file)

**Interfaces:**
- Consumes: `API_URL`, `getHeaders()` (both already in `api.ts`)
- Produces: `exportDeviceData(deviceId, fields, from, to, format) → Promise<Blob>`, consumed by Task 5's `ExportTab`

- [ ] **Step 1: Write the implementation**

Append to `frontend/src/lib/api.ts`:

```ts
export async function exportDeviceData(
  deviceId: string,
  fields: string[],
  from: string,
  to: string,
  format: 'csv' | 'json'
): Promise<Blob> {
  const params = new URLSearchParams({
    fields: fields.join(','),
    from,
    to,
    format,
  });
  const res = await fetch(
    `${API_URL}/devices/${encodeURIComponent(deviceId)}/export?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Export failed' }));
    throw new Error(err.error || 'Export failed');
  }
  return res.blob();
}
```

- [ ] **Step 2: Verify type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exit 0, no type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(frontend): add exportDeviceData api client"
```

---

### Task 5: Frontend Export Data tab

**Files:**
- Modify: `frontend/src/components/device-settings-modal.tsx`

**Interfaces:**
- Consumes: `exportDeviceData` (Task 4), `useAuth` from `@/lib/auth-context` (existing), `renames: FieldRename[]` + `fields: string[]` + `groupContext` props (already passed into `DeviceSettingsModal`)
- Produces: admin-gated "Export Data" tab with `ExportTab` component

- [ ] **Step 1: Add imports**

At the top of `device-settings-modal.tsx`, extend the `@/lib/api` import with `exportDeviceData`, and add the auth context import:

```tsx
import {
  updateDevice,
  deleteDevice,
  deleteDeviceField,
  createRename,
  updateRename,
  deleteRename,
  updateGroupConfig,
  updateSubGroupConfig,
  exportDeviceData,
  type Device,
  type FieldRename,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
```

- [ ] **Step 2: Gate the tab on admin role**

In `DeviceSettingsModal`, add after `const router = useRouter();` (line 68):

```tsx
const { isAdmin } = useAuth();
```

(`useAuth()` from `@/lib/auth-context` already exposes `isAdmin` computed as `user?.role === 'admin'` — verified against `auth-context.tsx` line 48.)

In the `<Tabs.Root defaultValue="sensors">` block (after the "Groups" `<Tabs.Tab>` on line 245), add the third tab conditionally:

```tsx
{isAdmin && (
  <Tabs.Tab
    value="export"
    className="px-4 py-2.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent transition-colors cursor-pointer data-[selected]:text-foreground data-[selected]:border-primary aria-selected:text-foreground aria-selected:border-primary aria-selected:bg-muted/50"
  >
    Export Data
  </Tabs.Tab>
)}
```

After the Groups `<Tabs.Panel>` (line 271), add the panel conditionally:

```tsx
{isAdmin && (
  <Tabs.Panel value="export" className="pt-4 min-w-0">
    <ExportTab
      deviceId={deviceId}
      fields={fields}
      renames={renames}
      groupContext={groupContext}
      allGroups={allGroupsSorted}
    />
  </Tabs.Panel>
)}
```

- [ ] **Step 3: Write the ExportTab component**

Append the following component at the end of the file (after `GroupsTab`, following the same `/* ──── */` section-comment style):

```tsx
/* ──────────────────────────── Export Data Tab ──────────────────────────── */

function ExportTab({
  deviceId,
  fields,
  renames,
  groupContext,
  allGroups,
}: {
  deviceId: string;
  fields: string[];
  renames: FieldRename[];
  groupContext: {
    groups: Map<string, { description: string; sortOrder: number; fields: string[] }>;
    subGroups: Map<string, { description: string; sortOrder: number }>;
  };
  allGroups: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'csv' | 'json' | null>(null);

  const ungroupedFields = useMemo(
    () =>
      fields.filter(
        (f) => !renames.some((r) => r.raw_field === f && !!r.chart_group?.trim())
      ),
    [fields, renames]
  );

  const toggleField = (f: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(f)) {
        next.delete(f);
      } else {
        next.add(f);
      }
      return next;
    });
  };

  const toggleGroup = (g: string) => {
    const groupFields = groupContext.groups.get(g)?.fields || [];
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = groupFields.every((f) => next.has(f));
      for (const f of groupFields) {
        if (allSelected) {
          next.delete(f);
        } else {
          next.add(f);
        }
      }
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(fields));
  const clearAll = () => setSelected(new Set());

  const rangeValid = useMemo(() => {
    if (!from || !to) return false;
    return new Date(from).getTime() < new Date(to).getTime();
  }, [from, to]);

  const canDownload = selected.size > 0 && rangeValid && !downloading;

  const handleDownload = async (format: 'csv' | 'json') => {
    setError(null);
    setDownloading(format);
    try {
      const blob = await exportDeviceData(
        deviceId,
        Array.from(selected),
        new Date(from).toISOString(),
        new Date(to).toISOString(),
        format
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deviceId.replace(/[^A-Za-z0-9._-]+/g, '_')}_${new Date(from)
        .toISOString()
        .replace(/[:.]/g, '-')}_${new Date(to).toISOString().replace(/[:.]/g, '-')}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium text-foreground whitespace-nowrap">
          Export Data
        </h3>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={selectAll} disabled={fields.length === 0}>
            Select all
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll} disabled={selected.size === 0}>
            Clear
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Select sensors, pick a time range, then download the readings as CSV or JSON.
      </p>

      {/* Selection tree */}
      <div className="space-y-3 rounded-lg border border-border p-4 bg-card/50">
        {allGroups.length === 0 && ungroupedFields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            No sensors available for this device.
          </p>
        ) : (
          <>
            {allGroups.map((groupName) => {
              const groupFields = groupContext.groups.get(groupName)?.fields || [];
              const groupSelected = groupFields.every((f) => selected.has(f));
              return (
                <div key={groupName} className="space-y-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={groupSelected && groupFields.length > 0}
                      onChange={() => toggleGroup(groupName)}
                    />
                    <span className="text-sm font-medium text-foreground">{groupName}</span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {groupFields.length} sensor{groupFields.length !== 1 ? 's' : ''}
                    </span>
                  </label>
                  <div className="pl-6 space-y-1">
                    {groupFields.map((f) => (
                      <label
                        key={f}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={selected.has(f)}
                          onChange={() => toggleField(f)}
                        />
                        <span className="font-mono text-xs text-muted-foreground">{f}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {ungroupedFields.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-border/50">
                <span className="text-xs font-medium text-muted-foreground">Ungrouped</span>
                {ungroupedFields.map((f) => (
                  <label key={f} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={selected.has(f)}
                      onChange={() => toggleField(f)}
                    />
                    <span className="font-mono text-xs text-muted-foreground">{f}</span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Time range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="datetime-local"
            className={inputClasses}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1 min-w-0">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="datetime-local"
            className={inputClasses}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      {from && to && !rangeValid && (
        <p className="text-xs text-destructive">"To" must be after "From".</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          onClick={() => handleDownload('csv')}
          disabled={!canDownload}
        >
          {downloading === 'csv' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download CSV
        </Button>
        <Button
          variant="outline"
          onClick={() => handleDownload('json')}
          disabled={!canDownload}
        >
          {downloading === 'json' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download JSON
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Add the Download icon import**

In the `lucide-react` import (lines 15-25), add `Download`:

```tsx
import {
  Settings,
  Loader2,
  Trash2,
  Save,
  AlertTriangle,
  Search,
  ChevronUp,
  ChevronDown,
  Plus,
  Download,
} from 'lucide-react';
```

- [ ] **Step 5: Verify type check and lint**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: exit 0, no errors (lint may warn on pre-existing issues — only fix issues in the changed files)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/device-settings-modal.tsx frontend/src/lib/api.ts
git commit -m "feat(frontend): add admin export data tab to device settings"
```

---

### Task 6: End-to-end verification

**Files:** none (manual verification)

**Interfaces:** consumes the finished feature from Tasks 1-5

- [ ] **Step 1: Start the stack**

Run: `docker compose up -d db mosquitto api frontend`
Expected: all containers healthy (`docker compose ps` shows healthy)

- [ ] **Step 2: Verify backend test suite still green on the full build**

Run: `cd backend && make test`
Expected: all PASS

- [ ] **Step 3: Login and export CSV via curl**

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@telemetryhub.local","password":"'"$ADMIN_PASSWORD"'"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s -D - -o /tmp/export.csv \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/v1/devices/<SOME_DEVICE_ID>/export?fields=<SOME_FIELD>&from=2026-07-01T00:00:00Z&to=2026-07-31T00:00:00Z&format=csv"
```

Expected: HTTP 200, `Content-Type: text/csv`, `Content-Disposition: attachment; filename="..."`, `/tmp/export.csv` starts with the header row `timestamp,field_name,display_name,unit,value`. (Replace `<SOME_DEVICE_ID>`/`<SOME_FIELD>` with values from `GET /api/v1/devices` and `GET /api/v1/devices/<id>/fields`.)

- [ ] **Step 4: Verify JSON export**

Same request with `&format=json`. Expected: valid JSON array of objects with keys `timestamp, field_name, display_name, unit, value`.

- [ ] **Step 5: Verify non-admin is rejected**

Login as a non-admin user (or register one), request export with that token. Expected: HTTP 403 (or 401) — admin-only.

- [ ] **Step 6: Verify UI flow in browser**

1. Log in as admin → open a device → click the settings gear
2. "Export Data" tab is visible → open it
3. Select a group (nested sensors toggle), pick from/to, click **Download CSV**
4. File downloads; open it — header + rows match the curl output
5. Select a huge range (> 1 year) → error message "Export range cannot exceed 1 year" shows in the tab
6. Log in as non-admin → settings gear → "Export Data" tab is NOT rendered
7. Click "Clear" → buttons disabled

- [ ] **Step 7: Commit any fixes surfaced by verification**

If verification found bugs, fix them in the relevant task file(s), rerun the relevant tests, then:

```bash
git add -A backend frontend
git commit -m "fix: address issues found in export e2e verification"
```

If no fixes were needed, this step is skipped.

---

## Self-Review Notes

- **Spec §3.1** (endpoint, params, validation) → Task 1 + Task 3. All rules covered: fields required, from/to required, `from >= to` rejected, 1-year cap, format validation.
- **Spec §3.2** (row cap) → Task 1 (`maxExportRows` + `CountReadings` + rejection test).
- **Spec §3.3** (store layer) → Task 2. Note: added to `StoreAdapter` (server package), NOT `store.Store` — the adapter is the handler-facing query layer in this codebase; `store.Store` serves the MQTT worker. Spec open decision resolved.
- **Spec §3.4** (handler) → Task 1, new `ExportHandler` file. Spec open decision resolved.
- **Spec §4.1** (tab, selection, range, actions) → Task 5.
- **Spec §4.2** (api client) → Task 4.
- **Spec §5** (edge cases) → covered: empty result (Task 1 tests), cap (Task 1), invalid range (Task 1), sanitized filename (Task 1 test), admin gate (Task 3 route + Task 5 UI), non-admin server rejection (Task 6 step 5).
- **Spec §6** (testing) → Task 1 unit tests; Task 6 manual E2E. Frontend test infra does not exist in this repo (no vitest/jest in package.json) — adding it is out of scope; verified via `tsc`, `next lint`, and manual browser verification. Spec open decision resolved.
- **Spec §7** (out of scope) — nothing in plan violates it.
- Type consistency: `ExportStore` interface defined in Task 1, implemented in Task 2, consumed in Task 3. `exportDeviceData(deviceId, fields[], from, to, format)` defined in Task 4, called in Task 5 with identical signature. `ReadingResult` reused from existing code — no new types invented.
