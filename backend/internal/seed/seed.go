package seed

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"PPI/internal/auth"
)

type SeedRole struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type SeedUser struct {
	ID              int64   `json:"id"`
	Name            string  `json:"name"`
	Email           string  `json:"email"`
	Title           string  `json:"title"`
	Password        string  `json:"password"`
	RoleID          int64   `json:"role_id"`
	Status          string  `json:"status"`
	AssignedRoomIDs []int64 `json:"assigned_room_ids"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
}

type SeedHospital struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Code      string `json:"code"`
	Address   string `json:"address"`
	Phone     string `json:"phone"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type SeedRoom struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Code        string `json:"code"`
	RoomType    string `json:"room_type"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type SeedChecklistItem struct {
	ID          int64  `json:"id"`
	RoomType    string `json:"room_type"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IsRequired  bool   `json:"is_required"`
	OrderNumber int    `json:"order_number"`
}

type SeedInspection struct {
	ID              int64  `json:"id"`
	RoomID          int64  `json:"room_id"`
	InspectorID     int64  `json:"inspector_id"`
	InspectionMonth string `json:"inspection_month"`
	Notes           string `json:"notes"`
	Status          string `json:"status"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

type SeedFile struct {
	Roles          []SeedRole          `json:"roles"`
	Users          []SeedUser          `json:"users"`
	Hospitals      []SeedHospital      `json:"hospitals"`
	Rooms          []SeedRoom          `json:"rooms"`
	Inspections    []SeedInspection    `json:"inspections"`
	ChecklistItems []SeedChecklistItem `json:"checklist_items"`
}

func parseTime(s string) time.Time {
	if s == "" {
		return time.Now().UTC()
	}

	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Now().UTC()
	}

	return t
}

func validateSeed(sf *SeedFile) error {
	roleIDs := map[int64]bool{}
	for _, role := range sf.Roles {
		if role.ID <= 0 || roleIDs[role.ID] {
			return fmt.Errorf("seed role id %d is duplicated or invalid", role.ID)
		}
		roleIDs[role.ID] = true
	}

	userIDs := map[int64]bool{}
	for _, user := range sf.Users {
		if user.ID <= 0 || userIDs[user.ID] {
			return fmt.Errorf("seed user id %d is duplicated or invalid", user.ID)
		}

		if !roleIDs[user.RoleID] {
			return fmt.Errorf(
				"seed user %d references unknown role %d",
				user.ID,
				user.RoleID,
			)
		}

		userIDs[user.ID] = true
	}

	hospitalIDs := map[int64]bool{}
	for _, hospital := range sf.Hospitals {
		if hospital.ID <= 0 || hospitalIDs[hospital.ID] {
			return fmt.Errorf(
				"seed hospital id %d is duplicated or invalid",
				hospital.ID,
			)
		}
		hospitalIDs[hospital.ID] = true
	}

	roomIDs := map[int64]bool{}
	for _, room := range sf.Rooms {
		if room.ID <= 0 || roomIDs[room.ID] {
			return fmt.Errorf(
				"seed room id %d is duplicated or invalid",
				room.ID,
			)
		}

		roomIDs[room.ID] = true
	}

	for _, user := range sf.Users {
		for _, roomID := range user.AssignedRoomIDs {
			if !roomIDs[roomID] {
				return fmt.Errorf(
					"user %d references unknown assigned room %d",
					user.ID,
					roomID,
				)
			}
		}
	}

	inspectionIDs := map[int64]bool{}

	for _, inspection := range sf.Inspections {
		if inspection.ID <= 0 || inspectionIDs[inspection.ID] {
			return fmt.Errorf(
				"seed inspection id %d is duplicated or invalid",
				inspection.ID,
			)
		}

		if !roomIDs[inspection.RoomID] {
			return fmt.Errorf(
				"inspection %d references unknown room %d",
				inspection.ID,
				inspection.RoomID,
			)
		}

		if !userIDs[inspection.InspectorID] {
			return fmt.Errorf(
				"inspection %d references unknown inspector %d",
				inspection.ID,
				inspection.InspectorID,
			)
		}

		inspectionIDs[inspection.ID] = true
	}

	checklistIDs := map[int64]bool{}
	for _, item := range sf.ChecklistItems {
		if item.ID <= 0 || checklistIDs[item.ID] {
			return fmt.Errorf(
				"seed checklist id %d is duplicated or invalid",
				item.ID,
			)
		}
		checklistIDs[item.ID] = true
	}

	return nil
}

func Run(db *sql.DB, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read seed: %w", err)
	}

	var sf SeedFile
	if err := json.Unmarshal(raw, &sf); err != nil {
		return fmt.Errorf("parse seed: %w", err)
	}

	if err := validateSeed(&sf); err != nil {
		return fmt.Errorf("validate seed: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Roles must exist before users because users.role_id references roles.id.
	for _, role := range sf.Roles {
		if _, err := tx.Exec(
			`INSERT INTO roles (id, name, description)
			 VALUES ($1, $2, $3)`,
			role.ID,
			role.Name,
			role.Description,
		); err != nil {
			return fmt.Errorf("role %d: %w", role.ID, err)
		}
	}

	// 2. Users are seeded before the rest of the application data.
	// Their room assignments are inserted later after rooms exist.
	for _, user := range sf.Users {
		hash, err := auth.HashPassword(user.Password)
		if err != nil {
			return fmt.Errorf("hash password for user %d: %w", user.ID, err)
		}

		status := user.Status
		if status == "" {
			status = "ACTIVE"
		}

		if _, err := tx.Exec(
			`INSERT INTO users
				(id, name, email, title, password_hash, role_id, status, created_at, updated_at)
			 VALUES
				($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			user.ID,
			user.Name,
			user.Email,
			user.Title,
			hash,
			user.RoleID,
			status,
			parseTime(user.CreatedAt),
			parseTime(user.UpdatedAt),
		); err != nil {
			return fmt.Errorf("user %d: %w", user.ID, err)
		}
	}

	// 3. Hospitals.
	for _, hospital := range sf.Hospitals {
		if _, err := tx.Exec(
			`INSERT INTO hospitals
				(id, name, code, address, phone, email, created_at, updated_at)
			 VALUES
				($1, $2, $3, $4, $5, $6, $7, $8)`,
			hospital.ID,
			hospital.Name,
			hospital.Code,
			hospital.Address,
			hospital.Phone,
			hospital.Email,
			parseTime(hospital.CreatedAt),
			parseTime(hospital.UpdatedAt),
		); err != nil {
			return fmt.Errorf("hospital %d: %w", hospital.ID, err)
		}
	}

	// 4. Rooms.
	for _, room := range sf.Rooms {
		if _, err := tx.Exec(
			`INSERT INTO rooms
				(id, name, code, room_type, description, created_at, updated_at)
			 VALUES
				($1, $2, $3, $4, $5, $6, $7)`,
			room.ID,
			room.Name,
			room.Code,
			room.RoomType,
			room.Description,
			parseTime(room.CreatedAt),
			parseTime(room.UpdatedAt),
		); err != nil {
			return fmt.Errorf("room %d: %w", room.ID, err)
		}
	}

	// 5. Assign rooms to users after rooms have been inserted.
	for _, user := range sf.Users {
		for _, roomID := range user.AssignedRoomIDs {
			if _, err := tx.Exec(
				`INSERT INTO user_assigned_rooms (user_id, room_id)
				 VALUES ($1, $2)`,
				user.ID,
				roomID,
			); err != nil {
				return fmt.Errorf(
					"assign room %d to user %d: %w",
					roomID,
					user.ID,
					err,
				)
			}
		}
	}

	// 6. Checklist items.
	for _, item := range sf.ChecklistItems {
		if _, err := tx.Exec(
			`INSERT INTO checklist_items
				(id, room_type, name, description, is_required, order_number)
			 VALUES
				($1, $2, $3, $4, $5, $6)`,
			item.ID,
			item.RoomType,
			item.Name,
			item.Description,
			item.IsRequired,
			item.OrderNumber,
		); err != nil {
			return fmt.Errorf("checklist %d: %w", item.ID, err)
		}
	}

	// 7. Inspections
	for _, inspection := range sf.Inspections {
		month := parseTime(inspection.InspectionMonth)
		month = time.Date(
			month.Year(),
			month.Month(),
			1,
			0, 0, 0, 0,
			time.UTC,
		)

		status := inspection.Status
		if status == "" {
			status = "SUBMITTED"
		}

		_, err := tx.Exec(
			`INSERT INTO inspections (
			id,
			room_id,
			inspector_id,
			inspection_month,
			notes,
			status,
			created_at,
			updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			inspection.ID,
			inspection.RoomID,
			inspection.InspectorID,
			month,
			inspection.Notes,
			status,
			parseTime(inspection.CreatedAt),
			parseTime(inspection.UpdatedAt),
		)
		if err != nil {
			return fmt.Errorf(
				"inspection %d: %w",
				inspection.ID,
				err,
			)
		}
	}

	seqs := []string{
		"roles",
		"users",
		"hospitals",
		"rooms",
		"checklist_items",
	}

	for _, table := range seqs {
		var exists bool

		if err := tx.QueryRow(
			`SELECT EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_name = $1
				  AND column_name = 'id'
			)`,
			table,
		).Scan(&exists); err != nil {
			return fmt.Errorf("check sequence %s: %w", table, err)
		}

		if !exists {
			continue
		}

		if _, err := tx.Exec(
			fmt.Sprintf(
				`SELECT setval(
					pg_get_serial_sequence('%s', 'id'),
					COALESCE((SELECT MAX(id) FROM %s), 1),
					true
				)`,
				table,
				table,
			),
		); err != nil {
			return fmt.Errorf("set sequence %s: %w", table, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit seed: %w", err)
	}

	return nil
}

func parseTimePtr(s *string) interface{} {
	if s == nil || *s == "" {
		return nil
	}

	return parseTime(*s)
}
