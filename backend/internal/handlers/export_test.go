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
