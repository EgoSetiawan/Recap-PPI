package service

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"PPI/internal/auth"
	"PPI/internal/model"
	"PPI/internal/repository"
	"PPI/internal/response"

	// "PPI/internal/storage"

	"github.com/google/uuid"
)

type Service struct {
	Repo      *repository.Repo
	JWTSecret string
	JWTTTL    time.Duration
	AppEnv    string
	SeedPath  string
	// UploadDir         string
	Seeder            func() error
	ImageKitPublicURL string
	MaxUploadBytes    int64
}

func New(repo *repository.Repo, jwtSecret string, ttl time.Duration, appEnv, seedPath string) *Service {
	// uploadDir
	return &Service{
		Repo:      repo,
		JWTSecret: jwtSecret,
		JWTTTL:    ttl,
		AppEnv:    appEnv,
		SeedPath:  seedPath,
		// UploadDir:      uploadDir,
		// MaxUploadBytes: 10 * 1024 * 1024,
	}
}

func publicUser(u *model.User) *model.User {
	if u == nil {
		return nil
	}
	cp := *u
	cp.PasswordHash = ""
	if cp.AssignedRoomIDs == nil {
		cp.AssignedRoomIDs = []int64{}
	}
	return &cp
}

// func uid(u *model.User) *int64 {
// 	if u == nil {
// 		return nil
// 	}
// 	id := u.ID
// 	return &id
// }

// --- Auth ---

type LoginInput struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type UpdateUserRoomsInput struct {
	RoomIDs []int64 `json:"room_ids"`
}

func scopeRoomIDs(u *model.User) []int64 {
	if u == nil {
		return nil
	}
	if auth.IsRoomScoped(u.Role) {
		if u.AssignedRoomIDs == nil {
			return []int64{}
		}
		return u.AssignedRoomIDs
	}
	return nil // nil = no filter (all rooms)
}

func assertRoomAccess(u *model.User, roomID int64) error {
	scope := scopeRoomIDs(u)
	if scope == nil {
		return nil
	}
	for _, id := range scope {
		if id == roomID {
			return nil
		}
	}
	return response.Err("FORBIDDEN", "Akses ruangan di luar scope", http.StatusForbidden)
}

func (s *Service) Login(in LoginInput) (map[string]interface{}, error) {
	identifier := strings.ToLower(strings.TrimSpace(in.Username))
	if identifier == "" {
		identifier = strings.ToLower(strings.TrimSpace(in.Email))
	}
	user, err := s.Repo.GetByUsernameOrEmail(identifier)
	if err != nil {
		return nil, err
	}
	if user == nil || user.Status != "ACTIVE" || !auth.CheckPassword(user.PasswordHash, in.Password) {
		return nil, response.Err("INVALID_CREDENTIALS", "Email/Username atau password salah", http.StatusUnauthorized)
	}
	jti := uuid.NewString()
	token, _, err := auth.IssueToken(s.JWTSecret, s.JWTTTL, user.ID, user.Role, jti)
	if err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"token": token,
		"user":  publicUser(user),
	}, nil
}

func (s *Service) Logout(jti string, exp time.Time) error {
	if jti == "" {
		return nil
	}
	return s.Repo.BlacklistToken(jti, exp)
}

func (s *Service) Me(u *model.User) *model.User {
	return publicUser(u)
}

//--- OPS ---//

func (s *Service) Dashboard(actor *model.User) (map[string]interface{}, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}
	scope := scopeRoomIDs(actor)
	// Get rooms available to this user.
	rooms, err := s.Repo.ListRooms(
		"",
		"",
		"",
		scope,
	)
	if err != nil {
		return nil, err
	}

	// Get inspections available to this user.
	inspections, err := s.Repo.ListInspections(
		repository.InspectionFilter{
			ScopeIDs: scope,
		},
	)
	if err != nil {
		return nil, err
	}

	// Determine the current month.
	now := time.Now().UTC()
	currentMonth := time.Date(
		now.Year(),
		now.Month(),
		1,
		0, 0, 0, 0,
		time.UTC,
	)

	// Statistics.
	monthlyInspections := 0
	open := 0
	submitted := 0
	approved := 0
	rejected := 0

	for _, ins := range inspections {
		// Count statuses across all months.
		switch ins.Status {
		case StatusOpen:
			open++
		case StatusSubmitted:
			submitted++
		case StatusApproved:
			approved++
		case StatusRejected:
			rejected++
		}

		// Count inspections belonging to the current month only.
		if ins.InspectionMonth.Year() == currentMonth.Year() &&
			ins.InspectionMonth.Month() == currentMonth.Month() {
			monthlyInspections++
		}
	}
	// Map room ID -> room.
	roomByID := make(map[int64]model.Room, len(rooms))
	for _, room := range rooms {
		roomByID[room.ID] = room
	}
	// Get latest inspection for each room.
	// ListInspections() is ordered by month DESC, id DESC,
	// so the first inspection found for a room is its latest one.
	latestByRoom := make(map[int64]model.Inspection)
	for _, ins := range inspections {
		if _, exists := latestByRoom[ins.RoomID]; exists {
			continue
		}
		// Attach room information.
		if room, exists := roomByID[ins.RoomID]; exists {
			roomCopy := room
			ins.Room = &roomCopy
		}
		latestByRoom[ins.RoomID] = ins
	}
	// Room monitoring.
	roomRows := make([]map[string]interface{}, 0, len(rooms))
	for _, room := range rooms {
		row := map[string]interface{}{
			"id":          room.ID,
			"code":        room.Code,
			"name":        room.Name,
			"room_type":   room.RoomType,
			"description": room.Description,
		}
		if latest, ok := latestByRoom[room.ID]; ok {
			row["inspection_month"] = latest.InspectionMonth
			row["inspection_status"] = latest.Status
			row["inspection_id"] = latest.ID
		} else {
			row["inspection_month"] = nil
			row["inspection_status"] = nil
			row["inspection_id"] = nil
		}

		roomRows = append(roomRows, row)
	}
	// Recent inspections.
	recent := make([]model.Inspection, 0, 15)
	for _, ins := range inspections {
		if len(recent) >= 15 {
			break
		}
		// Attach room information.
		if room, exists := roomByID[ins.RoomID]; exists {
			roomCopy := room
			ins.Room = &roomCopy
		}
		recent = append(recent, ins)
	}
	return map[string]interface{}{
		"role": actor.Role,

		"totals": map[string]int{
			"rooms":             len(rooms),
			"inspections_month": monthlyInspections,
			"open":              open,
			"submitted":         submitted,
			"approved":          approved,
			"rejected":          rejected,
		},
		"recent_inspections": recent,
		"room_monitor":       roomRows,
	}, nil
}

