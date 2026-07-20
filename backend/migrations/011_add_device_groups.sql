-- 011_add_device_groups.sql
-- +goose Up

CREATE TABLE device_groups (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE devices ADD COLUMN group_id INTEGER REFERENCES device_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_devices_group_id ON devices(group_id);
CREATE INDEX idx_device_groups_sort_order ON device_groups(sort_order);

-- +goose Down

ALTER TABLE devices DROP COLUMN IF EXISTS group_id;
DROP TABLE IF EXISTS device_groups;
