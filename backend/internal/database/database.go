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
		&models.AlbumMeta{},
		&models.AlbumPin{},
		&models.EntityTag{},
		// 本地词典（v0.9.1）
		&models.LocalDictionary{},
		&models.DictEntry{},
	); err != nil {
		return fmt.Errorf("数据库迁移失败: %w", err)
	}

	// 本地词典级联删除：词典被删时自动删其下词条（v0.9.1）
	// SQLite 默认不强制外键；显式开启 + 添加级联约束。
	if sqlDB, err := db.DB(); err == nil {
		if _, err := sqlDB.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
			log.Printf("[WARN] 启用外键约束失败: %v", err)
		}
	} else {
		log.Printf("[WARN] 获取 sqlDB 失败: %v", err)
	}
	// 手动添加 ON DELETE CASCADE 触发器（GORM AutoMigrate 不会为已有外键添加级联）
	if err := db.Exec(`
		CREATE TRIGGER IF NOT EXISTS trg_dict_entries_cascade_delete
		AFTER DELETE ON local_dictionaries
		FOR EACH ROW
		BEGIN
			DELETE FROM dict_entries WHERE dict_id = OLD.id;
		END;
	`).Error; err != nil {
		log.Printf("[WARN] 创建词典级联删除触发器失败: %v", err)
	}

	DB = db
	log.Println("[INFO] 数据库初始化完成")
	return nil
}
