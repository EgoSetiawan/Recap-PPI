package service

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"PPI/internal/auth"
	"PPI/internal/model"
	"PPI/internal/repository"
	"PPI/internal/response"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

type Service struct {
	Repo      *repository.Repo
	JWTSecret string
	JWTTTL    time.Duration
	AppEnv    string
	SeedPath  string
	Seeder    func() error
}

type UserInput struct {
	Name            string  `json:"name"`
	Email           string  `json:"email"`
	Title           string  `json:"title"`
	Nip             string  `json:"nip"`
	Password        string  `json:"password"`
	Role            string  `json:"role"`
	Status          string  `json:"status"`
	RoleID          int64   `json:"role_id"`
	AssignedRoomIDs []int64 `json:"assigned_room_ids"`
}

// Fields a super admin may change on an existing user. Password is optional:
// an empty value keeps the current password.
type UpdateUserInput struct {
	Name            string  `json:"name"`
	Email           string  `json:"email"`
	Title           string  `json:"title"`
	Nip             string  `json:"nip"`
	Password        string  `json:"password"`
	Role            string  `json:"role"`
	Status          string  `json:"status"`
	RoleID          int64   `json:"role_id"`
	AssignedRoomIDs []int64 `json:"assigned_room_ids"`
}

func New(repo *repository.Repo, jwtSecret string, ttl time.Duration, appEnv, seedPath string) *Service {
	return &Service{
		Repo:      repo,
		JWTSecret: jwtSecret,
		JWTTTL:    ttl,
		AppEnv:    appEnv,
		SeedPath:  seedPath,
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

// --- OPS ---

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
		case StatusDraft:
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
	// Latest inspection per room.
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

var supportedRoomTypes = map[string]struct{}{
	"INPATIENT":      {},
	"ICU":            {},
	"ICCU":           {},
	"OPERATING_ROOM": {},
	"EMERGENCY":      {},
	"CHEMOTHERAPY":   {},
	"HEMODIALYSIS":   {},
}

func (s *Service) CreateRoom(actor *model.User, room *model.Room) (*model.Room, error) {
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
			"Hanya admin atau kepala PPI yang dapat menambahkan ruangan",
			http.StatusForbidden,
		)
	}

	if room == nil {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Data ruangan wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}

	room.Name = strings.TrimSpace(room.Name)
	room.Code = strings.TrimSpace(room.Code)
	room.RoomType = strings.ToUpper(strings.TrimSpace(room.RoomType))
	room.Description = strings.TrimSpace(room.Description)

	if room.Name == "" || room.Code == "" || room.RoomType == "" {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Nama, kode, dan tipe ruangan wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}
	if _, ok := supportedRoomTypes[room.RoomType]; !ok {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tipe ruangan tidak valid",
			http.StatusUnprocessableEntity,
		)
	}

	if err := s.Repo.CreateRoom(room); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) &&
			pgErr.Code == "23505" &&
			pgErr.ConstraintName == "rooms_code_key" {
			return nil, response.Err(
				"ROOM_EXISTS",
				"Kode ruangan sudah digunakan",
				http.StatusConflict,
			)
		}
		return nil, err
	}

	return room, nil
}

func canManageUserRooms(actor *model.User) bool {
	return actor != nil && (auth.IsAdmin(actor.Role) || auth.IsKepala(actor.Role))
}

// Returns users for room assignment.
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

