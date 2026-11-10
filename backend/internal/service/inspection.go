package service

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	"PPI/internal/auth"
	"PPI/internal/model"
	"PPI/internal/repository"
	"PPI/internal/response"

	"github.com/jackc/pgx/v5/pgconn"
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

type SaveInspectionBulkInput struct {
	Days []SaveInspectionDateInput `json:"days" binding:"required,min=1,dive"`
}

type CreateInspectionInput struct {
	RoomID          int64                     `json:"room_id" binding:"required,gt=0"`
	InspectionMonth time.Time                 `json:"inspection_month" binding:"required"`
	Notes           string                    `json:"notes"`
	Days            []SaveInspectionDateInput `json:"days" binding:"required,min=1"`
	// optional
	Signature *SignaturePayload `json:"signature" binding:"required"`
}

type SubmitInspectionInput struct {
	Signature *SignaturePayload `json:"signature" binding:"required"`
}

type ApproveInspectionInput struct {
	Signature *SignaturePayload `json:"signature" binding:"required"`
}

type SaveChecklistInput struct {
	AnswerDate time.Time               `json:"answer_date"`
	Items      []model.ChecklistAnswer `json:"items"`
}

const maxSignatureDataURLBytes = 2 << 20 // 2 MiB

func validSignatureImage(url string) bool {
	u := strings.TrimSpace(url)
	if len(u) < 80 || len(u) > maxSignatureDataURLBytes {
		return false
	}
	if !strings.HasPrefix(u, "data:image/") {
		return false
	}

	// Decode the image so malformed data URLs cannot be persisted.
	_, err := signatureDataURLToPNG(u)
	return err == nil
}

func findSignatureByRole(signatures []model.Signature, role string) *model.Signature {
	for i := range signatures {
		if signatures[i].Role == role {
			return &signatures[i]
		}
	}

	return nil
}

func buildInspectionChecklist(days []SaveInspectionDateInput, month time.Time, allowedItems map[int64]struct{}) ([]model.ChecklistAnswer, error) {
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

			if _, ok := allowedItems[item.ChecklistItemID]; !ok {
				return nil, response.Err(
					"VALIDATION_ERROR",
					fmt.Sprintf(
						"Checklist item %d tidak tersedia untuk tipe ruangan ini",
						item.ChecklistItemID,
					),
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

func (s *Service) allowedChecklistItems(roomType string) (map[int64]struct{}, error) {
	items, err := s.Repo.ListChecklist(roomType)
	if err != nil {
		return nil, err
	}

	allowed := make(map[int64]struct{}, len(items))
	for _, item := range items {
		allowed[item.ID] = struct{}{}
	}

	return allowed, nil
}

func (s *Service) AddKepalaRuanganSignature(actor *model.User, id int64, imageDataURL string) (*model.Signature, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsKepala(actor.Role) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya kepala yang bisa tanda tangan",
			http.StatusForbidden,
		)
	}

	ins, err := s.getInspectionForActor(actor, id)
	if err != nil {
		return nil, err
	}

	// The kepala only signs the review stage, after the petugas submitted.
	status := strings.ToUpper(strings.TrimSpace(ins.Status))

	if status == StatusApproved {
		return nil, response.Err(
			"INVALID_STATUS",
			"Pemeriksaan sudah disetujui",
			http.StatusConflict,
		)
	}

	if status != StatusSubmitted {
		return nil, response.Err(
			"INVALID_STATUS",
			"Tanda tangan kepala ruangan hanya dapat dilakukan setelah pemeriksaan dikirim",
			http.StatusConflict,
		)
	}

	// A kepala signature is only meaningful once the petugas signed.
	if findSignatureByRole(ins.Signatures, "ANGGOTA") == nil {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanda tangan petugas pemeriksa belum tersedia",
			http.StatusUnprocessableEntity,
		)
	}

	imageDataURL = strings.TrimSpace(imageDataURL)
	if !validSignatureImage(imageDataURL) {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanda tangan tidak valid",
			http.StatusUnprocessableEntity,
		)
	}
	uid := actor.ID
	title := strings.TrimSpace(actor.Title)
	if title == "" {
		title = auth.DefaultTitle(actor.Role)
	}

	sig := &model.Signature{
		InspectionID: id,
		SignerUserID: &uid,
		Role:         "KEPALA",
		Method:       "draw",
		SignerName:   actor.Name,
		SignerTitle:  title,
		ImageDataURL: imageDataURL,
		SignedAt:     time.Now().UTC(),
	}

	// Persist the signature so it can be shown and used for approval.
	if err := s.Repo.UpsertSignature(sig); err != nil {
		return nil, err
	}

	return sig, nil
}

