package mqtt

import (
	"sort"
	"testing"
	"time"
)

func TestFlattenJSON(t *testing.T) {
	tests := []struct {
		name     string
		input    map[string]interface{}
		expected map[string]float64
	}{
		{
			name: "flat numeric",
			input: map[string]interface{}{
				"tmp": 25.0,
				"hum": 60.0,
			},
			expected: map[string]float64{
				"tmp": 25.0,
				"hum": 60.0,
			},
		},
		{
			name: "skip src/dst/method/id/ts at top level",
			input: map[string]interface{}{
				"src":   "shellypro3em63-a4f00fc30488",
				"dst":   "CARDIMED/EBOS/DEMO_9/7D707D/events",
				"method": "NotifyStatus",
				"id":    0,
				"ts":    1780393918.51,
				"tmp":   25.0,
			},
			expected: map[string]float64{
				"tmp": 25.0,
			},
		},
		{
			name: "nested em:0 reads",
			input: map[string]interface{}{
				"src":    "device",
				"method": "NotifyStatus",
				"params": map[string]interface{}{
					"em:0": map[string]interface{}{
						"id":           0,
						"a_act_power":  397.9,
						"a_aprt_power": 556.7,
						"a_current":    2.317,
						"a_voltage":    240.4,
					},
				},
			},
			expected: map[string]float64{
				"params.em:0.a_act_power":  397.9,
				"params.em:0.a_aprt_power": 556.7,
				"params.em:0.a_current":    2.317,
				"params.em:0.a_voltage":    240.4,
			},
		},
		{
			name: "bool to float",
			input: map[string]interface{}{
				"relay_on": true,
				"is_fault": false,
			},
			expected: map[string]float64{
				"relay_on": 1.0,
				"is_fault": 0.0,
			},
		},
		{
			name: "deeply nested",
			input: map[string]interface{}{
				"a": map[string]interface{}{
					"b": map[string]interface{}{
						"c": 42.0,
					},
				},
			},
			expected: map[string]float64{
				"a.b.c": 42.0,
			},
		},
		{
			name: "string values ignored",
			input: map[string]interface{}{
				"label": "device-A",
				"tmp":   25.0,
			},
			expected: map[string]float64{
				"tmp": 25.0,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := make(map[string]float64)
			flattenJSON("", tt.input, got)
			if len(got) != len(tt.expected) {
				t.Errorf("flattenJSON got %d keys, want %d: got=%v want=%v", len(got), len(tt.expected), got, tt.expected)
			}
			for k, v := range tt.expected {
				if got[k] != v {
					t.Errorf("flattenJSON[%q] = %v, want %v", k, got[k], v)
				}
			}
		})
	}
}

func TestExtractReadingsShelly(t *testing.T) {
	payload := map[string]interface{}{
		"src":    "shellypro3em63-a4f00fc30488",
		"dst":    "CARDIMED/EBOS/DEMO_9/7D707D/events",
		"method": "NotifyStatus",
		"params": map[string]interface{}{
			"ts": 1780393918.51,
			"em:0": map[string]interface{}{
				"id":           0,
				"a_act_power":  397.9,
				"a_aprt_power": 556.7,
				"a_current":    2.317,
				"a_voltage":    240.4,
			},
		},
	}

	readings := extractReadings("7D707D", payload, 42)
	if len(readings) == 0 {
		t.Fatal("expected readings, got 0")
	}

	if readings[0].DeviceID != "7D707D" {
		t.Errorf("DeviceID = %q, want 7D707D", readings[0].DeviceID)
	}
	if readings[0].RawPayloadID != 42 {
		t.Errorf("RawPayloadID = %d, want 42", readings[0].RawPayloadID)
	}
	if readings[0].Ts.IsZero() {
		t.Error("Ts must be set")
	}
	if time.Since(readings[0].Ts) > 5*time.Second {
		t.Errorf("Ts not recent: %v", readings[0].Ts)
	}

	fields := make([]string, 0, len(readings))
	for _, r := range readings {
		fields = append(fields, r.FieldName)
	}
	sort.Strings(fields)

	want := []string{
		"params.em:0.a_act_power",
		"params.em:0.a_aprt_power",
		"params.em:0.a_current",
		"params.em:0.a_voltage",
	}
	if len(fields) != len(want) {
		t.Errorf("fields = %v, want %v", fields, want)
	}
	for i, f := range want {
		if i >= len(fields) || fields[i] != f {
			t.Errorf("field[%d] = %q, want %q", i, fields[i], f)
		}
	}

	for _, r := range readings {
		if r.FieldName == "src" || r.FieldName == "dst" || r.FieldName == "method" {
			t.Errorf("metadata field %q should be skipped", r.FieldName)
		}
		if r.FieldName == "params.em:0.id" || r.FieldName == "params.ts" {
			t.Errorf("non-sensor field %q should be skipped", r.FieldName)
		}
	}
}

func TestExtractReadingsFlatCARDIMED(t *testing.T) {
	payload := map[string]interface{}{
		"tmp": 25.3,
		"hum": 60.0,
		"co2": 415.0,
	}
	readings := extractReadings("467066", payload, 7)
	if len(readings) != 3 {
		t.Errorf("got %d readings, want 3", len(readings))
	}
}

func TestExtractReadingsEmpty(t *testing.T) {
	payload := map[string]interface{}{
		"src":    "device",
		"method": "NotifyStatus",
	}
	readings := extractReadings("7D707D", payload, 1)
	if len(readings) != 0 {
		t.Errorf("metadata-only payload should yield 0 readings, got %d", len(readings))
	}
}
