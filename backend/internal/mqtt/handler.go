package mqtt

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	storepkg "telemetryhub/internal/store"
)

var handlerSkipPrefixes = map[string]bool{
	"src":    true,
	"dst":    true,
	"method": true,
	"id":     true,
	"ts":     true,
	"time":   true,
}

type Handler struct {
	brokerName string
	store      *storepkg.Store
	dedup      *Deduplicator
}

func NewHandler(brokerName string, s *storepkg.Store, d *Deduplicator) *Handler {
	return &Handler{brokerName: brokerName, store: s, dedup: d}
}

func (h *Handler) HandleMessage(deviceID string, rawPayload []byte) error {
	var payload map[string]interface{}
	if err := json.Unmarshal(rawPayload, &payload); err != nil {
		return nil
	}
	if isMetadataOnly(payload) {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := h.store.EnsureDevice(ctx, deviceID, h.brokerName); err != nil {
		return fmt.Errorf("ensure device: %w", err)
	}
	rawID, err := h.store.InsertRawPayload(ctx, deviceID, rawPayload)
	if err != nil {
		return fmt.Errorf("insert raw payload: %w", err)
	}

	readings := extractReadings(deviceID, payload, rawID)
	if len(readings) > 0 {
		if err := h.store.InsertReadings(ctx, readings); err != nil {
			return fmt.Errorf("insert readings: %w", err)
		}
	}

	return nil
}

func isMetadataOnly(payload map[string]interface{}) bool {
	if len(payload) == 0 {
		return true
	}
	for key := range payload {
		if key != "ID" && key != "time" {
			return false
		}
	}
	return true
}

func extractReadings(deviceID string, payload map[string]interface{}, rawPayloadID int64) []storepkg.ReadingRow {
	now := time.Now().UTC()
	flat := make(map[string]float64)
	flattenJSON("", payload, flat)

	var readings []storepkg.ReadingRow
	for field, value := range flat {
		readings = append(readings, storepkg.ReadingRow{
			Ts:           now,
			DeviceID:     deviceID,
			FieldName:    field,
			Value:        value,
			RawPayloadID: rawPayloadID,
		})
	}
	return readings
}

func flattenJSON(prefix string, v interface{}, out map[string]float64) {
	flattenJSONWithParent(prefix, "", v, out)
}

func flattenJSONWithParent(prefix, parentKey string, v interface{}, out map[string]float64) {
	switch val := v.(type) {
	case map[string]interface{}:
		for k, child := range val {
			newPrefix := k
			if prefix != "" {
				newPrefix = prefix + "." + k
			}
			flattenJSONWithParent(newPrefix, k, child, out)
		}
	case float64:
		if !handlerSkipPrefixes[parentKey] {
			out[prefix] = val
		}
	case bool:
		if !handlerSkipPrefixes[parentKey] {
			if val {
				out[prefix] = 1.0
			} else {
				out[prefix] = 0.0
			}
		}
	}
}
