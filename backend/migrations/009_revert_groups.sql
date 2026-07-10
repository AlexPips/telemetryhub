-- +goose Up
ALTER TABLE field_renames ADD COLUMN IF NOT EXISTS sub_group TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE field_renames DROP COLUMN IF EXISTS sub_group;