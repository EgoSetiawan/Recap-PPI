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