// ApproveInspection marks a submitted inspection as approved.
// Kepala PPI (and Super Admin, as oversight) can approve, and only
// after both the petugas and the kepala signatures are stored.
func (s *Service) ApproveInspection(actor *model.User, id int64) (*model.Inspection, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsKepala(actor.Role) && !auth.IsAdmin(actor.Role) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya kepala PPI yang dapat menyetujui pemeriksaan",
			http.StatusForbidden,
		)
	}

	if id <= 0 {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"ID pemeriksaan tidak valid",
			http.StatusUnprocessableEntity,
		)
	}

	ins, err := s.getInspectionForActor(actor, id)
	if err != nil {
		return nil, err
	}

	status := strings.ToUpper(strings.TrimSpace(ins.Status))

	if status == StatusApproved {
		return nil, response.Err(
			"INVALID_STATUS",
			"Pemeriksaan sudah disetujui",
			http.StatusConflict,
		)
	}

	if status != StatusSubmitted {
		return nil, response.Err(
			"INVALID_STATUS",
			"Pemeriksaan hanya dapat disetujui setelah dikirim oleh petugas",
			http.StatusConflict,
		)
	}

	if findSignatureByRole(ins.Signatures, "ANGGOTA") == nil {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanda tangan petugas pemeriksa belum tersedia",
			http.StatusUnprocessableEntity,
		)
	}

	if findSignatureByRole(ins.Signatures, "KEPALA") == nil {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanda tangan kepala ruangan belum tersedia",
			http.StatusUnprocessableEntity,
		)
	}

	if err := s.Repo.ApproveInspection(ins.ID); err != nil {
		return nil, err
	}

	return s.Repo.GetInspection(ins.ID)
}

func (s *Service) AddAnggotaSignature(actor *model.User, imageDataURL string, id int64) (*model.Signature, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsAnggota(actor.Role) && !auth.IsAdmin(actor.Role) && !auth.IsKepala(actor.Role) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya pengguna yang berwenang yang dapat menandatangani sebagai petugas pemeriksa",
			http.StatusForbidden,
		)
	}

	// Check that the inspection exists and the actor can access it.
	ins, err := s.getInspectionForActor(actor, id)
	if err != nil {
		return nil, err
	}
	if ins == nil {
		return nil, response.Err(
			"NOT_FOUND",
			"Pemeriksaan tidak ditemukan",
			http.StatusNotFound,
		)
	}
	// Only the assigned inspector may sign as Anggota.
	if ins.InspectorID != actor.ID {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa yang ditugaskan dapat menandatangani",
			http.StatusForbidden,
		)
	}

	status := strings.ToUpper(strings.TrimSpace(ins.Status))

	// Drafts can be signed (and re-signed). A SUBMITTED inspection may
	// still receive a missing petugas signature so older records that
	// were sent without one can be completed. Final records are locked.
	if status != StatusOpen && status != StatusSubmitted {
		return nil, response.Err(
			"INVALID_STATUS",
			"Tanda tangan hanya dapat disimpan selama pemeriksaan belum disetujui",
			http.StatusConflict,
		)
	}

	if status == StatusSubmitted && findSignatureByRole(ins.Signatures, "ANGGOTA") != nil {
		return nil, response.Err(
			"INVALID_STATUS",
			"Tanda tangan petugas sudah tersimpan",
			http.StatusConflict,
		)
	}

	imageDataURL = strings.TrimSpace(imageDataURL)
	if !validSignatureImage(imageDataURL) {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanda tangan tidak valid atau kosong",
			http.StatusUnprocessableEntity,
		)
	}
	uid := actor.ID
	title := strings.TrimSpace(actor.Title)
	if title == "" {
		title = auth.DefaultTitle(actor.Role)
	}
	sig := &model.Signature{
		InspectionID: id,
		SignerUserID: &uid,
		Role:         "ANGGOTA",
		Method:       "draw",
		SignerName:   actor.Name,
		SignerTitle:  title,
		ImageDataURL: imageDataURL,
		SignedAt:     time.Now().UTC(),
	}
	// Insert or update the Anggota signature.
	if err := s.Repo.UpsertSignature(sig); err != nil {
		return nil, err
	}

	return sig, nil
}

