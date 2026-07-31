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
