-- +goose Up
-- The pre-submission status is called DRAFT instead of OPEN.
ALTER TABLE inspections ALTER COLUMN status SET DEFAULT 'DRAFT';

UPDATE inspections
SET status = 'DRAFT'
WHERE status = 'OPEN';

-- +goose Down
UPDATE inspections
SET status = 'OPEN'
WHERE status = 'DRAFT';

ALTER TABLE inspections ALTER COLUMN status SET DEFAULT 'OPEN';
