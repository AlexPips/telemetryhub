-- +goose Up
-- Admin user is created via env vars on first startup.
-- This migration is a placeholder; seed happens in app startup code
-- when ADMIN_EMAIL and ADMIN_PASSWORD are set, using
-- INSERT ... ON CONFLICT DO NOTHING to prevent race conditions.

-- +goose Down
-- No-op
