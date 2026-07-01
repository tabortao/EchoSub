package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"github.com/yaole/EchoSub/backend/internal/config"
)

// JWTClaims JWT 载荷
type JWTClaims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// GenerateToken 生成 JWT
func GenerateToken(cfg *config.Config, userID uint, username string) (string, error) {
	claims := JWTClaims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Duration(cfg.JWT.ExpireHours) * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWT.Secret))
}

// ParseToken 解析 JWT
func ParseToken(cfg *config.Config, tokenString string) (*JWTClaims, error) {
	claims := &JWTClaims{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(cfg.JWT.Secret), nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

// AuthRequired JWT 鉴权中间件
// 优先从 Authorization: Bearer <token> 头读取；为空时回退到 query 参数 ?token=<jwt>，
// 以支持 <video src>/<audio src> 等无法自定义请求头的媒体元素。
func AuthRequired(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := ""
		if auth := c.GetHeader("Authorization"); auth != "" {
			parts := strings.SplitN(auth, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenStr = parts[1]
			}
		}
		if tokenStr == "" {
			if q := c.Query("token"); q != "" {
				tokenStr = q
			}
		}
		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "未提供认证信息"})
			return
		}
		claims, err := ParseToken(cfg, tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "认证无效或已过期"})
			return
		}
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Next()
	}
}

// GetUserID 从上下文获取当前用户 ID
func GetUserID(c *gin.Context) uint {
	if v, ok := c.Get("user_id"); ok {
		if id, ok := v.(uint); ok {
			return id
		}
	}
	return 0
}
