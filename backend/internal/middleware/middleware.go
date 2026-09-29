package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"PPI/internal/auth"
	"PPI/internal/model"
	"PPI/internal/response"

	"github.com/gin-gonic/gin"
)

type TokenBlacklist interface {
	IsBlacklisted(jti string) (bool, error)
}

type UserLoader interface {
	GetByID(id int64) (*model.User, error)
}

const ContextUserKey = "user"

func CORS(origins []string) gin.HandlerFunc {
	allowAll := len(origins) == 0 || (len(origins) == 1 && origins[0] == "*")
	originSet := map[string]struct{}{}
	for _, o := range origins {
		originSet[o] = struct{}{}
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowAll {
			c.Header("Access-Control-Allow-Origin", "*")
		} else if _, ok := originSet[origin]; ok {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		} else if origin == "" {
			c.Header("Access-Control-Allow-Origin", "*")
		}
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Max-Age", "86400")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func Auth(secret string, bl TokenBlacklist, users UserLoader) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			response.FailCode(c, "UNAUTHORIZED", "Authentication required", http.StatusUnauthorized)
			c.Abort()
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		claims, err := auth.ParseToken(secret, token)
		if err != nil {
			response.FailCode(c, "UNAUTHORIZED", "Authentication required", http.StatusUnauthorized)
			c.Abort()
			return
		}
		if claims.JTI != "" {
			blocked, err := bl.IsBlacklisted(claims.JTI)
			if err != nil {
				response.Fail(c, err)
				c.Abort()
				return
			}
			if blocked {
				response.FailCode(c, "UNAUTHORIZED", "Authentication required", http.StatusUnauthorized)
				c.Abort()
				return
			}
		}
		user, err := users.GetByID(claims.UserID)
		if err != nil || user == nil || user.Status != "ACTIVE" {
			response.FailCode(c, "UNAUTHORIZED", "Authentication required", http.StatusUnauthorized)
			c.Abort()
			return
		}
		if claims.Role != user.Role {
			response.FailCode(c, "UNAUTHORIZED", "Role changed; please login again", http.StatusUnauthorized)
			c.Abort()
			return
		}
		// user.Permissions = auth.PermissionsFor(user.Role)
		c.Set(ContextUserKey, user)
		c.Set("jti", claims.JTI)
		c.Set("token_exp", claims.ExpiresAt.Time)
		c.Next()
	}
}

func CurrentUser(c *gin.Context) *model.User {
	v, ok := c.Get(ContextUserKey)
	if !ok {
		return nil
	}
	u, _ := v.(*model.User)
	return u
}

type rateBucket struct {
	count int
	reset time.Time
}

func LoginRateLimit(max int, window time.Duration) gin.HandlerFunc {
	var mu sync.Mutex
	buckets := map[string]*rateBucket{}
	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()
		mu.Lock()
		b, ok := buckets[ip]
		if !ok || now.After(b.reset) {
			buckets[ip] = &rateBucket{count: 1, reset: now.Add(window)}
			mu.Unlock()
			c.Next()
			return
		}
		if b.count >= max {
			mu.Unlock()
			response.FailCode(c, "RATE_LIMITED", "Terlalu banyak percobaan login", http.StatusTooManyRequests)
			c.Abort()
			return
		}
		b.count++
		mu.Unlock()
		c.Next()
	}
}
