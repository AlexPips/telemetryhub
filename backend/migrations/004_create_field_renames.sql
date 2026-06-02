-- +goose Up
CREATE TABLE field_renames (
    device_id    TEXT NOT NULL,
    raw_field    TEXT NOT NULL,
    display_name TEXT,
    unit         TEXT,
    chart_group  TEXT,
    PRIMARY KEY (device_id, raw_field)
);

-- +goose Down
DROP TABLE IF EXISTS field_renames CASCADE;
