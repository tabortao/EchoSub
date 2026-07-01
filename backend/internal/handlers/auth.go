package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// RegisterRequest 注册请求
type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=64"`
	Password string `json:"password" binding:"required,min=6,max=64"`
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Register 用户注册
func Register(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RegisterRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		// 检查用户名是否已存在
		var count int64
		database.DB.Model(&models.User{}).Where("username = ?", req.Username).Count(&count)
		if count > 0 {
			utils.Fail(c, http.StatusConflict, "用户名已存在")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "密码加密失败")
			return
		}
		user := models.User{Username: req.Username, PasswordHash: string(hash)}
		if err := database.DB.Create(&user).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建用户失败: "+err.Error())
			return
		}
		token, err := middleware.GenerateToken(cfg, user.ID, user.Username)
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "生成令牌失败")
			return
		}
		utils.OK(c, gin.H{"token": token, "user": gin.H{"id": user.ID, "username": user.Username}})
	}
}

// Login 用户登录
func Login(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		var user models.User
		err := database.DB.Where("username = ?", req.Username).First(&user).Error
		if err == gorm.ErrRecordNotFound {
			utils.Fail(c, http.StatusUnauthorized, "用户名或密码错误")
			return
		}
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "查询失败")
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
			utils.Fail(c, http.StatusUnauthorized, "用户名或密码错误")
			return
		}
		token, err := middleware.GenerateToken(cfg, user.ID, user.Username)
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "生成令牌失败")
			return
		}
		utils.OK(c, gin.H{"token": token, "user": gin.H{"id": user.ID, "username": user.Username}})
	}
}

// Me 获取当前用户信息
func Me() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var user models.User
		if err := database.DB.First(&user, uid).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "用户不存在")
			return
		}
		utils.OK(c, gin.H{"id": user.ID, "username": user.Username, "created_at": user.CreatedAt})
	}
}
