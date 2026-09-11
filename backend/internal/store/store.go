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

// InsertMessage inserts a device, raw payload, and all readings inside a
// single transaction. Returns the raw payload ID. readings' RawPayloadID
// fields are stamped with the new ID before batch insert.
func (s *Store) InsertMessage(ctx context.Context, deviceID, brokerName string, payload []byte, readings []ReadingRow) (int64, error) {
	if brokerName == "" {
		brokerName = "default"
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit

	if _, err := tx.Exec(ctx, `
		INSERT INTO devices (id, broker_name, first_seen, last_seen)
		VALUES ($1, $2, NOW(), NOW())
		ON CONFLICT (id) DO UPDATE SET last_seen = NOW()
	`, deviceID, brokerName); err != nil {
		return 0, fmt.Errorf("ensure device: %w", err)
	}

	var rawID int64
	if err := tx.QueryRow(ctx, `
		INSERT INTO raw_payloads (device_id, payload, received_at)
		VALUES ($1, $2, NOW())
		RETURNING id
	`, deviceID, payload).Scan(&rawID); err != nil {
		return 0, fmt.Errorf("insert raw payload: %w", err)
	}

	if len(readings) > 0 {
		for i := range readings {
			readings[i].RawPayloadID = rawID
		}
		if _, err := tx.CopyFrom(ctx,
			pgx.Identifier{"readings"},
			[]string{"ts", "device_id", "field_name", "value", "raw_payload_id"},
			pgx.CopyFromSlice(len(readings), func(i int) ([]any, error) {
				r := readings[i]
				return []any{r.Ts, r.DeviceID, r.FieldName, r.Value, r.RawPayloadID}, nil
			}),
		); err != nil {
			return 0, fmt.Errorf("copy readings: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit tx: %w", err)
	}
	return rawID, nil
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
		ORDER BY r.ts, r.field_name
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

// ReadingResult represents a sensor reading with metadata.
type ReadingResult struct {
	Bucket      time.Time `json:"bucket"`
	FieldName   string    `json:"field_name"`
	DisplayName string    `json:"display_name"`
	Unit        string    `json:"unit"`
	Value       float64   `json:"value"`
	MinValue    float64   `json:"min_value"`
	MaxValue    float64   `json:"max_value"`
}
