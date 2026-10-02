package main

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"PPI/internal/config"
	"PPI/internal/db"
	"PPI/internal/handler"
	"PPI/internal/middleware"
	"PPI/internal/repository"
	"PPI/internal/seed"
	"PPI/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	cfg := config.Load()
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	sqlDB, err := db.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer sqlDB.Close()

	migrationsDir := findMigrations()
	if err := db.Migrate(sqlDB, migrationsDir); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	seedPath := resolvePath(cfg.SeedPath)
	repo := repository.New(sqlDB)
	svc := service.New(repo, cfg.JWTSecret, cfg.JWTTTL, cfg.AppEnv, seedPath)
	// cfg.UploadDir

	svc.Seeder = func() error {
		return seed.Run(sqlDB, seedPath)
	}

	var userCount int
	_ = sqlDB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&userCount)
	if userCount == 0 {
		log.Printf("Empty database — seeding from %s", seedPath)
		if err := seed.Run(sqlDB, seedPath); err != nil {
			log.Fatalf("seed: %v", err)
		}
	}

	h := handler.New(svc)
	r := gin.Default()

	r.Use(middleware.CORS(cfg.CORSOrigins))
	api := r.Group("/api")
	api.GET("/health", h.Health)
	// api.POST("/dev/reset", h.DevReset)
	api.POST("/auth/login", middleware.LoginRateLimit(20, time.Minute), h.Login)
	authed := api.Group("")
	authed.Use(middleware.Auth(cfg.JWTSecret, repo, repo))
	{
		authed.GET("/me", h.Me)
		authed.GET("/dashboard", h.Dashboard)
		authed.GET("/inspections", h.ListInspections)
		authed.GET("/inspections/:id", h.GetInspection)
		authed.POST("/inspections", h.CreateInspection)
	}

	addr := ":" + cfg.Port
	log.Printf("Room Inspection API listening on http://localhost%s", addr)
	log.Printf("Health: http://localhost%s/api/health", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}

func resolvePath(p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return p
	}
	return abs
}

func findMigrations() string {
	candidates := []string{"migrations", "./migrations"}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}
	// when running from repo root: backend/migrations
	if st, err := os.Stat("backend/migrations"); err == nil && st.IsDir() {
		abs, _ := filepath.Abs("backend/migrations")
		return abs
	}
	return "migrations"
}
