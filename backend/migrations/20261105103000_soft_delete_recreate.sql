-- +goose Up
-- Active inspections stay unique per room/month, while soft-deleted records
-- no longer block recreating the same period.
ALTER TABLE inspections
    DROP CONSTRAINT IF EXISTS inspections_room_id_inspection_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS inspections_active_room_month_idx
    ON inspections (room_id, inspection_month)
    WHERE is_deleted = FALSE;

-- +goose Down
DROP INDEX IF EXISTS inspections_active_room_month_idx;

ALTER TABLE inspections
    ADD CONSTRAINT inspections_room_id_inspection_month_key
    UNIQUE (room_id, inspection_month);
