package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
)

// blockingDeviceStore embeds DeviceStore (satisfies interface) and only
// overrides GetReadings, which blocks until ctx is done — mimicking a hung DB query.
type blockingDeviceStore struct {
	DeviceStore
}

func (b *blockingDeviceStore) GetReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) ([]ReadingResult, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestGetReadings_QueryTimeout(t *testing.T) {
	e := echo.New()
	h := NewReadingHandler(&blockingDeviceStore{}, 100*time.Millisecond)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/devices/dev1/readings?fields=temperature", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("id")
	c.SetParamValues("dev1")

	start := time.Now()
	err := h.GetReadings(c)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("GetReadings returned error: %v", err)
	}
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusInternalServerError)
	}
	if elapsed > 2*time.Second {
		t.Fatalf("handler took %v, expected timeout to fire quickly", elapsed)
	}
}

func TestGetReadings_TimeoutDefaulted(t *testing.T) {
	// queryTimeout <= 0 must be defaulted, not treated as instant deadline
	h := NewReadingHandler(&blockingDeviceStore{}, 0)
	if h.queryTimeout <= 0 {
		t.Fatalf("queryTimeout = %v, want default > 0", h.queryTimeout)
	}
}