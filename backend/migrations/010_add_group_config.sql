-- +goose Up
ALTER TABLE field_renames ADD COLUMN IF NOT EXISTS group_description TEXT;
ALTER TABLE field_renames ADD COLUMN IF NOT EXISTS sub_group_description TEXT;
ALTER TABLE field_renames ADD COLUMN IF NOT EXISTS group_sort_order INTEGER;
ALTER TABLE field_renames ADD COLUMN IF NOT EXISTS sub_group_sort_order INTEGER;

-- +goose Down
ALTER TABLE field_renames DROP COLUMN IF EXISTS group_description;
ALTER TABLE field_renames DROP COLUMN IF EXISTS sub_group_description;
ALTER TABLE field_renames DROP COLUMN IF EXISTS group_sort_order;
ALTER TABLE field_renames DROP COLUMN IF EXISTS sub_group_sort_order;
