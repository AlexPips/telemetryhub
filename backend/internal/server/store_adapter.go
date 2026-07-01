package server

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"telemetryhub/internal/handlers"
)

// StoreAdapter adapts pgxpool.Pool to the store interface expected by handlers.
type StoreAdapter struct {
	pool *pgxpool.Pool
}

// NewStoreAdapter creates a new store adapter.
func NewStoreAdapter(pool *pgxpool.Pool) *StoreAdapter {
	return &StoreAdapter{pool: pool}
}

func (a *StoreAdapter) GetDevices(ctx context.Context) ([]handlers.DeviceRow, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT d.id, d.name, d.device_type, d.first_seen, d.last_seen,
		       COUNT(DISTINCT r.field_name) as field_count,
		       COALESCE(d.broker_name, '')
		FROM devices d
		LEFT JOIN readings r ON r.device_id = d.id
		GROUP BY d.id, d.name, d.device_type, d.first_seen, d.last_seen, d.broker_name
		ORDER BY d.last_seen DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []handlers.DeviceRow
	for rows.Next() {
		var d handlers.DeviceRow
		if err := rows.Scan(&d.ID, &d.Name, &d.DeviceType, &d.FirstSeen, &d.LastSeen, &d.FieldCount, &d.BrokerName); err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, rows.Err()
}

func (a *StoreAdapter) GetDeviceFields(ctx context.Context, deviceID string) ([]string, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT DISTINCT field_name FROM readings
		WHERE device_id = $1 ORDER BY field_name
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

func (a *StoreAdapter) UpdateDevice(ctx context.Context, deviceID, name, deviceType string) error {
	_, err := a.pool.Exec(ctx, `
		UPDATE devices SET name = $2, device_type = $3 WHERE id = $1
	`, deviceID, name, deviceType)
	return err
}

func (a *StoreAdapter) DeleteDevice(ctx context.Context, deviceID string) error {
	_, err := a.pool.Exec(ctx, `DELETE FROM devices WHERE id = $1`, deviceID)
	return err
}

func (a *StoreAdapter) GetReadings(ctx context.Context, deviceID string, fields []string, from, to time.Time) ([]handlers.ReadingResult, error) {
	rows, err := a.pool.Query(ctx, `
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

	var results []handlers.ReadingResult
	for rows.Next() {
		var r handlers.ReadingResult
		if err := rows.Scan(&r.Bucket, &r.FieldName, &r.Value, &r.DisplayName, &r.Unit); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

func (a *StoreAdapter) ListRenames(ctx context.Context, deviceID string) ([]handlers.FieldRename, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT device_id, raw_field, display_name, unit, chart_group
		FROM field_renames WHERE device_id = $1
	`, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var renames []handlers.FieldRename
	for rows.Next() {
		var r handlers.FieldRename
		if err := rows.Scan(&r.DeviceID, &r.RawField, &r.DisplayName, &r.Unit, &r.ChartGroup); err != nil {
			return nil, err
		}
		renames = append(renames, r)
	}
	return renames, rows.Err()
}

func (a *StoreAdapter) CreateRename(ctx context.Context, deviceID, rawField string, displayName, unit, chartGroup *string) error {
	_, err := a.pool.Exec(ctx, `
		INSERT INTO field_renames (device_id, raw_field, display_name, unit, chart_group)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (device_id, raw_field) DO UPDATE
		SET display_name = EXCLUDED.display_name, unit = EXCLUDED.unit, chart_group = EXCLUDED.chart_group
	`, deviceID, rawField, displayName, unit, chartGroup)
	return err
}

func (a *StoreAdapter) UpdateRename(ctx context.Context, deviceID, rawField string, displayName, unit, chartGroup *string) error {
	_, err := a.pool.Exec(ctx, `
		UPDATE field_renames SET display_name = $3, unit = $4, chart_group = $5
		WHERE device_id = $1 AND raw_field = $2
	`, deviceID, rawField, displayName, unit, chartGroup)
	return err
}

func (a *StoreAdapter) DeleteRename(ctx context.Context, deviceID, rawField string) error {
	_, err := a.pool.Exec(ctx, `
		DELETE FROM field_renames WHERE device_id = $1 AND raw_field = $2
	`, deviceID, rawField)
	return err
}
