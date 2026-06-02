-- +goose Up
ALTER TABLE devices ADD COLUMN broker_name TEXT NOT NULL DEFAULT 'default';
CREATE INDEX idx_devices_broker_name ON devices(broker_name);

-- +goose Down
DROP INDEX IF EXISTS idx_devices_broker_name;
ALTER TABLE devices DROP COLUMN IF EXISTS broker_name;
