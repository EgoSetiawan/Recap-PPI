package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Envelope struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	Error   *APIError   `json:"error,omitempty"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type AppError struct {
	Code       string
	Message    string
	HTTPStatus int
}

func (e *AppError) Error() string {
	return e.Message
}

func Err(code, message string, status int) *AppError {
	return &AppError{Code: code, Message: message, HTTPStatus: status}
}

func OK(c *gin.Context, data interface{}, message string) {
	c.JSON(http.StatusOK, Envelope{Success: true, Data: data, Message: message})
}

func Created(c *gin.Context, data interface{}, message string) {
	c.JSON(http.StatusCreated, Envelope{Success: true, Data: data, Message: message})
}

func Fail(c *gin.Context, err error) {
	if ae, ok := err.(*AppError); ok {
		c.JSON(ae.HTTPStatus, Envelope{
			Success: false,
			Error: &APIError{
				Code:    ae.Code,
				Message: ae.Message,
			},
		})
		return
	}

	c.JSON(http.StatusInternalServerError, Envelope{
		Success: false,
		Error: &APIError{
			Code:    "INTERNAL_ERROR",
			Message: err.Error(),
		},
	})
}

func FailCode(c *gin.Context, code, message string, status int) {
	c.JSON(status, Envelope{
		Success: false,
		Error:   &APIError{Code: code, Message: message},
	})
}
