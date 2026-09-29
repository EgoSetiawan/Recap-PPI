package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	AppEnv             string
	Port               string
	DatabaseURL        string
	JWTSecret          string
	JWTTTL             time.Duration
	CORSOrigins        []string
	UploadDir          string
	SeedPath           string
	ImageKitPrivateKey string
	ImageKitPublicURL  string
	ImageKitFolder     string
	MaxUploadBytes     int64
}

func Load() Config {
	ttlHours := envInt("JWT_TTL_HOURS", 24)
	origins := env("CORS_ORIGINS", "http://localhost:5173")
	var cors []string
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cors = append(cors, o)
		}
	}
	return Config{
		AppEnv:             env("APP_ENV", "development"),
		Port:               env("PORT", "3001"),
		DatabaseURL:        env("DATABASE_URL", "postgres://teguh:teguh@localhost:5433/teguh?sslmode=disable"),
		JWTSecret:          env("JWT_SECRET", "change-me-dev-secret-rsu-koesnadi"),
		JWTTTL:             time.Duration(ttlHours) * time.Hour,
		CORSOrigins:        cors,
		UploadDir:          env("UPLOAD_DIR", "uploads"),
		SeedPath:           env("SEED_PATH", "../mockoon/seed.json"),
		ImageKitPrivateKey: env("IMAGEKIT_PRIVATE_KEY", ""),
		ImageKitPublicURL:  env("IMAGEKIT_URL_ENDPOINT", ""),
		ImageKitFolder:     env("IMAGEKIT_FOLDER", "/teguh/inspections"),
		MaxUploadBytes:     int64(envInt("MAX_UPLOAD_MB", 10)) * 1024 * 1024,
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}