func (s *Service) ListChecklist(roomType string) ([]model.ChecklistItem, error) {
	return s.Repo.ListChecklist(roomType)
}

func (s *Service) ListRoomsWithActors(actor *model.User, q string) ([]model.Room, error) {
	return s.Repo.ListRoomsWithActors(q, scopeRoomIDs(actor))
}

func canManageUserRooms(actor *model.User) bool {
	return actor != nil && (auth.IsAdmin(actor.Role) || auth.IsKepala(actor.Role))
}

// ListUsers returns the user directory used by the room-assignment screen.
func (s *Service) ListUsers(actor *model.User) ([]model.User, error) {
	if !canManageUserRooms(actor) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya admin atau kepala PPI yang dapat mengelola pengguna",
			http.StatusForbidden,
		)
	}

	users, err := s.Repo.ListUsers()
	if err != nil {
		return nil, err
	}

	out := make([]model.User, 0, len(users))
	for i := range users {
		out = append(out, *publicUser(&users[i]))
	}

	return out, nil
}

// UpdateUserRooms replaces the rooms assigned to an Anggota PPI.
func (s *Service) UpdateUserRooms(actor *model.User, userID int64, roomIDs []int64) (*model.User, error) {
	if !canManageUserRooms(actor) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya admin atau kepala PPI yang dapat mengubah penugasan ruangan",
			http.StatusForbidden,
		)
	}

	if userID <= 0 {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"ID pengguna tidak valid",
			http.StatusUnprocessableEntity,
		)
	}

	target, err := s.Repo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	if target == nil {
		return nil, response.Err(
			"NOT_FOUND",
			"Pengguna tidak ditemukan",
			http.StatusNotFound,
		)
	}

	if !auth.IsAnggota(target.Role) {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Hanya anggota PPI yang dapat ditugaskan ke ruangan",
			http.StatusUnprocessableEntity,
		)
	}

	normalized := make([]int64, 0, len(roomIDs))
	seen := make(map[int64]struct{}, len(roomIDs))

	for _, roomID := range roomIDs {
		if roomID <= 0 {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"ID ruangan tidak valid",
				http.StatusUnprocessableEntity,
			)
		}
		if _, exists := seen[roomID]; exists {
			continue
		}

		room, err := s.Repo.GetRoom(roomID)
		if err != nil {
			return nil, err
		}
		if room == nil {
			return nil, response.Err(
				"NOT_FOUND",
				fmt.Sprintf("Ruangan %d tidak ditemukan", roomID),
				http.StatusNotFound,
			)
		}

		seen[roomID] = struct{}{}
		normalized = append(normalized, roomID)
	}

	target.AssignedRoomIDs = normalized

	if err := s.Repo.ChangeAssignPersonRoom(target); err != nil {
		return nil, err
	}

	return publicUser(target), nil
}

func (s *Service) CreateChecklist(actor *model.User, c *model.ChecklistItem) (*model.ChecklistItem, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsAdmin(actor.Role) && !auth.IsKepala(actor.Role) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya admin atau kepala PPI yang dapat mengelola item pemeriksaan",
			http.StatusForbidden,
		)
	}

	if c.RoomType == "" {
		c.RoomType = "ALL"
	}
	if c.OrderNumber == 0 {
		c.OrderNumber = 99
	}
	if err := s.Repo.CreateChecklistItem(c); err != nil {
		return nil, err
	}
	return c, nil
}
