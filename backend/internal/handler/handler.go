package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"PPI/internal/middleware"
	"PPI/internal/model"
	"PPI/internal/response"
	"PPI/internal/service"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	Svc *service.Service
}

type ReplaceChecklistForDateRequest struct {
	AnswerDate string                  `json:"answer_date"`
	Items      []model.ChecklistAnswer `json:"items"`
}

func New(svc *service.Service) *Handler {
	return &Handler{Svc: svc}
}

func parseID(c *gin.Context, name string) (int64, error) {
	return strconv.ParseInt(c.Param(name), 10, 64)
}

func (h *Handler) Health(c *gin.Context) {
	response.OK(c, gin.H{"status": "ok", "mode": "gin", "time": time.Now().UTC()}, "OK")
}

func (h *Handler) Login(c *gin.Context) {
	var in service.LoginInput
	if err := c.ShouldBindJSON(&in); err != nil {
		response.FailCode(c, "INVALID_JSON", "Invalid JSON", http.StatusBadRequest)
		return
	}
	data, err := h.Svc.Login(in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.OK(c, data, "Login berhasil")
}

func (h *Handler) Logout(c *gin.Context) {
	jti, _ := c.Get("jti")
	exp, _ := c.Get("token_exp")
	jtiStr, _ := jti.(string)
	expTime, _ := exp.(time.Time)
	if expTime.IsZero() {
		expTime = time.Now().Add(24 * time.Hour)
	}
	_ = h.Svc.Logout(jtiStr, expTime)
	response.OK(c, nil, "Logout berhasil")
}

func (h *Handler) Me(c *gin.Context) {
	response.OK(c, h.Svc.Me(middleware.CurrentUser(c)), "Profile retrieved")
}

func (h *Handler) CreateInspection(c *gin.Context) {
	var in service.CreateInspectionInput
	if err := c.ShouldBindJSON(&in); err != nil {
		response.FailCode(
			c,
			"INVALID_JSON",
			"Invalid JSON",
			http.StatusBadRequest,
		)
		return
	}
	ins, err := h.Svc.CreateInspection(
		middleware.CurrentUser(c),
		in,
	)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.Created(c, ins, "Inspection created")
}

func (h *Handler) GetInspection(c *gin.Context) {
	id, _ := parseID(c, "id")
	ins, err := h.Svc.GetInspection(middleware.CurrentUser(c), id)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.OK(c, ins, "Inspection retrieved")
}

func (h *Handler) ListInspections(c *gin.Context) {
	var roomID *int64
	if v := c.Query("room_id"); v != "" {
		id, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			response.FailCode(
				c,
				"INVALID_ROOM_ID",
				"Invalid room_id",
				http.StatusBadRequest,
			)
			return
		}
		roomID = &id
	}
	var month *time.Time
	if v := c.Query("month"); v != "" {
		t, err := time.Parse("2006-01-02", v)
		if err != nil {
			response.FailCode(
				c,
				"INVALID_MONTH",
				"Invalid month format, use YYYY-MM-DD",
				http.StatusBadRequest,
			)
			return
		}
		month = &t
	}
	list, err := h.Svc.ListInspections(
		middleware.CurrentUser(c),
		roomID,
		c.Query("status"),
		month,
	)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.OK(c, list, "Inspections retrieved")
}

func (h *Handler) Dashboard(c *gin.Context) {
	data, err := h.Svc.Dashboard(middleware.CurrentUser(c))
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.OK(c, data, "Dashboard retrieved")
}

func (h *Handler) CreatePDFReport(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		response.FailCode(
			c,
			"VALIDATION_ERROR",
			"ID pemeriksaan tidak valid",
			http.StatusBadRequest,
		)
		return
	}

	pdfBytes, filename, err := h.Svc.CreateMonthlyInspectionPDF(
		middleware.CurrentUser(c), id,
	)
	if err != nil {
		return
	}
	c.Header(
		"Content-Disposition",
		fmt.Sprintf(`attachment; filename="%s"`, filename),
	)
	c.Data(
		http.StatusOK,
		"application/pdf",
		pdfBytes,
	)
}

func (h *Handler) DeleteInspection(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil {
		response.FailCode(c, "VALIDATION_ERROR", "Invalid id", http.StatusUnprocessableEntity)
		return
	}
	if err := h.Svc.DeleteInspection(middleware.CurrentUser(c), id); err != nil {
		response.Fail(c, err)
		return
	}
	response.OK(c, nil, "Inspections deleted")
}

func (h *Handler) ListChecklist(c *gin.Context) {
	list, err := h.Svc.ListChecklist(c.Query("room_type"))
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.OK(c, list, "Checklist items retrieved")
}

func (h *Handler) ListRooms(c *gin.Context) {
	list, err := h.Svc.ListRoomsWithActors(middleware.CurrentUser(c), c.Query("q"))
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.OK(c, list, "Rooms retrieved")
}

func (h *Handler) CreateChecklist(c *gin.Context) {
	var in model.ChecklistItem
	if err := c.ShouldBindJSON(&in); err != nil {
		response.FailCode(c, "INVALID_JSON", "Invalid JSON", http.StatusBadRequest)
		return
	}
	created, err := h.Svc.CreateChecklist(middleware.CurrentUser(c), &in)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.Created(c, created, "Checklist item created")
}

func (h *Handler) ReplaceChecklistForDate(c *gin.Context) {
	id, err := parseID(c, "id")
	if err != nil || id <= 0 {
		response.FailCode(
			c,
			"VALIDATION_ERROR",
			"Invalid inspection ID",
			http.StatusBadRequest,
		)
		return
	}
	var in ReplaceChecklistForDateRequest
	if err := c.ShouldBindJSON(&in); err != nil {
		response.FailCode(
			c,
			"INVALID_JSON",
			"Invalid request body",
			http.StatusBadRequest,
		)
		return
	}
	// Parse the date in YYYY-MM-DD format.
	answerDate, err := time.Parse(
		"2006-01-02",
		strings.TrimSpace(in.AnswerDate),
	)
	if err != nil {
		response.FailCode(
			c,
			"VALIDATION_ERROR",
			"Answer date must use YYYY-MM-DD format",
			http.StatusBadRequest,
		)
		return
	}
	// Require the items field, but an explicit empty array is allowed.
	if in.Items == nil {
		response.FailCode(
			c,
			"VALIDATION_ERROR",
			"Items field is required",
			http.StatusBadRequest,
		)
		return
	}
	err = h.Svc.ReplaceChecklistForDate(
		id,
		answerDate,
		in.Items,
	)
	if err != nil {
		response.Fail(c, err)
		return
	}
	response.OK(
		c,
		gin.H{
			"inspection_id": id,
			"answer_date":   answerDate.Format("2006-01-02"),
		},
		"Checklist answers updated",
	)
}
