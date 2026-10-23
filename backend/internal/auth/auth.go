package auth

import (
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Claims struct {
	UserID int64  `json:"user_id"`
	Role   string `json:"role"`
	JTI    string `json:"jti"`
	jwt.RegisteredClaims
}

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func IsRoomScoped(role string) bool {
	switch NormalizeRole(role) {
	case NormalizeRole(RoleAnggota), "ANGGOTA": // for assign room head, only head of room can be assigned
		return true
	default:
		return false
	}
}

func IssueToken(secret string, ttl time.Duration, userID int64, role, jti string) (string, time.Time, error) {
	exp := time.Now().Add(ttl)
	claims := Claims{
		UserID: userID,
		Role:   role,
		JTI:    jti,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := t.SignedString([]byte(secret))
	return s, exp, err
}

func ParseToken(secret, tokenStr string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := t.Claims.(*Claims)
	if !ok || !t.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}

const (
	RoleSuperAdmin = "SUPER_ADMIN"
	RoleKepala     = "ATASAN_PPI"
	RoleAnggota    = "ANGGOTA_PPI"
)

func NormalizeRole(role string) string {
	role = strings.ToUpper(strings.TrimSpace(role))
	role = strings.ReplaceAll(role, "-", "_")
	role = strings.ReplaceAll(role, " ", "_")

	switch role {
	case "ANGGOTA":
		return RoleAnggota
	case "KEPALA":
		return RoleKepala
	default:
		return role
	}
}

func IsAnggota(role string) bool {
	return NormalizeRole(role) == RoleAnggota
}

func IsKepala(role string) bool {
	return NormalizeRole(role) == RoleKepala
}

func IsAdmin(role string) bool {
	return NormalizeRole(role) == RoleSuperAdmin
}

func DefaultTitle(role string) string {
	switch NormalizeRole(role) {
	case RoleKepala:
		return "Kepala PPI"
	case RoleAnggota:
		return "Anggota PPI"
	case RoleSuperAdmin:
		return "Super Admin"
	default:
		return role
	}
}
