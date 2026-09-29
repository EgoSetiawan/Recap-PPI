package repository

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"PPI/internal/model"
)

const inspectionSelect = `
SELECT i.id, i.room_id, i.inspector_id, i.inspection_month, i.notes, i.status, i.created_at, i.updated_at
	FROM inspections i`

type InspectionFilter struct {
	ScopeIDs    []int64
	RoomID      *int64
	Status      string
	Month       *time.Time
	InspectorID *int64
}

func replaceChecklist(tx *sql.Tx, inspectionID int64, items []model.ChecklistAnswer) error {
	if _, err := tx.Exec(
		`DELETE FROM inspection_checklist_items WHERE inspection_id = $1`,
		inspectionID,
	); err != nil {
		return err
	}
	for _, item := range items {
		_, err := tx.Exec(
			`INSERT INTO inspection_checklist_items ( inspection_id, checklist_item_id, answer_date, status, notes)
			VALUES ($1, $2, $3, $4, $5)`,
			inspectionID, item.ChecklistItemID, item.AnswerDate, item.Status, item.Notes)
		if err != nil {
			return fmt.Errorf(
				"checklist item %d on %s: %w",
				item.ChecklistItemID, item.AnswerDate.Format("2006-01-02"), err,
			)
		}
	}
	return nil
}

func (r *Repo) CreateInspectionFull(ins *model.Inspection) error {
	tx, err := r.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if ins.Status == "" {
		ins.Status = "SUBMITTED"
	}

	inspectionMonth := time.Date(
		ins.InspectionMonth.Year(),
		ins.InspectionMonth.Month(),
		1,
		0, 0, 0, 0,
		time.UTC,
	)

	err = tx.QueryRow(
		`INSERT INTO inspections ( room_id, inspector_id, inspection_month, notes, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at`,
		ins.RoomID, ins.InspectorID, inspectionMonth, ins.Notes, ins.Status).Scan(
		&ins.ID, &ins.CreatedAt, &ins.UpdatedAt)

	if err != nil {
		return err
	}

	if err := replaceChecklist(tx, ins.ID, ins.Checklist); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *Repo) ListInspections(f InspectionFilter) ([]model.Inspection, error) {
	conds := []string{}
	args := []interface{}{}
	n := 1

	// Restrict to allowed room IDs.
	if f.ScopeIDs != nil {
		if len(f.ScopeIDs) == 0 {
			return []model.Inspection{}, nil
		}

		ph := make([]string, len(f.ScopeIDs))

		for i, id := range f.ScopeIDs {
			ph[i] = fmt.Sprintf("$%d", n)
			args = append(args, id)
			n++
		}

		conds = append(
			conds,
			"i.room_id IN ("+strings.Join(ph, ",")+")",
		)
	}
	// Specific room.
	if f.RoomID != nil {
		conds = append(
			conds,
			fmt.Sprintf("i.room_id = $%d", n),
		)

		args = append(args, *f.RoomID)
		n++
	}
	// Specific inspector.
	if f.InspectorID != nil {
		conds = append(
			conds,
			fmt.Sprintf("i.inspector_id = $%d", n),
		)

		args = append(args, *f.InspectorID)
		n++
	}
	// Status.
	if f.Status != "" {
		conds = append(
			conds,
			fmt.Sprintf("i.status = $%d", n),
		)

		args = append(args, f.Status)
		n++
	}
	// Specific month.
	if f.Month != nil {
		conds = append(
			conds,
			fmt.Sprintf(
				"i.inspection_month = $%d",
				n,
			),
		)

		month := time.Date(
			f.Month.Year(),
			f.Month.Month(),
			1,
			0, 0, 0, 0,
			time.UTC,
		)

		args = append(args, month)
		n++
	}
	q := inspectionSelect
	if len(conds) > 0 {
		q += " WHERE " + strings.Join(conds, " AND ")
	}
	q += `
		ORDER BY
			i.inspection_month DESC,
			i.id DESC
	`

	rows, err := r.DB.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.Inspection{}

	for rows.Next() {
		ins, err := scanInspection(rows)
		if err != nil {
			return nil, err
		}

		if ins != nil {
			out = append(out, *ins)
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return out, nil
}

func scanInspection(row interface{ Scan(dest ...any) error }) (*model.Inspection, error) {
	var ins model.Inspection

	err := row.Scan(
		&ins.ID,
		&ins.RoomID,
		&ins.InspectorID,
		&ins.InspectionMonth,
		&ins.Notes,
		&ins.Status,
		&ins.CreatedAt,
		&ins.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	ins.Checklist = []model.ChecklistAnswer{}

	return &ins, nil
}

func upsertSignatureTx(tx *sql.Tx, sig *model.Signature) error {
	if sig.Method == "" {
		sig.Method = "draw"
	}
	err := tx.QueryRow(
		`INSERT INTO inspection_signatures (inspection_id, signer_user_id, role, method, signer_name, signer_title, image_data_url, signed_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 ON CONFLICT (inspection_id, role) DO UPDATE SET
		   signer_user_id=EXCLUDED.signer_user_id,
		   method=EXCLUDED.method,
		   signer_name=EXCLUDED.signer_name,
		   signer_title=EXCLUDED.signer_title,
		   image_data_url=EXCLUDED.image_data_url,
		   signed_at=EXCLUDED.signed_at
		 RETURNING id`,
		sig.InspectionID, nullInt64(sig.SignerUserID), sig.Role, sig.Method, sig.SignerName, sig.SignerTitle, sig.ImageDataURL, sig.SignedAt,
	).Scan(&sig.ID)
	return err
}
