package service

import (

	// "mime/multipart"

	"database/sql"
	"net/http"
	"strings"
	"time"

	"PPI/internal/auth"
	"PPI/internal/model"
	"PPI/internal/repository"
	"PPI/internal/response"
	// "PPI/internal/storage"
)

const (
	StatusOpen      = "OPEN"
	StatusSubmitted = "SUBMITTED"
	StatusApproved  = "APPROVED"
	StatusRejected  = "REJECTED"
)

type CreateInspectionInput struct {
	RoomID          int64     `json:"room_id"`
	InspectionMonth time.Time `json:"inspection_month"`
	Notes           string    `json:"notes"`
}

type SaveChecklistInput struct {
	AnswerDate time.Time               `json:"answer_date"`
	Items      []model.ChecklistAnswer `json:"items"`
}

type ApproveInspectionInput struct {
	Signature string `json:"signature"`
}

func validSignatureImage(url string) bool {
	u := strings.TrimSpace(url)
	return strings.HasPrefix(u, "data:image") && len(u) > 80
}

// func (s *Service) kepalaSig(actor *model.User, in *model.Signature) *model.Signature {
// 	if in == nil || !validSignatureImage(in.ImageDataURL) {
// 		return nil
// 	}
// 	now := time.Now().UTC()
// 	sig := *in
// 	uid := actor.ID
// 	sig.SignerUserID = &uid
// 	sig.Role = "KEPALA"
// 	if sig.Method == "" {
// 		sig.Method = "draw"
// 	}
// 	if sig.SignerName == "" {
// 		sig.SignerName = actor.Name
// 	}
// 	if sig.SignerTitle == "" {
// 		if actor.Title != "" {
// 			sig.SignerTitle = actor.Title
// 		} else {
// 			sig.SignerTitle = auth.DefaultTitle(actor.Role)
// 		}
// 	}
// 	if sig.SignedAt.IsZero() {
// 		sig.SignedAt = now
// 	}
// 	return &sig
// }

func (s *Service) kepalaSig(actor *model.User, imageDataURL string) *model.Signature {
	if actor == nil || actor.Role != "KEPALA" {
		return nil
	}
	imageDataURL = strings.TrimSpace(imageDataURL)
	if !validSignatureImage(imageDataURL) {
		return nil
	}
	uid := actor.ID
	title := actor.Title
	if title == "" {
		title = auth.DefaultTitle(actor.Role)
	}
	return &model.Signature{
		SignerUserID: &uid,
		Role:         "KEPALA",
		Method:       "draw",
		SignerName:   actor.Name,
		SignerTitle:  title,
		ImageDataURL: imageDataURL,
		SignedAt:     time.Now().UTC(),
	}
}

func (s *Service) CreateInspection(actor *model.User, in CreateInspectionInput) (*model.Inspection, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if actor.Role != "ANGGOTA" {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya Anggota yang dapat membuat pemeriksaan",
			http.StatusForbidden,
		)
	}

	if in.RoomID == 0 {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Room ID wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}

	if in.InspectionMonth.IsZero() {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Bulan pemeriksaan wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}

	room, err := s.Repo.GetRoom(in.RoomID)
	if err != nil {
		return nil, err
	}

	if room == nil {
		return nil, response.Err(
			"NOT_FOUND",
			"Room not found",
			http.StatusNotFound,
		)
	}

	if err := assertRoomAccess(actor, room.ID); err != nil {
		return nil, err
	}

	month := time.Date(
		in.InspectionMonth.Year(),
		in.InspectionMonth.Month(),
		1,
		0, 0, 0, 0,
		time.UTC,
	)

	ins := &model.Inspection{
		RoomID:          room.ID,
		InspectorID:     actor.ID,
		InspectionMonth: month,
		Notes:           in.Notes,
		Status:          StatusOpen,
		Checklist:       []model.ChecklistAnswer{},
		Signatures:      []model.Signature{},
	}

	if err := s.Repo.CreateInspectionFull(ins); err != nil {
		return nil, err
	}

	return s.Repo.GetInspection(ins.ID)
}

