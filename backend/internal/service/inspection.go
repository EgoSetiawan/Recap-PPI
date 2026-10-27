package service

import (
	// "mime/multipart"
	"database/sql"
	"fmt"
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

type SignaturePayload struct {
	ImageDataURL string `json:"image_data_url" binding:"required"`
}

type ChecklistItemInput struct {
	ChecklistItemID int64   `json:"checklist_item_id" binding:"required,gt=0"`
	Status          *string `json:"status"`
}

type SaveInspectionDateInput struct {
	AnswerDate string               `json:"answer_date" binding:"required"`
	Items      []ChecklistItemInput `json:"items" binding:"required,min=1"`
}

type CreateInspectionInput struct {
	RoomID          int64                     `json:"room_id" binding:"required,gt=0"`
	InspectionMonth time.Time                 `json:"inspection_month" binding:"required"`
	Notes           string                    `json:"notes"`
	Days            []SaveInspectionDateInput `json:"days" binding:"required,min=1"`
}

type SubmitInspectionInput struct {
	// Notes     string            `json:"notes"`
	Signature *SignaturePayload `json:"signature" binding:"required"`
}

type ApproveInspectionInput struct {
	Signature *SignaturePayload `json:"signature" binding:"required"`
}

type SaveChecklistInput struct {
	AnswerDate time.Time               `json:"answer_date"`
	Items      []model.ChecklistAnswer `json:"items"`
}

func validSignatureImage(url string) bool {
	u := strings.TrimSpace(url)
	return strings.HasPrefix(u, "data:image") && len(u) > 80
}

func findSignatureByRole(signatures []model.Signature, role string) *model.Signature {
	for i := range signatures {
		if signatures[i].Role == role {
			return &signatures[i]
		}
	}

	return nil
}

func buildInspectionChecklist(days []SaveInspectionDateInput, month time.Time) ([]model.ChecklistAnswer, error) {
	if len(days) == 0 {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Minimal satu tanggal pemeriksaan wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}

	checklist := make([]model.ChecklistAnswer, 0)
	seenDates := make(map[string]bool)

	for _, day := range days {
		dateText := strings.TrimSpace(day.AnswerDate)

		answerDate, err := time.Parse("2006-01-02", dateText)
		if err != nil {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Format answer_date harus YYYY-MM-DD: "+dateText,
				http.StatusUnprocessableEntity,
			)
		}

		if answerDate.Year() != month.Year() ||
			answerDate.Month() != month.Month() {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Tanggal checklist harus berada dalam bulan pemeriksaan",
				http.StatusUnprocessableEntity,
			)
		}

		dateKey := answerDate.Format("2006-01-02")
		if seenDates[dateKey] {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Tanggal checklist duplikat: "+dateKey,
				http.StatusUnprocessableEntity,
			)
		}
		seenDates[dateKey] = true

		if len(day.Items) == 0 {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Setiap tanggal harus memiliki minimal satu item checklist",
				http.StatusUnprocessableEntity,
			)
		}

		seenItems := make(map[int64]bool)

		for _, item := range day.Items {
			if item.ChecklistItemID <= 0 {
				return nil, response.Err(
					"VALIDATION_ERROR",
					"Checklist item ID tidak valid",
					http.StatusUnprocessableEntity,
				)
			}

			if seenItems[item.ChecklistItemID] {
				return nil, response.Err(
					"VALIDATION_ERROR",
					"Checklist item duplikat pada tanggal "+dateKey,
					http.StatusUnprocessableEntity,
				)
			}
			seenItems[item.ChecklistItemID] = true

			var status *string

			if item.Status != nil {
				value := strings.TrimSpace(*item.Status)

				if value != "GOOD" {
					return nil, response.Err(
						"VALIDATION_ERROR",
						"Status checklist hanya boleh GOOD atau null",
						http.StatusUnprocessableEntity,
					)
				}

				status = &value
			}

			checklist = append(checklist, model.ChecklistAnswer{
				ChecklistItemID: item.ChecklistItemID,
				AnswerDate:      answerDate,
				Status:          status,
				Notes:           "",
			})
		}
	}

	return checklist, nil
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

