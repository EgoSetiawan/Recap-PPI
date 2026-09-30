package service

import (
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

func uid(u *model.User) *int64 {
	if u == nil {
		return nil
	}
	id := u.ID
	return &id
}

// --- Auth ---

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
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

func (s *Service) Login(in LoginInput, ip string) (map[string]interface{}, error) {
	email := strings.ToLower(strings.TrimSpace(in.Email))
	user, err := s.Repo.GetByEmail(email)
	if err != nil {
		return nil, err
	}
	if user == nil || user.Status != "ACTIVE" || !auth.CheckPassword(user.PasswordHash, in.Password) {
		return nil, response.Err("INVALID_CREDENTIALS", "Email atau password salah", http.StatusUnauthorized)
	}
	jti := uuid.NewString()
	token, _, err := auth.IssueToken(s.JWTSecret, s.JWTTTL, user.ID, user.Role, jti)
	if err != nil {
		return nil, err
	}
	// _ = s.Repo.AddAudit(uid(user), "LOGIN", "user", uid(user), nil, map[string]string{"email": user.Email}, ip)
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
