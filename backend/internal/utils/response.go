package utils

import "github.com/gin-gonic/gin"

// Response 统一 API 响应结构
type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// OK 成功响应
func OK(c *gin.Context, data interface{}) {
	c.JSON(200, Response{Code: 0, Message: "ok", Data: data})
}

// Fail 失败响应
func Fail(c *gin.Context, status int, msg string) {
	c.JSON(status, Response{Code: -1, Message: msg})
}
