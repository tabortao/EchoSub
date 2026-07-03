package database

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/models"
)

var DB *gorm.DB

// Init 初始化数据库连接并执行迁移
func Init(cfg *config.Config) error {
	// 确保数据库目录存在
	if dir := filepath.Dir(cfg.Database.Path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("创建数据库目录失败: %w", err)
		}
	}

	db, err := gorm.Open(sqlite.Open(cfg.Database.Path), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return fmt.Errorf("打开数据库失败: %w", err)
	}

	// SQLite 性能优化
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1) // SQLite 单写
	sqlDB.SetMaxIdleConns(1)
	if _, err := sqlDB.Exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;"); err != nil {
		log.Printf("[WARN] 设置 SQLite pragma 失败: %v", err)
	}

	if err := db.AutoMigrate(
		&models.User{},
		&models.MediaFile{},
		&models.Tag{},
		&models.PlayRecord{},
		&models.SentenceProgress{},
		&models.Setting{},
		&models.StudyNote{},
		&models.MediaRemark{},
	); err != nil {
		return fmt.Errorf("数据库迁移失败: %w", err)
	}

	DB = db
	log.Println("[INFO] 数据库初始化完成")
	return nil
}
