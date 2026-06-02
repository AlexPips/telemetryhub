package mqtt

import (
	"testing"
	"time"
)

func TestDeduplicator_NewEntry(t *testing.T) {
	d := NewDeduplicator(10, 5*time.Minute)

	// First message should not be a duplicate
	if d.IsDuplicate("TEST1", []byte(`{"ID":"TEST1","tmp":25.0}`)) {
		t.Error("First message should not be a duplicate")
	}
}

func TestDeduplicator_Duplicate(t *testing.T) {
	d := NewDeduplicator(10, 5*time.Minute)
	payload := []byte(`{"ID":"TEST1","tmp":25.0}`)

	// First should not be duplicate
	if d.IsDuplicate("TEST1", payload) {
		t.Error("First message should not be a duplicate")
	}

	// Same message should be duplicate
	if !d.IsDuplicate("TEST1", payload) {
		t.Error("Same message should be a duplicate")
	}
}

func TestDeduplicator_DifferentDevice(t *testing.T) {
	d := NewDeduplicator(10, 5*time.Minute)
	payload := []byte(`{"tmp":25.0}`)

	// Same payload, different device — should NOT be duplicate
	if d.IsDuplicate("DEV1", payload) {
		t.Error("First should not be duplicate")
	}
	if d.IsDuplicate("DEV2", payload) {
		t.Error("Same payload for different device should not be duplicate")
	}
}

func TestDeduplicator_DifferentPayload(t *testing.T) {
	d := NewDeduplicator(10, 5*time.Minute)

	if d.IsDuplicate("TEST1", []byte(`{"tmp":25.0}`)) {
		t.Error("First should not be duplicate")
	}
	if d.IsDuplicate("TEST1", []byte(`{"tmp":26.0}`)) {
		t.Error("Different payload should not be duplicate")
	}
}

func TestDeduplicator_Reset(t *testing.T) {
	d := NewDeduplicator(10, 5*time.Minute)
	payload := []byte(`{"ID":"TEST1","tmp":25.0}`)

	d.IsDuplicate("TEST1", payload)
	d.Reset()

	// After reset, should not be duplicate
	if d.IsDuplicate("TEST1", payload) {
		t.Error("After reset, message should not be duplicate")
	}
}

func TestDeduplicator_RingOverflow(t *testing.T) {
	d := NewDeduplicator(3, 5*time.Minute)

	// Fill the ring
	d.IsDuplicate("A", []byte("msg-a"))
	d.IsDuplicate("B", []byte("msg-b"))
	d.IsDuplicate("C", []byte("msg-c"))

	// Add one more — should evict the oldest
	d.IsDuplicate("D", []byte("msg-d"))

	// msg-a should have been evicted, so this should NOT be duplicate
	if d.IsDuplicate("A", []byte("msg-a")) {
		t.Error("Evicted entry should not be a duplicate")
	}
}

func TestIsMetadataOnly(t *testing.T) {
	tests := []struct {
		name     string
		payload  map[string]interface{}
		expected bool
	}{
		{"empty", map[string]interface{}{}, true},
		{"ID only", map[string]interface{}{"ID": "TEST"}, true},
		{"time only", map[string]interface{}{"time": 123}, true},
		{"ID + time", map[string]interface{}{"ID": "TEST", "time": 123}, true},
		{"ID + sensor", map[string]interface{}{"ID": "TEST", "tmp": 25.0}, false},
		{"sensor only", map[string]interface{}{"tmp": 25.0}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isMetadataOnly(tt.payload)
			if result != tt.expected {
				t.Errorf("isMetadataOnly(%v) = %v, want %v", tt.payload, result, tt.expected)
			}
		})
	}
}

func TestExtractDeviceID(t *testing.T) {
	tests := []struct {
		name     string
		payload  []byte
		topic    string
		expected string
	}{
		{"valid payload ID", []byte(`{"ID":"7D707D","tmp":25.0}`), "x/y/z", "7D707D"},
		{"no ID in payload, none in topic", []byte(`{"tmp":25.0}`), "sensors/+/temp", ""},
		{"empty ID, none in topic", []byte(`{"ID":"","tmp":25.0}`), "sensors/+/temp", ""},
		{"invalid JSON, none in topic", []byte(`not json`), "sensors/+/temp", ""},
		{"ID not string, none in topic", []byte(`{"ID":123,"tmp":25.0}`), "sensors/+/temp", ""},
		{"topic: CARDIMED path", []byte(`{"tmp":25.0}`), "CARDIMED/EBOS/DEMO_9/7D707D/online", "7D707D"},
		{"topic: events path", []byte(`{"src":"shelly"}`), "CARDIMED/EBOS/DEMO_9/467053/events/rpc", "467053"},
		{"topic: payload ID wins", []byte(`{"ID":"ABC","tmp":1.0}`), "CARDIMED/EBOS/DEMO_9/7D707D/online", "ABC"},
		{"topic: lowercase hex", []byte(`{}`), "factory/zone/abc123/data", "abc123"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractDeviceID(tt.payload, tt.topic)
			if result != tt.expected {
				t.Errorf("extractDeviceID(payload=%s, topic=%s) = %q, want %q",
					string(tt.payload), tt.topic, result, tt.expected)
			}
		})
	}
}
