package service

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestValidSignatureImage(t *testing.T) {
	if !validSignatureImage(sampleSignatureDataURL(t)) {
		t.Fatal("valid PNG signature was rejected")
	}

	invalid := []string{
		"",
		"data:image/png;base64," + strings.Repeat("A", 100),
		"not-a-data-url",
	}

	for _, value := range invalid {
		if validSignatureImage(value) {
			t.Errorf("invalid signature was accepted: %q", value)
		}
	}
}

func TestBuildInspectionChecklistValidatesRoomItems(t *testing.T) {
	month := time.Date(2035, time.January, 1, 0, 0, 0, 0, time.UTC)
	days := []SaveInspectionDateInput{
		{
			AnswerDate: "2035-01-02",
			Items: []ChecklistItemInput{
				{ChecklistItemID: 99},
			},
		},
	}

	if _, err := buildInspectionChecklist(days, month, map[int64]struct{}{1: {}}); err == nil {
		t.Fatal("checklist item outside the room type was accepted")
	}

	answers, err := buildInspectionChecklist(days, month, map[int64]struct{}{99: {}})
	if err != nil {
		t.Fatalf("allowed checklist item was rejected: %v", err)
	}
	if len(answers) != 1 || answers[0].ChecklistItemID != 99 {
		t.Fatalf("unexpected answers: %+v", answers)
	}
}

func TestIsInspectionRoomMonthConflict(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "old constraint",
			err: &pgconn.PgError{
				Code:           "23505",
				ConstraintName: "inspections_room_id_inspection_month_key",
			},
			want: true,
		},
		{
			name: "active partial index",
			err: &pgconn.PgError{
				Code:           "23505",
				ConstraintName: "inspections_active_room_month_idx",
			},
			want: true,
		},
		{
			name: "other constraint",
			err: &pgconn.PgError{
				Code:           "23505",
				ConstraintName: "rooms_code_key",
			},
			want: false,
		},
		{
			name: "not a pg error",
			err:  modelError("plain error"),
			want: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isInspectionRoomMonthConflict(tc.err); got != tc.want {
				t.Fatalf("isInspectionRoomMonthConflict() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestInspectionExistsError(t *testing.T) {
	err := inspectionExistsError(
		"Pav. Krisan",
		time.Date(2035, time.November, 1, 0, 0, 0, 0, time.UTC),
	)

	if err.Code != "INSPECTION_EXISTS" {
		t.Fatalf("code = %q", err.Code)
	}
	if err.HTTPStatus != http.StatusConflict {
		t.Fatalf("status = %d", err.HTTPStatus)
	}
	if !strings.Contains(err.Message, "Pav. Krisan") ||
		!strings.Contains(err.Message, "November 2035") {
		t.Fatalf("message = %q", err.Message)
	}
}

type modelError string

func (e modelError) Error() string { return string(e) }