func (s *Service) CreateInspection(actor *model.User, in CreateInspectionInput) (*model.Inspection, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsAnggota(actor.Role) && !auth.IsAdmin(actor.Role) && !auth.IsKepala(actor.Role) {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya pengguna yang berwenang yang dapat membuat pemeriksaan",
			http.StatusForbidden,
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

	// One active inspection is allowed per room and month.
	existing, err := s.Repo.GetInspectionByRoomMonth(room.ID, month)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, inspectionExistsError(room.Name, month)
	}

	// Convert all dates and items from the request into checklist answers.
	allowedItems, err := s.allowedChecklistItems(room.RoomType)
	if err != nil {
		return nil, err
	}
	checklist, err := buildInspectionChecklist(in.Days, month, allowedItems)
	if err != nil {
		return nil, err
	}

	//added for optional
	signatures := []model.Signature{}

	if in.Signature != nil {
		imageDataURL := strings.TrimSpace(in.Signature.ImageDataURL)

		if !validSignatureImage(imageDataURL) {
			return nil, response.Err(
				"VALIDATION_ERROR",
				"Tanda tangan tidak valid",
				http.StatusUnprocessableEntity,
			)
		}
		uid := actor.ID
		title := strings.TrimSpace(actor.Title)
		if title == "" {
			title = auth.DefaultTitle(actor.Role)
		}

		signatures = append(signatures, model.Signature{
			SignerUserID: &uid,
			Role:         "ANGGOTA",
			Method:       "draw",
			SignerName:   actor.Name,
			SignerTitle:  title,
			ImageDataURL: imageDataURL,
			SignedAt:     time.Now().UTC(),
		})
	}

	ins := &model.Inspection{
		RoomID:          room.ID,
		InspectorID:     actor.ID,
		InspectionMonth: month,
		Notes:           strings.TrimSpace(in.Notes),
		Status:          StatusOpen,
		Checklist:       checklist,
		Signatures:      signatures,
	}
	// Create the monthly inspection once.
	if err := s.Repo.CreateInspectionFull(ins); err != nil {
		if isInspectionRoomMonthConflict(err) {
			return nil, inspectionExistsError(room.Name, month)
		}
		return nil, err
	}
	return s.Repo.GetInspection(ins.ID)
}

// inspectionExistsError builds the shared conflict response for a room/month
// that is already occupied by an active inspection.
func inspectionExistsError(roomName string, month time.Time) *response.AppError {
	return response.Err(
		"INSPECTION_EXISTS",
		fmt.Sprintf(
			"Pemeriksaan untuk ruangan %s pada %s sudah ada. Buka menu Pemeriksaan untuk melihat data tersebut atau pilih bulan lain.",
			roomName,
			month.Format("January 2006"),
		),
		http.StatusConflict,
	)
}

// isInspectionRoomMonthConflict detects the unique violation from either the
// original constraint or the active-row partial index.
func isInspectionRoomMonthConflict(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return false
	}

	return pgErr.ConstraintName == "inspections_room_id_inspection_month_key" ||
		pgErr.ConstraintName == "inspections_active_room_month_idx"
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

