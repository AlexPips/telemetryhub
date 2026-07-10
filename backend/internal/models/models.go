package models

import (
	"encoding/json"
	"time"
)

// RawPayload stores the complete raw MQTT message as JSONB for audit trail.
type RawPayload struct {
	ID         int64           `db:"id" json:"id"`
	DeviceID   string          `db:"device_id" json:"device_id"`
	Payload    json.RawMessage `db:"payload" json:"payload"`
	ReceivedAt time.Time       `db:"received_at" json:"received_at"`
}

// Reading stores a single numeric sensor reading extracted from a raw payload.
type Reading struct {
	Ts           time.Time `db:"ts" json:"ts"`
	DeviceID     string    `db:"device_id" json:"device_id"`
	FieldName    string    `db:"field_name" json:"field_name"`
	Value        float64   `db:"value" json:"value"`
	RawPayloadID int64     `db:"raw_payload_id" json:"raw_payload_id"`
}

// Device represents a discovered MQTT device.
type Device struct {
	ID         string    `db:"id" json:"id"`
	Name       string    `db:"name" json:"name"`
	DeviceType string    `db:"device_type" json:"device_type"`
	FirstSeen  time.Time `db:"first_seen" json:"first_seen"`
	LastSeen   time.Time `db:"last_seen" json:"last_seen"`
}

// FieldRename stores admin-configured display names and units for raw field names.
type FieldRename struct {
	DeviceID    string  `db:"device_id" json:"device_id"`
	RawField    string  `db:"raw_field" json:"raw_field"`
	DisplayName *string `db:"display_name" json:"display_name,omitempty"`
	Unit        *string `db:"unit" json:"unit,omitempty"`
	ChartGroup  *string `db:"chart_group" json:"chart_group,omitempty"`
	SubGroup    *string `db:"sub_group" json:"sub_group,omitempty"`
}

// User represents a platform user with role-based access.
type User struct {
	ID           int64     `db:"id" json:"-"`
	Email        string    `db:"email" json:"email"`
	PasswordHash string    `db:"password_hash" json:"-"`
	Role         string    `db:"role" json:"role"`
	CreatedAt    time.Time `db:"created_at" json:"created_at"`
}

// Session represents an active user session.
type Session struct {
	Token     string    `db:"token" json:"-"`
	UserID    int64     `db:"user_id" json:"-"`
	CreatedAt time.Time `db:"created_at" json:"-"`
	ExpiresAt time.Time `db:"expires_at" json:"-"`
}

// ReadingWithMeta extends Reading with display name and unit from field_renames.
type ReadingWithMeta struct {
	Bucket      time.Time `json:"bucket"`
	FieldName   string    `json:"field_name"`
	DisplayName string    `json:"display_name"`
	Unit        string    `json:"unit"`
	Value       float64   `json:"value"`
	Min         float64   `json:"min"`
	Max         float64   `json:"max"`
}

// DeviceWithFields extends Device with its known field names.
type DeviceWithFields struct {
	Device
	FieldCount int      `json:"field_count"`
	Fields     []string `json:"fields,omitempty"`
}
