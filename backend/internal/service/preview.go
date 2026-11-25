package service

import (
	"fmt"
	"time"

	"PPI/internal/model"
)

// InspectionPreview is the payload for the HTML report preview.
type InspectionPreview struct {
	ID          int64  `json:"id"`
	Status      string `json:"status"`
	MonthLabel  string `json:"month_label"`
	Year        int    `json:"year"`
	Month       int    `json:"month"`
	DaysInMonth int    `json:"days_in_month"`

	RoomName string `json:"room_name"`
	RoomType string `json:"room_type"`
	Notes    string `json:"notes"`

	KetuaName   string `json:"ketua_name"`
	KetuaNip    string `json:"ketua_nip"`
	AnggotaName string `json:"anggota_name"`

	KetuaSignature   string `json:"ketua_signature,omitempty"`
	AnggotaSignature string `json:"anggota_signature,omitempty"`

	Items   []model.ChecklistItem    `json:"items"`
	Answers map[int]map[int64]string `json:"answers"`
}

// Builds the HTML preview of an inspection report.
func (s *Service) GetInspectionPreview(actor *model.User, id int64) (*InspectionPreview, error) {
	ins, err := s.getInspectionForActor(actor, id)
	if err != nil {
		return nil, err
	}
	if ins == nil || ins.Room == nil {
		return nil, fmt.Errorf("inspection or room not found")
	}

	year := ins.InspectionMonth.Year()
	month := ins.InspectionMonth.Month()
	data, err := s.Repo.GetInspectionPDFChecklist(ins.ID, ins.Room.RoomType, year, month)
	if err != nil {
		return nil, err
	}

	// Labels follow the room's assignments and the collected signatures.
	kepalaSignature, anggotaSignature, err := s.trustedReportSignatures(ins)
	if err != nil {
		return nil, err
	}

	signers, err := s.resolveReportSigners(ins, kepalaSignature, anggotaSignature)
	if err != nil {
		return nil, err
	}

	ketuaImage := ""
	if kepalaSignature != nil {
		ketuaImage = kepalaSignature.ImageDataURL
	}
	anggotaImage := ""
	if anggotaSignature != nil {
		anggotaImage = anggotaSignature.ImageDataURL
	}

	daysInMonth := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()

	return &InspectionPreview{
		ID:               ins.ID,
		Status:           ins.Status,
		MonthLabel:       ins.InspectionMonth.Format("January 2006"),
		Year:             year,
		Month:            int(month),
		DaysInMonth:      daysInMonth,
		RoomName:         ins.Room.Name,
		RoomType:         ins.Room.RoomType,
		Notes:            normalizeNotes(ins.Notes),
		KetuaName:        signers.KepalaName,
		KetuaNip:         signers.KepalaNip,
		AnggotaName:      signers.AnggotaName,
		KetuaSignature:   ketuaImage,
		AnggotaSignature: anggotaImage,
		Items:            data.Items,
		Answers:          data.Answers,
	}, nil
}