func (s *Service) SaveChecklist(actor *model.User, inspectionID int64, in SaveChecklistInput) (*model.Inspection, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	ins, err := s.Repo.GetInspection(inspectionID)
	if err != nil {
		return nil, err
	}

	if ins == nil {
		return nil, response.Err(
			"NOT_FOUND",
			"Inspection not found",
			http.StatusNotFound,
		)
	}

	if actor.Role != "ANGGOTA" {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya Anggota yang dapat mengisi pemeriksaan",
			http.StatusForbidden,
		)
	}

	if ins.InspectorID != actor.ID {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya pemeriksa yang membuat pemeriksaan yang dapat mengubahnya",
			http.StatusForbidden,
		)
	}

	if err := assertRoomAccess(actor, ins.RoomID); err != nil {
		return nil, err
	}

	if ins.Status != StatusOpen {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Pemeriksaan sudah tidak dapat diubah",
			http.StatusUnprocessableEntity,
		)
	}

	if in.AnswerDate.IsZero() {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanggal pemeriksaan wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}

	answerDate := in.AnswerDate

	for i := range in.Items {
		in.Items[i].InspectionID = ins.ID
		in.Items[i].AnswerDate = answerDate
	}

	if err := s.Repo.ReplaceChecklistForDate(
		ins.ID,
		answerDate,
		in.Items,
	); err != nil {
		return nil, err
	}

	return s.Repo.GetInspection(ins.ID)
}

func (s *Service) GetInspection(actor *model.User, id int64) (*model.Inspection, error) {
	return s.getInspectionForActor(actor, id)
}

func (s *Service) ListInspections(actor *model.User, roomID *int64, status string, month *time.Time) ([]model.Inspection, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}
	return s.Repo.ListInspections(repository.InspectionFilter{
		ScopeIDs: scopeRoomIDs(actor),
		RoomID:   roomID,
		Status:   status,
		Month:    month,
	})
}

func (s *Service) getInspectionForActor(actor *model.User, id int64) (*model.Inspection, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}
	ins, err := s.Repo.GetInspection(id)
	if err != nil {
		return nil, err
	}
	if ins == nil {
		return nil, response.Err(
			"NOT_FOUND",
			"Inspection not found",
			http.StatusNotFound,
		)
	}
	if actor.Role == "ANGGOTA" {
		if err := assertRoomAccess(actor, ins.RoomID); err != nil {
			return nil, err
		}
	}
	return ins, nil
}

func (s *Service) DeleteInspection(actor *model.User, id int64) error {
	err := s.Repo.SoftDeleteInspection(id)

	if err == sql.ErrNoRows {
		return response.Err(
			"NOT_FOUND",
			"Inspection not found",
			http.StatusNotFound,
		)
	}

	if err != nil {
		return err
	}

	return nil
}

func (s *Service) ReplaceChecklistForDate(inspectionID int64, answerDate time.Time, items []model.ChecklistAnswer) error {
	// Check that the inspection exists.
	ins, err := s.Repo.GetInspection(inspectionID)
	if err != nil {
		return err
	}
	if ins == nil {
		return response.Err(
			"NOT_FOUND",
			"Inspection not found",
			http.StatusNotFound,
		)
	}
	// Ensure the inspection has a valid month.
	if ins.InspectionMonth.IsZero() {
		return response.Err(
			"VALIDATION_ERROR",
			"Inspection month is missing",
			http.StatusUnprocessableEntity,
		)
	}
	// Normalize the selected date.
	answerDate = time.Date(
		answerDate.Year(),
		answerDate.Month(),
		answerDate.Day(),
		0, 0, 0, 0,
		time.UTC,
	)
	// Allow editing only within the inspection's month.
	monthStart := time.Date(
		ins.InspectionMonth.Year(),
		ins.InspectionMonth.Month(),
		1,
		0, 0, 0, 0,
		time.UTC,
	)
	nextMonth := monthStart.AddDate(0, 1, 0)
	if answerDate.Before(monthStart) ||
		!answerDate.Before(nextMonth) {
		return response.Err(
			"VALIDATION_ERROR",
			"The selected date must belong to the inspection month",
			http.StatusUnprocessableEntity,
		)
	}
	// Prevent duplicate checklist item IDs.
	seen := make(map[int64]struct{}, len(items))
	for _, item := range items {
		if item.ChecklistItemID <= 0 {
			return response.Err(
				"VALIDATION_ERROR",
				"Invalid checklist item ID",
				http.StatusUnprocessableEntity,
			)
		}
		if _, exists := seen[item.ChecklistItemID]; exists {
			return response.Err(
				"VALIDATION_ERROR",
				"Duplicate checklist item ID",
				http.StatusUnprocessableEntity,
			)
		}
		seen[item.ChecklistItemID] = struct{}{}
	}
	// Replace answers only for the selected date.
	return s.Repo.ReplaceChecklistForDate(
		inspectionID,
		answerDate,
		items,
	)
}
