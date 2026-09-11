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

	readings := extractReadings(deviceID, payload)
	if _, err := h.store.InsertMessage(ctx, deviceID, h.brokerName, rawPayload, readings); err != nil {
		return fmt.Errorf("insert message: %w", err)
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

func extractReadings(deviceID string, payload map[string]interface{}) []storepkg.ReadingRow {
	now := time.Now().UTC()
	flat := make(map[string]float64)
	flattenJSON("", payload, flat)

	var readings []storepkg.ReadingRow
	for field, value := range flat {
		readings = append(readings, storepkg.ReadingRow{
			Ts:        now,
			DeviceID:  deviceID,
			FieldName: field,
			Value:     value,
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