// Replaces a user's room assignments.
func (s *Service) UpdateUserRooms(actor *model.User, userID int64, roomIDs []int64, ipAddress string) (*model.User, error) {
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

	oldRoomIDs := append([]int64{}, target.AssignedRoomIDs...)

	normalized, err := s.normalizeRoomIDs(roomIDs)
	if err != nil {
		return nil, err
	}

	target.AssignedRoomIDs = normalized

	if err := s.Repo.ChangeAssignPersonRoom(target); err != nil {
		return nil, err
	}

	if !sameIDs(oldRoomIDs, normalized) {
		rooms, _ := s.Repo.ListRooms("", "", "", nil)
		oldNames := roomNames(rooms, oldRoomIDs)
		newNames := roomNames(rooms, normalized)

		s.recordAudit(
			actor,
			"UPDATE_USER_ROOMS",
			"user",
			userID,
			map[string]interface{}{
				"room_ids":   oldRoomIDs,
				"room_names": oldNames,
			},
			map[string]interface{}{
				"room_ids":   normalized,
				"room_names": newNames,
			},
			ipAddress,
		)
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

func (s *Service) CreateUsers(actor *model.User, in UserInput, ipAddress string) (*model.User, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}
	if !auth.IsAdmin(actor.Role) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya admin yang dapat membuat pengguna baru",
			http.StatusForbidden,
		)
	}

	if strings.TrimSpace(in.Name) == "" ||
		strings.TrimSpace(in.Email) == "" ||
		strings.TrimSpace(in.Password) == "" {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Nama, email, dan password wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}

	role, err := s.resolveRole(in.RoleID, in.Role)
	if err != nil {
		return nil, err
	}

	existing, err := s.Repo.GetByEmail(strings.TrimSpace(in.Email))
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, response.Err(
			"EMAIL_EXISTS",
			"Email sudah digunakan",
			http.StatusConflict,
		)
	}

	pass := in.Password
	hash, err := auth.HashPassword(pass)
	if err != nil {
		return nil, err
	}
	status := "ACTIVE"
	if raw := strings.TrimSpace(in.Status); raw != "" {
		status = normalizeUserStatus(raw)
		if status == "" {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Status pengguna harus ACTIVE atau INACTIVE",
				http.StatusUnprocessableEntity,
			)
		}
	}
	u := &model.User{
		Name:            strings.TrimSpace(in.Name),
		Email:           strings.TrimSpace(in.Email),
		Title:           strings.TrimSpace(in.Title),
		Nip:             strings.TrimSpace(in.Nip),
		RoleID:          role.ID,
		Role:            role.Name,
		Status:          status,
		AssignedRoomIDs: in.AssignedRoomIDs,
	}
	if u.AssignedRoomIDs == nil {
		u.AssignedRoomIDs = []int64{}
	}
	if err := s.Repo.CreateUser(u, hash); err != nil {
		return nil, err
	}

	s.recordAudit(
		actor,
		"CREATE_USER",
		"user",
		u.ID,
		nil,
		map[string]interface{}{
			"name":     u.Name,
			"email":    u.Email,
			"nip":      u.Nip,
			"role":     u.Role,
			"room_ids": u.AssignedRoomIDs,
		},
		ipAddress,
	)

	return publicUser(u), nil
}

