package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"PPI/internal/seed"

	"github.com/joho/godotenv"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	_ = godotenv.Load()

	seedPath := flag.String("seed", "", "path to seed.json")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://teguh:teguh@localhost:5433/ppi?sslmode=disable"
	}

	path := *seedPath
	if path == "" {
		path = os.Getenv("SEED_PATH")
	}
	if path == "" {
		path = "../mockoon/seed.json"
	}

	if !filepath.IsAbs(path) {
		abs, err := filepath.Abs(path)
		if err != nil {
			log.Fatalf("resolve seed path: %v", err)
		}
		path = abs
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("ping db: %v", err)
	}

	if _, err := db.Exec(`
		TRUNCATE
			rooms,d
			users,
			roles
		RESTART IDENTITY CASCADE
	`); err != nil {
		log.Fatalf("truncate: %v", err)
	}

	if err := seed.Run(db, path); err != nil {
		log.Fatalf("seed: %v", err)
	}

	fmt.Println("Seed completed from", path)
}