func (s *Service) kepalaSig(actor *model.User, imageDataURL string, id int64, in *model.Signature) *model.Signature {
	if actor == nil || !auth.IsKepala(actor.Role) {
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
	_, err := s.getInspectionForActor(actor, id)

	if err != nil {
		return nil
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

	if in.RoomID <= 0 {
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

	// Convert all dates and items from the request into checklist answers.
	checklist, err := buildInspectionChecklist(in.Days, month)
	if err != nil {
		return nil, err
	}

	ins := &model.Inspection{
		RoomID:          room.ID,
		InspectorID:     actor.ID,
		InspectionMonth: month,
		Notes:           strings.TrimSpace(in.Notes),
		Status:          StatusOpen,
		Checklist:       checklist,
		Signatures:      []model.Signature{},
	}
	// Create the monthly inspection once.
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

	if !auth.IsAnggota(actor.Role) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya Anggota yang dapat membuat pemeriksaan",
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
	scopeIDs := scopeRoomIDs(actor)
	return s.Repo.ListInspections(repository.InspectionFilter{
		ScopeIDs: scopeIDs,
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
	if auth.IsAnggota(actor.Role) {
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
	// Can edit when status were open
	if strings.ToUpper(strings.TrimSpace(ins.Status)) != "OPEN" {
		return response.Err(
			"INSPECTION_LOCKED",
			"Only open inspections can be edited",
			http.StatusConflict,
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

func (s *Service) SaveInspectionDate(actor *model.User, inspectionID int64, in model.SaveInspectionDateInput) error {
	if actor == nil {
		return response.Err(
			"UNAUTHENTICATED",
			"User tidak ditemukan",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsAnggota(actor.Role) {
		return response.Err(
			"FORBIDDEN",
			"Hanya Anggota yang dapat mengubah checklist",
			http.StatusForbidden,
		)
	}

	if inspectionID <= 0 {
		return response.Err(
			"VALIDATION_ERROR",
			"ID pemeriksaan tidak valid",
			http.StatusUnprocessableEntity,
		)
	}

	// Parse a calendar date, not an arbitrary timestamp.
	answerDate, err := time.Parse("2006-01-02", strings.TrimSpace(in.AnswerDate))
	if err != nil {
		return response.Err(
			"VALIDATION_ERROR",
			"answer_date harus berformat YYYY-MM-DD",
			http.StatusUnprocessableEntity,
		)
	}

	inspection, err := s.Repo.GetInspection(inspectionID)
	if err != nil {
		return err
	}
	if inspection == nil {
		return response.Err(
			"NOT_FOUND",
			"Pemeriksaan tidak ditemukan",
			http.StatusNotFound,
		)
	}

	if strings.ToUpper(strings.TrimSpace(inspection.Status)) != "OPEN" {
		return response.Err(
			"INSPECTION_LOCKED",
			"Checklist hanya dapat diubah saat pemeriksaan berstatus OPEN",
			http.StatusConflict,
		)
	}

	// Only allow a date within this monthly inspection.
	if answerDate.Year() != inspection.InspectionMonth.Year() ||
		answerDate.Month() != inspection.InspectionMonth.Month() {
		return response.Err(
			"VALIDATION_ERROR",
			"Tanggal harus berada dalam bulan pemeriksaan",
			http.StatusUnprocessableEntity,
		)
	}

	if err := assertRoomAccess(actor, inspection.RoomID); err != nil {
		return err
	}

	answers := make([]model.ChecklistAnswer, 0, len(in.Items))
	seen := make(map[int64]struct{}, len(in.Items))

	for _, item := range in.Items {
		if item.ChecklistItemID <= 0 {
			return response.Err(
				"VALIDATION_ERROR",
				"Checklist item ID tidak valid",
				http.StatusUnprocessableEntity,
			)
		}

		if _, exists := seen[item.ChecklistItemID]; exists {
			return response.Err(
				"VALIDATION_ERROR",
				fmt.Sprintf("Checklist item %d duplikat", item.ChecklistItemID),
				http.StatusUnprocessableEntity,
			)
		}
		seen[item.ChecklistItemID] = struct{}{}

		var status *string
		if item.Status != nil {
			value := strings.ToUpper(strings.TrimSpace(*item.Status))
			switch value {
			case "":
				status = nil
			case "GOOD":
				good := "GOOD"
				status = &good
			default:
				return response.Err(
					"VALIDATION_ERROR",
					"Status checklist hanya boleh GOOD atau null",
					http.StatusUnprocessableEntity,
				)
			}
		}

		answers = append(answers, model.ChecklistAnswer{
			ChecklistItemID: item.ChecklistItemID,
			AnswerDate:      answerDate,
			Status:          status,
			Notes:           "",
		})
	}

	// This repository method replaces answers for this date only.
	// It must not update inspections.notes.
	return s.Repo.ReplaceChecklistForDate(
		inspectionID,
		answerDate,
		answers,
	)
}

func (s *Service) UpdateInspectionNotes(actor *model.User, inspectionID int64, notes string) error {
	if actor == nil {
		return response.Err(
			"UNAUTHENTICATED",
			"User tidak ditemukan",
			http.StatusUnauthorized,
		)
	}

	if inspectionID <= 0 {
		return response.Err(
			"VALIDATION_ERROR",
			"ID pemeriksaan tidak valid",
			http.StatusUnprocessableEntity,
		)
	}

	inspection, err := s.Repo.GetInspection(inspectionID)
	if err != nil {
		return err
	}
	if inspection == nil {
		return response.Err(
			"NOT_FOUND",
			"Pemeriksaan tidak ditemukan",
			http.StatusNotFound,
		)
	}

	if strings.ToUpper(strings.TrimSpace(inspection.Status)) != "OPEN" {
		return response.Err(
			"INSPECTION_LOCKED",
			"Catatan hanya dapat diubah saat pemeriksaan berstatus OPEN",
			http.StatusConflict,
		)
	}

	if err := assertRoomAccess(actor, inspection.RoomID); err != nil {
		return err
	}

	// Update only the general monthly catatan.
	return s.Repo.UpdateInspectionNotes(
		inspectionID,
		strings.TrimSpace(notes),
	)
}
