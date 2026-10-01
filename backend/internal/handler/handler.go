package handler

import (
	"net/http"
	"strconv"
	"time"

	"PPI/internal/middleware"
	"PPI/internal/response"
	"PPI/internal/service"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	Svc *service.Service
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
	data, err := h.Svc.Login(in, c.ClientIP())
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
