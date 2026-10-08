package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"PPI/internal/model"
)

type Repo struct {
	DB *sql.DB
}

func New(db *sql.DB) *Repo {
	return &Repo{DB: db}
}

func nullTime(t *time.Time) interface{} {
	if t == nil {
		return nil
	}
	return *t
}

func nullInt64(v *int64) interface{} {
	if v == nil {
		return nil
	}
	return *v
}

func nullString(v *string) interface{} {
	if v == nil {
		return nil
	}
	return *v
}

func scanJSON(raw []byte, dest *interface{}) {
	if len(raw) == 0 {
		*dest = nil
		return
	}
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		*dest = string(raw)
		return
	}
	*dest = v
}

type InspectionPDFChecklist struct {
	Items   []model.ChecklistItem
	Answers map[int]map[int64]string
	// Answers[day][checklist_item_id] = status
}

// --- Token blacklist ---

func (r *Repo) IsBlacklisted(jti string) (bool, error) {
	var exists bool
	err := r.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM token_blacklist WHERE jti=$1 AND expires_at > NOW())`, jti).Scan(&exists)
	return exists, err
}

func (r *Repo) BlacklistToken(jti string, exp time.Time) error {
	_, err := r.DB.Exec(`INSERT INTO token_blacklist (jti, expires_at) VALUES ($1,$2) ON CONFLICT (jti) DO NOTHING`, jti, exp)
	return err
}

func (r *Repo) GetRole(id int64) (*model.Role, error) {
	var role model.Role
	err := r.DB.QueryRow(`SELECT id, name, description FROM roles WHERE id=$1`, id).Scan(&role.ID, &role.Name, &role.Description)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &role, nil
}

func (r *Repo) loadAssignedRooms(userID int64) ([]int64, error) {
	rows, err := r.DB.Query(`SELECT room_id FROM user_assigned_rooms WHERE user_id=$1 ORDER BY room_id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *Repo) setAssignedRooms(tx *sql.Tx, userID int64, roomIDs []int64) error {
	if _, err := tx.Exec(`DELETE FROM user_assigned_rooms WHERE user_id=$1`, userID); err != nil {
		return err
	}
	for _, rid := range roomIDs {
		if _, err := tx.Exec(`INSERT INTO user_assigned_rooms (user_id, room_id) VALUES ($1,$2)`, userID, rid); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repo) scanUser(row interface{ Scan(dest ...any) error }) (*model.User, error) {
	var u model.User
	err := row.Scan(&u.ID, &u.Name, &u.Email, &u.Title, &u.PasswordHash, &u.RoleID, &u.Role, &u.Status, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	ids, err := r.loadAssignedRooms(u.ID)
	if err != nil {
		return nil, err
	}
	u.AssignedRoomIDs = ids
	return &u, nil
}

const userSelect = `SELECT u.id, u.name, u.email, COALESCE(u.title,''), u.password_hash, u.role_id, r.name, u.status, u.created_at, u.updated_at
FROM users u JOIN roles r ON r.id = u.role_id`

func (r *Repo) GetByID(id int64) (*model.User, error) {
	return r.scanUser(r.DB.QueryRow(userSelect+` WHERE u.id=$1`, id))
}

func (r *Repo) GetByEmail(email string) (*model.User, error) {
	return r.scanUser(r.DB.QueryRow(userSelect+` WHERE LOWER(u.email)=LOWER($1)`, email))
}

// --- Rooms ---

const roomSelect = `
SELECT
    r.id,
    r.name,
    r.code,
    r.room_type,
    r.description,
    r.created_at,
    r.updated_at
FROM rooms r`

func (r *Repo) scanRoom(rows interface{ Scan(dest ...any) error }) (*model.Room, error) {
	var room model.Room

	err := rows.Scan(
		&room.ID,
		&room.Name,
		&room.Code,
		&room.RoomType,
		&room.Description,
		&room.CreatedAt,
		&room.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	return &room, nil
}

func (r *Repo) ListRooms(status, condition, q string, scopeIDs []int64) ([]model.Room, error) {
	var conds []string
	var args []interface{}
	n := 1
	if status != "" {
		conds = append(conds, fmt.Sprintf("r.status=$%d", n))
		args = append(args, status)
		n++
	}
	if condition != "" {
		conds = append(conds, fmt.Sprintf("r.condition=$%d", n))
		args = append(args, condition)
		n++
	}
	if q != "" {
		conds = append(conds, fmt.Sprintf("(LOWER(r.name) LIKE $%d OR LOWER(r.code) LIKE $%d)", n, n))
		args = append(args, "%"+strings.ToLower(q)+"%")
		n++
	}
	if scopeIDs != nil {
		if len(scopeIDs) == 0 {
			return []model.Room{}, nil
		}
		ph := make([]string, len(scopeIDs))
		for i, id := range scopeIDs {
			ph[i] = fmt.Sprintf("$%d", n)
			args = append(args, id)
			n++
		}
		conds = append(conds, "r.id IN ("+strings.Join(ph, ",")+")")
	}
	query := roomSelect
	if len(conds) > 0 {
		query += " WHERE " + strings.Join(conds, " AND ")
	}
	query += " ORDER BY r.id"
	rows, err := r.DB.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Room{}
	for rows.Next() {
		room, err := r.scanRoom(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *room)
	}
	return out, rows.Err()
}

func (r *Repo) GetRoom(id int64) (*model.Room, error) {
	return r.scanRoom(r.DB.QueryRow(roomSelect+` WHERE r.id=$1`, id))
}

func (r *Repo) GetInspectionPDFChecklist(inspectionID int64, roomType string, year int, month time.Month) (*InspectionPDFChecklist, error) {
	// Get checklist items for this room type.
	itemRows, err := r.DB.Query(`
		SELECT
			id,
			room_type,
			name,
			description,
			is_required,
			order_number,
			created_at,
			updated_at
		FROM checklist_items
		WHERE room_type = 'ALL'
		   OR room_type = $1
		ORDER BY order_number, id
	`, roomType)
	if err != nil {
		return nil, err
	}
	defer itemRows.Close()

	items := make([]model.ChecklistItem, 0)

	for itemRows.Next() {
		var item model.ChecklistItem
		if err := itemRows.Scan(
			&item.ID,
			&item.RoomType,
			&item.Name,
			&item.Description,
			&item.IsRequired,
			&item.OrderNumber,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}

		items = append(items, item)
	}
	if err := itemRows.Err(); err != nil {
		return nil, err
	}
	// Get only actual inspection records.
	rows, err := r.DB.Query(`
		SELECT
			answer_date,
			checklist_item_id,
			status
		FROM inspection_checklist_items
		WHERE inspection_id = $1
		  AND answer_date >= $2
		  AND answer_date < $3
		ORDER BY answer_date, checklist_item_id
	`,
		inspectionID,
		time.Date(year, month, 1, 0, 0, 0, 0, time.UTC),
		time.Date(year, month+1, 1, 0, 0, 0, 0, time.UTC),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	answers := make(map[int]map[int64]string)

	for rows.Next() {
		var (
			answerDate      time.Time
			checklistItemID int64
			status          sql.NullString
		)

		if err := rows.Scan(
			&answerDate,
			&checklistItemID,
			&status,
		); err != nil {
			return nil, err
		}

		day := answerDate.Day()

		if answers[day] == nil {
			answers[day] = make(map[int64]string)
		}

		if status.Valid {
			answers[day][checklistItemID] = strings.ToUpper(
				strings.TrimSpace(status.String),
			)
		}
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &InspectionPDFChecklist{
		Items:   items,
		Answers: answers,
	}, nil
}

// const scanKetua = `SELECT u.id, u.name, r.name AS role
// FROM users u
// JOIN roles r ON r.id = u.role_id
// WHERE r.name = 'KEPALA';`

// func (r *Repo) GetKetuaName() (string, error) {
// 	var name string

// 	err := r.DB.QueryRow(scanKetua).Scan(&name)
// 	if err != nil {
// 		return "", err
// 	}
// 	fmt.Println("Ketua Name from Repo:", name)
// 	return name, nil
// }

func (r *Repo) GetKetuaName() (string, error) {
	var name string

	err := r.DB.QueryRow(`
		SELECT u.name
		FROM users u
		JOIN roles r ON r.id = u.role_id
		WHERE r.name = 'KEPALA'
		LIMIT 1
	`).Scan(&name)

	// fmt.Printf("DEBUG name=%q err=%v\n", name, err)

	return name, err
}