func (s *Service) DeleteInspection(actor *model.User, id int64, ipAddress string) error {
	if actor == nil {
		return response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsKepala(actor.Role) && !auth.IsAdmin(actor.Role) {
		return response.Err(
			"FORBIDDEN",
			"Hanya kepala atau admin yang dapat menghapus pemeriksaan",
			http.StatusForbidden,
		)
	}

	if id <= 0 {
		return response.Err(
			"VALIDATION_ERROR",
			"ID pemeriksaan tidak valid",
			http.StatusUnprocessableEntity,
		)
	}

	ins, err := s.Repo.GetInspection(id)
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

	if strings.EqualFold(strings.TrimSpace(ins.Status), StatusApproved) {
		return response.Err(
			"INSPECTION_LOCKED",
			"Pemeriksaan yang sudah disetujui tidak dapat dihapus",
			http.StatusConflict,
		)
	}

	err = s.Repo.SoftDeleteInspection(id)
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

	roomName := fmt.Sprintf("Ruangan #%d", ins.RoomID)
	if ins.Room != nil && strings.TrimSpace(ins.Room.Name) != "" {
		roomName = ins.Room.Name
	}

	s.recordAudit(
		actor,
		"DELETE_INSPECTION",
		"inspection",
		id,
		map[string]interface{}{
			"id":               ins.ID,
			"room_id":          ins.RoomID,
			"room_name":        roomName,
			"inspection_month": ins.InspectionMonth.Format("2006-01-02"),
			"status":           ins.Status,
			"notes":            ins.Notes,
		},
		nil,
		ipAddress,
	)

	return nil
}

func (s *Service) ReplaceChecklistForDate(actor *model.User, inspectionID int64, answerDate time.Time, items []model.ChecklistAnswer) error {
	if actor == nil {
		return response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsAnggota(actor.Role) && !auth.IsAdmin(actor.Role) && !auth.IsKepala(actor.Role) {
		return response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa, kepala, atau admin yang dapat mengubah checklist",
			http.StatusForbidden,
		)
	}

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

	// Only the assigned inspector or an admin may change answers.
	if !auth.IsKepala(actor.Role) && !auth.IsAdmin(actor.Role) && ins.InspectorID != actor.ID {
		return response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa yang ditugaskan yang dapat mengubah checklist",
			http.StatusForbidden,
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
	roomType := ""
	if ins.Room != nil {
		roomType = ins.Room.RoomType
	}
	allowedItems, err := s.allowedChecklistItems(roomType)
	if err != nil {
		return err
	}
	seen := make(map[int64]struct{}, len(items))
	for _, item := range items {
		if item.ChecklistItemID <= 0 {
			return response.Err(
				"VALIDATION_ERROR",
				"Invalid checklist item ID",
				http.StatusUnprocessableEntity,
			)
		}
		if _, ok := allowedItems[item.ChecklistItemID]; !ok {
			return response.Err(
				"VALIDATION_ERROR",
				fmt.Sprintf(
					"Checklist item %d tidak tersedia untuk tipe ruangan ini",
					item.ChecklistItemID,
				),
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

	if !auth.IsAnggota(actor.Role) && !auth.IsAdmin(actor.Role) && !auth.IsKepala(actor.Role) {
		return response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa, kepala, atau admin yang dapat mengubah checklist",
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

	if !auth.IsKepala(actor.Role) && !auth.IsAdmin(actor.Role) && inspection.InspectorID != actor.ID {
		return response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa yang ditugaskan yang dapat mengubah checklist",
			http.StatusForbidden,
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

	roomType := ""
	if inspection.Room != nil {
		roomType = inspection.Room.RoomType
	}
	allowedItems, err := s.allowedChecklistItems(roomType)
	if err != nil {
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

		if _, ok := allowedItems[item.ChecklistItemID]; !ok {
			return response.Err(
				"VALIDATION_ERROR",
				fmt.Sprintf(
					"Checklist item %d tidak tersedia untuk tipe ruangan ini",
					item.ChecklistItemID,
				),
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

// SaveInspectionDates replaces the checklist answers for several dates in one
// request. All dates are validated before anything is written.
func (s *Service) SaveInspectionDates(actor *model.User, inspectionID int64, in SaveInspectionBulkInput) error {
	if actor == nil {
		return response.Err(
			"UNAUTHORIZED",
			"Unauthorized",
			http.StatusUnauthorized,
		)
	}

	if len(in.Days) == 0 {
		return response.Err(
			"VALIDATION_ERROR",
			"Minimal satu tanggal pemeriksaan wajib diisi",
			http.StatusUnprocessableEntity,
		)
	}

	if !auth.IsAnggota(actor.Role) && !auth.IsAdmin(actor.Role) && !auth.IsKepala(actor.Role) {
		return response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa, kepala, atau admin yang dapat mengubah checklist",
			http.StatusForbidden,
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

	if !auth.IsKepala(actor.Role) && !auth.IsAdmin(actor.Role) && inspection.InspectorID != actor.ID {
		return response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa yang ditugaskan yang dapat mengubah checklist",
			http.StatusForbidden,
		)
	}

	if strings.ToUpper(strings.TrimSpace(inspection.Status)) != StatusOpen {
		return response.Err(
			"INSPECTION_LOCKED",
			"Checklist hanya dapat diubah saat pemeriksaan berstatus OPEN",
			http.StatusConflict,
		)
	}

	if err := assertRoomAccess(actor, inspection.RoomID); err != nil {
		return err
	}

	roomType := ""
	if inspection.Room != nil {
		roomType = inspection.Room.RoomType
	}
	allowedItems, err := s.allowedChecklistItems(roomType)
	if err != nil {
		return err
	}

	answers, err := buildInspectionChecklist(in.Days, inspection.InspectionMonth, allowedItems)
	if err != nil {
		return err
	}

	grouped := make(map[string][]model.ChecklistAnswer)
	for _, answer := range answers {
		key := answer.AnswerDate.Format("2006-01-02")
		grouped[key] = append(grouped[key], answer)
	}

	dates := make([]string, 0, len(grouped))
	for key := range grouped {
		dates = append(dates, key)
	}
	sort.Strings(dates)

	for _, key := range dates {
		answerDate, err := time.Parse("2006-01-02", key)
		if err != nil {
			return response.Err(
				"VALIDATION_ERROR",
				"Tanggal checklist tidak valid: "+key,
				http.StatusUnprocessableEntity,
			)
		}
		if err := s.Repo.ReplaceChecklistForDate(
			inspectionID,
			answerDate,
			grouped[key],
		); err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) UpdateInspectionNotes(actor *model.User, inspectionID int64, notes string) error {
	if actor == nil {
		return response.Err(
			"UNAUTHENTICATED",
			"User tidak ditemukan",
			http.StatusUnauthorized,
		)
	}

	if !auth.IsAnggota(actor.Role) && !auth.IsAdmin(actor.Role) && !auth.IsKepala(actor.Role) {
		return response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa, kepala, atau admin yang dapat mengubah catatan",
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

	if !auth.IsKepala(actor.Role) && !auth.IsAdmin(actor.Role) && inspection.InspectorID != actor.ID {
		return response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa yang ditugaskan yang dapat mengubah catatan",
			http.StatusForbidden,
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

func (s *Service) SubmitInspections(actor *model.User, id int64) (*model.Inspection, error) {
	if actor == nil {
		return nil, response.Err(
			"UNAUTHENTICATED",
			"User tidak ditemukan",
			http.StatusUnauthorized,
		)
	}

	if id <= 0 {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"ID pemeriksaan tidak valid",
			http.StatusUnprocessableEntity,
		)
	}

	ins, err := s.getInspectionForActor(actor, id)
	if err != nil {
		return nil, err
	}
	if ins == nil {
		return nil, response.Err(
			"NOT_FOUND",
			"Pemeriksaan tidak ditemukan",
			http.StatusNotFound,
		)
	}
	// Only the assigned inspector can submit.
	if ins.InspectorID != actor.ID {
		return nil, response.Err(
			"FORBIDDEN",
			"Hanya petugas pemeriksa yang ditugaskan dapat mengirim pemeriksaan",
			http.StatusForbidden,
		)
	}
	// Only OPEN inspections can be submitted.
	if ins.Status != StatusOpen {
		return nil, response.Err(
			"INVALID_STATUS",
			"Pemeriksaan hanya dapat dikirim ketika berstatus OPEN",
			http.StatusConflict,
		)
	}
	// Get the previously saved Anggota signature.
	sign := findSignatureByRole(ins.Signatures, "ANGGOTA")

	// Check whether a signature exists.
	if sign == nil {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanda tangan Anggota wajib diisi sebelum pemeriksaan dikirim",
			http.StatusUnprocessableEntity,
		)
	}

	// Ensure the signature belongs to the assigned inspector.
	if sign.SignerUserID == nil || *sign.SignerUserID != actor.ID {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanda tangan tidak sesuai dengan petugas pemeriksa",
			http.StatusUnprocessableEntity,
		)
	}

	// Validate the previously saved signature image.
	if !validSignatureImage(sign.ImageDataURL) {
		return nil, response.Err(
			"VALIDATION_ERROR",
			"Tanda tangan tidak valid atau kosong",
			http.StatusUnprocessableEntity,
		)
	}

	// Update inspection status through repository.
	if err := s.Repo.SubmitInspection(actor, sign); err != nil {
		return nil, err
	}

	// Return updated inspection.
	return s.Repo.GetInspection(id)
}
