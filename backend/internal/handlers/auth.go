package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/middleware"
	"github.com/yaole/EchoSub/backend/internal/models"
	"github.com/yaole/EchoSub/backend/internal/utils"
)

// 用户名规则：3-64 字符，仅允许字母、数字、下划线
var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,64}$`)

// RegisterRequest 注册请求
type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// ChangePasswordRequest 修改密码请求
type ChangePasswordRequest struct {
	OldPassword string `json:"old_password" binding:"required"`
	NewPassword string `json:"new_password" binding:"required"`
}

// UpdateProfileRequest 修改用户名请求
type UpdateProfileRequest struct {
	Username string `json:"username" binding:"required"`
}

// validateUsername 校验用户名格式：3-64 字符，仅字母/数字/下划线
func validateUsername(username string) error {
	if !usernameRegex.MatchString(username) {
		return fmt.Errorf("用户名需 3-64 字符，仅允许字母、数字、下划线")
	}
	return nil
}

// validatePassword 校验密码强度：8-64 字符，至少包含一个字母和一个数字
func validatePassword(password string) error {
	if len(password) < 8 || len(password) > 64 {
		return fmt.Errorf("密码需 8-64 字符")
	}
	hasLetter := false
	hasDigit := false
	for _, ch := range password {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') {
			hasLetter = true
		}
		if ch >= '0' && ch <= '9' {
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return fmt.Errorf("密码需同时包含字母和数字")
	}
	return nil
}

// Register 用户注册
func Register(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RegisterRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		// 用户名格式校验
		if err := validateUsername(req.Username); err != nil {
			utils.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		// 密码强度校验（仅注册时强制，不影响已注册用户）
		if err := validatePassword(req.Password); err != nil {
			utils.Fail(c, http.StatusBadRequest, err.Error())
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
		utils.OK(c, gin.H{"token": token, "user": userToJSON(user)})
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
		utils.OK(c, gin.H{"token": token, "user": userToJSON(user)})
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
		utils.OK(c, userToJSON(user))
	}
}

// ChangePassword 修改密码（需验证旧密码，新密码须满足强度要求）
func ChangePassword() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var req ChangePasswordRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		var user models.User
		if err := database.DB.First(&user, uid).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "用户不存在")
			return
		}
		// 校验旧密码
		if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)) != nil {
			utils.Fail(c, http.StatusUnauthorized, "旧密码错误")
			return
		}
		// 新密码不能与旧密码相同
		if req.OldPassword == req.NewPassword {
			utils.Fail(c, http.StatusBadRequest, "新密码不能与旧密码相同")
			return
		}
		// 新密码强度校验
		if err := validatePassword(req.NewPassword); err != nil {
			utils.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			utils.Fail(c, http.StatusInternalServerError, "密码加密失败")
			return
		}
		user.PasswordHash = string(hash)
		if err := database.DB.Save(&user).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "保存失败")
			return
		}
		utils.OK(c, gin.H{"message": "密码已修改"})
	}
}

// UpdateProfile 修改用户名（需校验格式与唯一性）
func UpdateProfile() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var req UpdateProfileRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			utils.Fail(c, http.StatusBadRequest, "参数错误: "+err.Error())
			return
		}
		if err := validateUsername(req.Username); err != nil {
			utils.Fail(c, http.StatusBadRequest, err.Error())
			return
		}
		// 检查用户名是否已被他人占用
		var count int64
		database.DB.Model(&models.User{}).Where("username = ? AND id != ?", req.Username, uid).Count(&count)
		if count > 0 {
			utils.Fail(c, http.StatusConflict, "用户名已被占用")
			return
		}
		var user models.User
		if err := database.DB.First(&user, uid).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "用户不存在")
			return
		}
		oldName := user.Username
		user.Username = req.Username
		if err := database.DB.Save(&user).Error; err != nil {
			utils.Fail(c, http.StatusInternalServerError, "保存失败")
			return
		}
		utils.OK(c, gin.H{"user": userToJSON(user), "old_username": oldName})
	}
}

// avatarsDir 返回头像存储根目录（与数据库同级的 data/avatars/）
func avatarsDir(cfg *config.Config) string {
	return filepath.Join(filepath.Dir(cfg.Database.Path), "avatars")
}

// UploadAvatar 上传用户头像（单图，覆盖旧头像）
func UploadAvatar(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		file, err := c.FormFile("file")
		if err != nil {
			utils.Fail(c, http.StatusBadRequest, "请上传头像文件")
			return
		}
		// 校验文件类型
		ext := strings.ToLower(filepath.Ext(file.Filename))
		allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".webp": true, ".gif": true}
		if !allowed[ext] {
			utils.Fail(c, http.StatusBadRequest, "仅支持 jpg/png/webp/gif 格式")
			return
		}
		// 校验文件大小（最大 2MB）
		if file.Size > 2*1024*1024 {
			utils.Fail(c, http.StatusBadRequest, "头像文件不能超过 2MB")
			return
		}
		// 存储目录
		dir := filepath.Join(avatarsDir(cfg), strconv.FormatUint(uint64(uid), 10))
		if err := os.MkdirAll(dir, 0755); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "创建目录失败")
			return
		}
		// 删除旧头像文件
		var user models.User
		if err := database.DB.First(&user, uid).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "用户不存在")
			return
		}
		if user.AvatarPath != nil {
			oldFullPath := filepath.Join(filepath.Dir(cfg.Database.Path), *user.AvatarPath)
			_ = os.Remove(oldFullPath)
		}
		// 保存新头像
		filename := "avatar" + ext
		fullPath := filepath.Join(dir, filename)
		if err := c.SaveUploadedFile(file, fullPath); err != nil {
			utils.Fail(c, http.StatusInternalServerError, "保存头像失败: "+err.Error())
			return
		}
		// 相对路径存入 DB（相对于数据库所在目录）
		relPath := filepath.Join("avatars", strconv.FormatUint(uint64(uid), 10), filename)
		user.AvatarPath = &relPath
		database.DB.Save(&user)
		utils.OK(c, gin.H{"user": userToJSON(user)})
	}
}

// ServeAvatar 返回当前登录用户的头像文件
func ServeAvatar(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := middleware.GetUserID(c)
		var user models.User
		if err := database.DB.First(&user, uid).Error; err != nil {
			utils.Fail(c, http.StatusNotFound, "用户不存在")
			return
		}
		if user.AvatarPath == nil || *user.AvatarPath == "" {
			utils.Fail(c, http.StatusNotFound, "未设置头像")
			return
		}
		fullPath := filepath.Join(filepath.Dir(cfg.Database.Path), *user.AvatarPath)
		if _, err := os.Stat(fullPath); err != nil {
			utils.Fail(c, http.StatusNotFound, "头像文件不存在")
			return
		}
		// 设置 Content-Type（在 c.File 之前设置才能生效）
		ext := strings.ToLower(filepath.Ext(fullPath))
		switch ext {
		case ".jpg", ".jpeg":
			c.Header("Content-Type", "image/jpeg")
		case ".png":
			c.Header("Content-Type", "image/png")
		case ".webp":
			c.Header("Content-Type", "image/webp")
		case ".gif":
			c.Header("Content-Type", "image/gif")
		}
		c.File(fullPath)
	}
}

// userToJSON 将用户转为 JSON 响应（含头像路径）
func userToJSON(user models.User) gin.H {
	return gin.H{
		"id":          user.ID,
		"username":    user.Username,
		"avatar_path": user.AvatarPath,
		"created_at":  user.CreatedAt,
	}
}
