package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReadingRow represents a single reading row for batch insert.
type ReadingRow struct {
	Ts           time.Time
	DeviceID     string
	FieldName    string
	Value        float64
	RawPayloadID int64
}

// Store handles database operations for the MQTT worker.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore creates a new store with the given connection pool.
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// EnsureDevice creates a device record if it doesn't exist and updates last_seen.
// brokerName attributes the device to the broker that reported it.
func (s *Store) EnsureDevice(ctx context.Context, deviceID, brokerName string) error {
	if brokerName == "" {
		brokerName = "default"
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO devices (id, broker_name, first_seen, last_seen)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET last_seen = NOW()
	`, deviceID, brokerName)
	return err
}

// InsertRawPayload stores the raw MQTT payload and returns its ID.
func (s *Store) InsertRawPayload(ctx context.Context, deviceID string, payload []byte) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO raw_payloads (device_id, payload, received_at)
		VALUES ($1, $2, NOW())
		RETURNING id
	`, deviceID, payload).Scan(&id)
	return id, err
}

// InsertReadings batch-inserts readings using CopyFrom.
func (s *Store) InsertReadings(ctx context.Context, readings []ReadingRow) error {
	if len(readings) == 0 {
		return nil
	}

	_, err := s.pool.CopyFrom(ctx,
		pgx.Identifier{"readings"},
		[]string{"ts", "device_id", "field_name", "value", "raw_payload_id"},
		pgx.CopyFromSlice(len(readings), func(i int) ([]any, error) {
			r := readings[i]
			return []any{r.Ts, r.DeviceID, r.FieldName, r.Value, r.RawPayloadID}, nil
		}),
	)
	if err != nil {
		return fmt.Errorf("copy readings: %w", err)
	}

	return nil
}

// GetDevices returns all known devices.
func (s *Store) GetDevices(ctx context.Context) ([]DeviceRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT d.id, d.name, d.device_type, d.broker_name, d.first_seen, d.last_seen,
		       COUNT(DISTINCT r.field_name) as field_count
		FROM devices d
		LEFT JOIN readings r ON r.device_id = d.id
		GROUP BY d.id, d.name, d.device_type, d.broker_name, d.first_seen, d.last_seen
		ORDER BY d.last_seen DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []DeviceRow
	for rows.Next() {
		var d DeviceRow
		if err := rows.Scan(&d.ID, &d.Name, &d.DeviceType, &d.BrokerName, &d.FirstSeen, &d.LastSeen, &d.FieldCount); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

// GetDeviceFields returns all distinct field names for a device.
func (s *Store) GetDeviceFields(ctx context.Context, deviceID string) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT field_name FROM readings
		WHERE device_id = $1
		ORDER BY field_name
	`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var fields []string
	for rows.Next() {
		var f string
		if err := rows.Scan(&f); err != nil {
			return nil, err
		}
		fields = append(fields, f)
	}
	return fields, rows.Err()
}

// GetReadings returns raw readings for a device and fields.
func (s *Store) GetReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) ([]ReadingResult, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.ts as bucket, r.field_name,
		       r.value as value,
		       COALESCE(fr.display_name, r.field_name) as display_name,
		       COALESCE(fr.unit, '') as unit
		FROM readings r
		LEFT JOIN field_renames fr ON fr.device_id = r.device_id AND fr.raw_field = r.field_name
		WHERE r.device_id = $1 AND r.field_name = ANY($2)
		  AND r.ts > $3 AND r.ts < $4
		ORDER BY r.ts
	`, deviceID, fields, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []ReadingResult
	for rows.Next() {
		var r ReadingResult
		if err := rows.Scan(&r.Bucket, &r.FieldName, &r.Value, &r.DisplayName, &r.Unit); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

// DeviceRow represents a device with its field count.
type DeviceRow struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	DeviceType string    `json:"device_type"`
	BrokerName string    `json:"broker_name"`
	FirstSeen  time.Time `json:"first_seen"`
	LastSeen   time.Time `json:"last_seen"`
	FieldCount int       `json:"field_count"`
}

// ReadingResult represents a sensor reading with metadata.
type ReadingResult struct {
	Bucket      time.Time `json:"bucket"`
	FieldName   string    `json:"field_name"`
	DisplayName string    `json:"display_name"`
	Unit        string    `json:"unit"`
	Value       float64   `json:"value"`
}
