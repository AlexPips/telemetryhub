-- +goose Up
CREATE TABLE readings (
    ts              TIMESTAMPTZ NOT NULL,
    device_id       TEXT NOT NULL,
    field_name      TEXT NOT NULL,
    value           DOUBLE PRECISION,
    raw_payload_id  BIGINT NOT NULL
);
SELECT create_hypertable('readings', 'ts', chunk_time_interval => INTERVAL '7 days');
CREATE INDEX idx_readings_device_field_ts ON readings(device_id, field_name, ts DESC);
CREATE INDEX idx_readings_payload_id ON readings(raw_payload_id);
ALTER TABLE readings SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id, field_name'
);
SELECT add_compression_policy('readings', INTERVAL '7 days');
SELECT add_retention_policy('readings', INTERVAL '2 years');

-- +goose Down
DROP TABLE IF EXISTS readings CASCADE;
