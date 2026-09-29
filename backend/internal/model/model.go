package model

import "time"

type Role struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type User struct {
	ID              int64     `json:"id"`
	Name            string    `json:"name"`
	Email           string    `json:"email"`
	Title           string    `json:"title"`
	PasswordHash    string    `json:"-"`
	RoleID          int64     `json:"role_id"`
	Role            string    `json:"role"`
	Status          string    `json:"status"`
	AssignedRoomIDs []int64   `json:"assigned_room_ids"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Room struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Code        string    `json:"code"`
	RoomType    string    `json:"room_type"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type ChecklistItem struct {
	ID          int64     `json:"id"`
	RoomType    string    `json:"room_type"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsRequired  bool      `json:"is_required"`
	OrderNumber int       `json:"order_number"`
	CreatedAt   time.Time `json:"created_at,omitempty"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
}

type ChecklistAnswer struct {
	ID              int64     `json:"id,omitempty"`
	InspectionID    int64     `json:"inspection_id,omitempty"`
	ChecklistItemID int64     `json:"checklist_item_id"`
	AnswerDate      time.Time `json:"answer_date"`
	Status          *string   `json:"status"`
	Notes           string    `json:"notes"`
}

type Signature struct {
	ID           int64     `json:"id"`
	InspectionID int64     `json:"inspection_id"`
	SignerUserID *int64    `json:"signer_user_id,omitempty"`
	Role         string    `json:"role"`
	Method       string    `json:"method"`
	SignerName   string    `json:"signer_name"`
	SignerTitle  string    `json:"signer_title"`
	ImageDataURL string    `json:"image_data_url"`
	SignedAt     time.Time `json:"signed_at"`
}

type Inspection struct {
	ID              int64             `json:"id"`
	RoomID          int64             `json:"room_id"`
	InspectorID     int64             `json:"inspector_id"`
	InspectionMonth time.Time         `json:"inspection_month"`
	Notes           string            `json:"notes"`
	Status          string            `json:"status"`
	Checklist       []ChecklistAnswer `json:"checklist"`
	Signatures      []Signature       `json:"signatures,omitempty"`
	Room            *Room             `json:"room,omitempty"`
	CreatedAt       time.Time         `json:"created_at"`
	UpdatedAt       time.Time         `json:"updated_at"`
}
