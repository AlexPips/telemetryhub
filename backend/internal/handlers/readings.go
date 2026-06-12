package handlers

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	_ "telemetryhub/internal/auth"
)

// ReadingsResponse represents the readings response.
type ReadingsResponse struct {
	DeviceID string          `json:"device_id"`
	Fields   []string        `json:"fields"`
	From     string          `json:"from"`
	To       string          `json:"to"`
	Data     []ReadingResult `json:"data"`
}

// ReadingHandler handles readings-related endpoints.
type ReadingHandler struct {
	store DeviceStore
}

// NewReadingHandler creates a new reading handler.
func NewReadingHandler(store DeviceStore) *ReadingHandler {
	return &ReadingHandler{store: store}
}

// GetReadings     Get device readings
// @Summary      Get readings
// @Description  Returns downsampled sensor readings for a device. Uses TimescaleDB time bucketing: 15-minute buckets for <24h range, 1-hour for <7d, 1-day for longer. Field renames are applied automatically.
// @Tags         readings
// @Produce      json
// @Security     BearerAuth
// @Param        id     path   string true  "Device ID"
// @Param        fields query  string true  "Comma-separated field names (e.g. temperature,humidity)"
// @Param        from   query  string false "Start time in RFC3339 format (default: 24h ago)"
// @Param        to     query  string false "End time in RFC3339 format (default: now)"
// @Success      200 {object} handlers.ReadingsResponse
// @Failure      400 {object} auth.ErrorResponse
// @Failure      401 {object} auth.ErrorResponse
// @Failure      500 {object} auth.ErrorResponse
// @Router       /devices/{id}/readings [get]
func (h *ReadingHandler) GetReadings(c echo.Context) error {
	deviceID := c.Param("id")

	// Parse query parameters
	fields := c.QueryParam("fields")
	if fields == "" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "fields parameter required"})
	}

	fromStr := c.QueryParam("from")
	toStr := c.QueryParam("to")

	var from, to time.Time
	var err error

	if fromStr != "" {
		from, err = time.Parse(time.RFC3339, fromStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid 'from' parameter"})
		}
	} else {
		from = time.Now().Add(-24 * time.Hour)
	}

	if toStr != "" {
		to, err = time.Parse(time.RFC3339, toStr)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid 'to' parameter"})
		}
	} else {
		to = time.Now()
	}

	fieldList := splitFields(fields)
	readings, err := h.store.GetReadings(c.Request().Context(), deviceID, fieldList, from, to)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to fetch readings"})
	}
	if readings == nil {
		readings = []ReadingResult{}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"device_id": deviceID,
		"fields":    fieldList,
		"from":      from.Format(time.RFC3339),
		"to":        to.Format(time.RFC3339),
		"data":      readings,
	})
}

func splitFields(s string) []string {
	var fields []string
	for _, f := range splitString(s, ",") {
		if f != "" {
			fields = append(fields, f)
		}
	}
	return fields
}

func splitString(s, sep string) []string {
	var result []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i:i+1] == sep {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}
