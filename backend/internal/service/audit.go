package service

import (
	"fmt"
	"log"
	"net/http"
	"strings"

	"PPI/internal/auth"
	"PPI/internal/model"
	"PPI/internal/response"
)

// ListAuditLogs returns recent audit entries for admin and kepala users.
func (s *Service) ListAuditLogs(actor *model.User, limit int) ([]model.AuditLog, error) {
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
			"Hanya admin atau kepala PPI yang dapat melihat audit",
			http.StatusForbidden,
		)
	}

	return s.Repo.ListAuditLogs(limit)
}

// recordAudit writes an audit entry. Audit failures are logged but must not
// make the successful business action look like it failed.
func (s *Service) recordAudit(
	actor *model.User,
	action, entityType string,
	entityID int64,
	oldValue, newValue interface{},
	ipAddress string,
) {
	if actor == nil {
		return
	}

	userID := actor.ID
	entity := entityID

	if err := s.Repo.CreateAuditLog(
		&userID,
		action,
		entityType,
		&entity,
		oldValue,
		newValue,
		ipAddress,
	); err != nil {
		log.Printf("create audit log: %v", err)
	}
}

func roomNames(rooms []model.Room, ids []int64) []string {
	byID := make(map[int64]string, len(rooms))
	for _, room := range rooms {
		byID[room.ID] = room.Name
	}

	names := make([]string, 0, len(ids))
	for _, id := range ids {
		if name, ok := byID[id]; ok && strings.TrimSpace(name) != "" {
			names = append(names, name)
			continue
		}
		names = append(names, fmt.Sprintf("#%d", id))
	}

	return names
}

func sameIDs(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	seen := make(map[int64]struct{}, len(a))
	for _, id := range a {
		seen[id] = struct{}{}
	}
	for _, id := range b {
		if _, ok := seen[id]; !ok {
			return false
		}
	}
	return true
}
