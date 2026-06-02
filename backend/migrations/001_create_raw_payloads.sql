-- +goose Up
CREATE TABLE raw_payloads (
    id          BIGSERIAL,
    device_id   TEXT NOT NULL,
    payload     JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, received_at)
);
SELECT create_hypertable('raw_payloads', 'received_at');
CREATE INDEX idx_raw_payloads_device_id ON raw_payloads(device_id, received_at DESC);
ALTER TABLE raw_payloads SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id'
);
SELECT add_compression_policy('raw_payloads', INTERVAL '7 days');
SELECT add_retention_policy('raw_payloads', INTERVAL '90 days');

-- +goose Down
DROP TABLE IF EXISTS raw_payloads CASCADE;