// Updates an existing user. Only super admins may edit users, matching create.
func (s *Service) UpdateUser(actor *model.User, userID int64, in UpdateUserInput, ipAddress string) (*model.User, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}
	if !auth.IsAdmin(actor.Role) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya admin yang dapat mengubah pengguna",
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

	name := strings.TrimSpace(in.Name)
	email := strings.TrimSpace(in.Email)
	if name == "" || email == "" {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Nama dan email wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}

	role, err := s.resolveRole(in.RoleID, in.Role)
	if err != nil {
		return nil, err
	}

	status := target.Status
	if raw := strings.TrimSpace(in.Status); raw != "" {
		status = normalizeUserStatus(raw)
		if status == "" {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Status pengguna harus ACTIVE atau INACTIVE",
				http.StatusUnprocessableEntity,
			)
		}
	}

	if actor.ID == userID {
		if !auth.IsAdmin(role.Name) {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Tidak dapat mengubah peran akun sendiri dari Super Admin",
				http.StatusUnprocessableEntity,
			)
		}
		if status != "ACTIVE" {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Tidak dapat menonaktifkan akun sendiri",
				http.StatusUnprocessableEntity,
			)
		}
	}

	existing, err := s.Repo.GetByEmail(email)
	if err != nil {
		return nil, err
	}
	if existing != nil && existing.ID != userID {
		return nil, response.Err(
			"EMAIL_EXISTS",
			"Email sudah digunakan",
			http.StatusConflict,
		)
	}

	passwordHash := ""
	if pass := strings.TrimSpace(in.Password); pass != "" {
		if len(pass) < 6 {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Password minimal 6 karakter",
				http.StatusUnprocessableEntity,
			)
		}
		hash, err := auth.HashPassword(pass)
		if err != nil {
			return nil, err
		}
		passwordHash = hash
	}

	// Room scope is edited for ANGGOTA; other roles keep the assignments they
	// already have (the report reads KEPALA room assignments too).
	roomIDs := append([]int64{}, target.AssignedRoomIDs...)
	switch {
	case auth.IsAnggota(role.Name):
		normalized, err := s.normalizeRoomIDs(in.AssignedRoomIDs)
		if err != nil {
			return nil, err
		}
		roomIDs = normalized
	case auth.IsAnggota(target.Role):
		roomIDs = []int64{}
	}

	oldValue := map[string]interface{}{
		"name":     target.Name,
		"email":    target.Email,
		"title":    target.Title,
		"nip":      target.Nip,
		"role":     target.Role,
		"status":   target.Status,
		"room_ids": append([]int64{}, target.AssignedRoomIDs...),
	}

	target.Name = name
	target.Email = email
	target.Title = strings.TrimSpace(in.Title)
	target.Nip = strings.TrimSpace(in.Nip)
	target.RoleID = role.ID
	target.Role = role.Name
	target.Status = status
	target.AssignedRoomIDs = roomIDs

	if err := s.Repo.UpdateUser(target, passwordHash); err != nil {
		return nil, err
	}

	updated, err := s.Repo.GetByID(userID)
	if err != nil {
		return nil, err
	}
	if updated == nil {
		return nil, response.Err(
			"NOT_FOUND",
			"Pengguna tidak ditemukan",
			http.StatusNotFound,
		)
	}

	s.recordAudit(
		actor,
		"UPDATE_USER",
		"user",
		userID,
		oldValue,
		map[string]interface{}{
			"name":     updated.Name,
			"email":    updated.Email,
			"nip":      updated.Nip,
			"role":     updated.Role,
			"status":   updated.Status,
			"room_ids": updated.AssignedRoomIDs,
		},
		ipAddress,
	)

	return publicUser(updated), nil
}

// Resolves a role from an explicit ID or a role name (accepting legacy aliases).
func (s *Service) resolveRole(roleID int64, roleName string) (*model.Role, error) {
	if roleID <= 0 && strings.TrimSpace(roleName) != "" {
		role, err := s.Repo.GetRoleByName(canonicalRoleName(roleName))
		if err != nil {
			return nil, err
		}
		if role == nil {
			return nil, response.Err("VALIDATION_ERROR", "Role tidak valid", http.StatusUnprocessableEntity)
		}
		roleID = role.ID
	}

	role, err := s.Repo.GetRole(roleID)
	if err != nil {
		return nil, err
	}
	if role == nil {
		return nil, response.Err("VALIDATION_ERROR", "Role tidak valid", http.StatusUnprocessableEntity)
	}
	return role, nil
}

// Maps legacy role aliases onto the names stored in the roles table.
func canonicalRoleName(role string) string {
	name := strings.ToUpper(strings.TrimSpace(role))
	switch name {
	case "ATASAN_PPI", "KEPALA_PPI":
		return "KEPALA"
	case "ANGGOTA_PPI":
		return "ANGGOTA"
	default:
		return name
	}
}

func normalizeUserStatus(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "ACTIVE":
		return "ACTIVE"
	case "INACTIVE":
		return "INACTIVE"
	default:
		return ""
	}
}

// Validates and de-duplicates room IDs, rejecting rooms that do not exist.
func (s *Service) normalizeRoomIDs(roomIDs []int64) ([]int64, error) {
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

	return normalized, nil
}
