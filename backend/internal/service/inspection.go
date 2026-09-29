package service

import (

	// "mime/multipart"

	"strings"
	"time"

	"PPI/internal/auth"
	"PPI/internal/model"
	// "PPI/internal/storage"
)

const (
	StatusOpen      = "OPEN"
	StatusSubmitted = "SUBMITTED"
	StatusApproved  = "APPROVED"
	StatusRejected  = "REJECTED"
)

type CreateInspectionInput struct {
	RoomID          int64                   `json:"room_id"`
	InspectionMonth time.Time               `json:"inspection_month"`
	Checklist       []model.ChecklistAnswer `json:"checklist"`
	Notes           string                  `json:"notes"`
}

type ApproveInspectionInput struct {
	Signature string `json:"signature"`
}

func validSignatureImage(url string) bool {
	u := strings.TrimSpace(url)
	return strings.HasPrefix(u, "data:image") && len(u) > 80
}

func (s *Service) kepalaSig(actor *model.User, in *model.Signature) *model.Signature {
	if in == nil || !validSignatureImage(in.ImageDataURL) {
		return nil
	}
	now := time.Now().UTC()
	sig := *in
	uid := actor.ID
	sig.SignerUserID = &uid
	sig.Role = "KEPALA"
	if sig.Method == "" {
		sig.Method = "draw"
	}
	if sig.SignerName == "" {
		sig.SignerName = actor.Name
	}
	if sig.SignerTitle == "" {
		if actor.Title != "" {
			sig.SignerTitle = actor.Title
		} else {
			sig.SignerTitle = auth.DefaultTitle(actor.Role)
		}
	}
	if sig.SignedAt.IsZero() {
		sig.SignedAt = now
	}
	return &sig
}
