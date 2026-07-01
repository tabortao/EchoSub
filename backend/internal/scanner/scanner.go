package scanner

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"

	"github.com/yaole/EchoSub/backend/internal/config"
	"github.com/yaole/EchoSub/backend/internal/database"
	"github.com/yaole/EchoSub/backend/internal/models"
)

// Scanner 媒体目录扫描器
type Scanner struct {
	cfg     *config.Config
	watcher *fsnotify.Watcher
	mu      sync.Mutex
	running bool
	scanning bool
}

// New 创建扫描器
func New(cfg *config.Config) *Scanner {
	return &Scanner{cfg: cfg}
}

// IsMediaFile 判断是否为受支持的媒体文件，返回 (是否媒体, 类型video/audio, 扩展名)
func (s *Scanner) IsMediaFile(name string) (bool, string, string) {
	ext := strings.ToLower(filepath.Ext(name))
	for _, e := range s.cfg.Media.SupportedVideo {
		if ext == e {
			return true, "video", ext
		}
	}
	for _, e := range s.cfg.Media.SupportedAudio {
		if ext == e {
			return true, "audio", ext
		}
	}
	return false, "", ""
}

// findSubtitle 在同目录下查找同名 srt/vtt 字幕
func (s *Scanner) findSubtitle(mediaPath string) string {
	dir := filepath.Dir(mediaPath)
	base := strings.TrimSuffix(mediaPath, filepath.Ext(mediaPath))
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".srt" && ext != ".vtt" {
			continue
		}
		// 同名（不含扩展名）
		nameBase := strings.TrimSuffix(name, filepath.Ext(name))
		if strings.EqualFold(filepath.Join(dir, nameBase), base) {
			return filepath.Join(dir, name)
		}
	}
	return ""
}

// ScanFull 全量扫描媒体目录并入库
func (s *Scanner) ScanFull() error {
	s.mu.Lock()
	if s.scanning {
		s.mu.Unlock()
		return nil
	}
	s.scanning = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		s.scanning = false
		s.mu.Unlock()
	}()

	start := time.Now()
	count := 0
	root := s.cfg.Media.Dir
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // 跳过无法访问的项
		}
		if info.IsDir() {
			return nil
		}
		ok, mediaType, _ := s.IsMediaFile(info.Name())
		if !ok {
			return nil
		}
		if err := s.upsertMedia(path, info, mediaType); err != nil {
			log.Printf("[WARN] 入库失败 %s: %v", path, err)
		} else {
			count++
		}
		return nil
	})
	if err != nil {
		return err
	}
	log.Printf("[INFO] 扫描完成: %d 个媒体文件, 耗时 %s", count, time.Since(start))
	return nil
}

// upsertMedia 新增或更新媒体记录
func (s *Scanner) upsertMedia(path string, info os.FileInfo, mediaType string) error {
	rel, _ := filepath.Rel(s.cfg.Media.Dir, path)
	dir := filepath.Dir(rel)
	var album *string
	if dir != "." && dir != "" {
		// 取相对路径第一级作为专辑名
		parts := strings.SplitN(filepath.ToSlash(dir), "/", 2)
		a := parts[0]
		album = &a
	}

	var existing models.MediaFile
	result := database.DB.Where("path = ?", path).First(&existing)

	subPath := s.findSubtitle(path)
	var subPtr *string
	if subPath != "" {
		subPtr = &subPath
	}

	if result.Error == nil {
		// 已存在，更新必要字段
		updates := map[string]interface{}{
			"name":             info.Name(),
			"file_size":        info.Size(),
			"file_modified_at": info.ModTime(),
			"subtitle_path":    subPtr,
		}
		return database.DB.Model(&existing).Updates(updates).Error
	}

	media := models.MediaFile{
		Path:           path,
		Name:           info.Name(),
		Type:           mediaType,
		Album:          album,
		FileSize:       info.Size(),
		FileModifiedAt: info.ModTime(),
		SubtitlePath:   subPtr,
	}
	return database.DB.Create(&media).Error
}

// StartWatcher 启动文件系统监控
func (s *Scanner) StartWatcher() error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}
	s.watcher = w

	// 递归添加目录监控
	err = filepath.Walk(s.cfg.Media.Dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			if e := w.Add(path); e != nil {
				log.Printf("[WARN] 监控目录失败 %s: %v", path, e)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}

	go s.watchLoop()
	s.running = true
	log.Println("[INFO] 媒体目录监控已启动")
	return nil
}

func (s *Scanner) watchLoop() {
	for {
		select {
		case event, ok := <-s.watcher.Events:
			if !ok {
				return
			}
			s.handleEvent(event)
		case err, ok := <-s.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("[WARN] watcher 错误: %v", err)
		}
	}
}

func (s *Scanner) handleEvent(event fsnotify.Event) {
	// 新建目录时加入监控
	if event.Op&fsnotify.Create != 0 {
		if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
			_ = s.watcher.Add(event.Name)
			return
		}
	}
	// 处理文件创建/写入完成
	if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Rename) != 0 {
		ok, mediaType, _ := s.IsMediaFile(event.Name)
		if !ok {
			return
		}
		info, err := os.Stat(event.Name)
		if err != nil {
			return
		}
		if err := s.upsertMedia(event.Name, info, mediaType); err != nil {
			log.Printf("[WARN] 增量入库失败 %s: %v", event.Name, err)
		} else {
			log.Printf("[INFO] 增量入库: %s", event.Name)
		}
	}
	if event.Op&fsnotify.Remove != 0 {
		// 从数据库软删除
		database.DB.Where("path = ?", event.Name).Delete(&models.MediaFile{})
	}
}

// IsScanning 是否正在扫描
func (s *Scanner) IsScanning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.scanning
}

// Stop 停止监控
func (s *Scanner) Stop() {
	if s.watcher != nil {
		_ = s.watcher.Close()
	}
}
