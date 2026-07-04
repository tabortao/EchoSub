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

// findCover 在同目录下查找同名图片作为封面（.jpg/.jpeg/.png/.webp）
func (s *Scanner) findCover(mediaPath string) string {
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
		matched := false
		for _, img := range s.cfg.Media.SupportedImages {
			if ext == img {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
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

	// 收集本次扫描时磁盘上存在的所有媒体文件路径，用于事后比对清理孤儿记录
	diskPaths := make(map[string]struct{})

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
		diskPaths[path] = struct{}{}
		return nil
	})
	if err != nil {
		return err
	}

	// 清理孤儿记录：磁盘已删除但数据库仍存在的 MediaFile（软删除）
	// 适用场景：服务停机期间用户删除了文件/目录，watcher 未捕获事件
	pruned := s.pruneOrphans(diskPaths)

	log.Printf("[INFO] 扫描完成: %d 个媒体文件, 清理 %d 条孤儿记录, 耗时 %s", count, pruned, time.Since(start))
	return nil
}

// pruneOrphans 软删除数据库中存在但 diskPaths 集合中不存在的媒体记录。
// diskPaths 为空时（例如根目录扫描失败）跳过清理，避免误删。
func (s *Scanner) pruneOrphans(diskPaths map[string]struct{}) int64 {
	if len(diskPaths) == 0 {
		return 0
	}
	var orphans []string
	// 查所有未软删除的媒体 path
	database.DB.Model(&models.MediaFile{}).Where("deleted_at IS NULL").Pluck("path", &orphans)
	var deleted int64
	for _, p := range orphans {
		if _, ok := diskPaths[p]; !ok {
			res := database.DB.Where("path = ?", p).Delete(&models.MediaFile{})
			deleted += res.RowsAffected
		}
	}
	return deleted
}

// upsertMedia 新增或更新媒体记录
func (s *Scanner) upsertMedia(path string, info os.FileInfo, mediaType string) error {
	rel, _ := filepath.Rel(s.cfg.Media.Dir, path)
	dir := filepath.Dir(rel)
	var album *string
	var subAlbum *string
	if dir != "." && dir != "" {
		// 取相对路径第一级作为专辑名，第二级作为子专辑
		parts := strings.SplitN(filepath.ToSlash(dir), "/", 2)
		a := parts[0]
		album = &a
		if len(parts) > 1 && parts[1] != "" {
			sa := parts[1]
			subAlbum = &sa
		}
	}

	var existing models.MediaFile
	result := database.DB.Where("path = ?", path).First(&existing)

	subPath := s.findSubtitle(path)
	var subPtr *string
	if subPath != "" {
		subPtr = &subPath
	}

	coverPath := s.findCover(path)
	var coverPtr *string
	if coverPath != "" {
		coverPtr = &coverPath
	}

	var savedID uint
	if result.Error == nil {
		// 已存在，更新必要字段
		updates := map[string]interface{}{
			"name":             info.Name(),
			"file_size":        info.Size(),
			"file_modified_at": info.ModTime(),
			"subtitle_path":    subPtr,
			"cover_path":       coverPtr,
			"album":            album,
			"sub_album":        subAlbum,
		}
		if err := database.DB.Model(&existing).Updates(updates).Error; err != nil {
			return err
		}
		savedID = existing.ID
	} else {
		media := models.MediaFile{
			Path:           path,
			Name:           info.Name(),
			Type:           mediaType,
			Album:          album,
			SubAlbum:       subAlbum,
			FileSize:       info.Size(),
			FileModifiedAt: info.ModTime(),
			SubtitlePath:   subPtr,
			CoverPath:      coverPtr,
		}
		if err := database.DB.Create(&media).Error; err != nil {
			return err
		}
		savedID = media.ID
	}

	// 重新维护与同名（仅扩展名不同）、同目录、另一种类型媒体文件的配对关系。
	s.linkPairedMedia(savedID, mediaType, dir, info.Name())
	return nil
}

// linkPairedMedia 维护 MediaFile 的同目录同名配对关系。
// 规则：同目录 + 去扩展名同基名 + 媒体类型不同（video↔audio）的两条记录视为配对。
// 仅在 video 上写 paired_media_id 指向 audio；audio 上保持 NULL，便于列表 SQL 直接过滤被配对项。
// savedID：刚 upsert 的记录 ID；mediaType：video/audio；name：文件名（含扩展名）。
func (s *Scanner) linkPairedMedia(savedID uint, mediaType, _ string, name string) {
	base := strings.TrimSuffix(name, filepath.Ext(name))

	// 取当前媒体所在绝对目录，作为配对的硬性约束（同名可能在多目录出现）
	var current models.MediaFile
	if err := database.DB.First(&current, savedID).Error; err != nil {
		return
	}
	currentDir := filepath.Dir(current.Path)

	// 找同基名 + 不同类型 的所有未删除记录
	var peers []models.MediaFile
	if err := database.DB.Where("name LIKE ? AND type <> ? AND deleted_at IS NULL", base+".%", mediaType).
		Find(&peers).Error; err != nil || len(peers) == 0 {
		// 没有候选 → 若是 video 则清空其配对；若是 audio 则把引用它的 video 配对清空
		if mediaType == "video" {
			database.DB.Model(&models.MediaFile{}).Where("id = ?", savedID).Update("paired_media_id", nil)
		} else {
			database.DB.Model(&models.MediaFile{}).Where("paired_media_id = ?", savedID).Update("paired_media_id", nil)
		}
		return
	}

	// 过滤：同目录 + 去扩展名同基名 + 类型互补
	var videoPeer, audioPeer *models.MediaFile
	for i := range peers {
		if !strings.EqualFold(filepath.Dir(peers[i].Path), currentDir) {
			continue
		}
		if !strings.EqualFold(strings.TrimSuffix(peers[i].Name, filepath.Ext(peers[i].Name)), base) {
			continue
		}
		switch peers[i].Type {
		case "video":
			videoPeer = &peers[i]
		case "audio":
			audioPeer = &peers[i]
		}
	}

	if mediaType == "video" {
		if audioPeer != nil {
			database.DB.Model(&models.MediaFile{}).Where("id = ?", savedID).Update("paired_media_id", audioPeer.ID)
		} else {
			database.DB.Model(&models.MediaFile{}).Where("id = ?", savedID).Update("paired_media_id", nil)
		}
	} else {
		// 当前是 audio：找互补 video 并将其 paired_media_id 指向当前
		if videoPeer != nil {
			database.DB.Model(&models.MediaFile{}).Where("id = ?", videoPeer.ID).Update("paired_media_id", savedID)
		}
		// 若 videoPeer 不存在，无需操作（audio 保持 NULL，独立展示）
	}
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
		// 判断是被删的是目录还是文件：
		// - 目录：fsnotify 删整目录时通常只发目录本身的 Remove，目录内文件的 Remove 不会触发，
		//   因此需要批量软删除该目录下所有 MediaFile（path LIKE 'dir/%'），避免孤儿记录。
		// - 文件：直接按 path 精确软删除。
		// 由于 Remove 事件发生时 os.Stat 已无法获取信息，这里用「路径是否匹配媒体扩展名」来辅助判断：
		// 路径有媒体扩展名视为文件删除；否则视为目录删除，做前缀批量清理。
		isFile, _, _ := s.IsMediaFile(event.Name)
		if isFile {
			// 先清理引用关系：若有 video.paired_media_id 指向此文件则置空，避免列表展示死链
			database.DB.Model(&models.MediaFile{}).
				Where("paired_media_id IN (SELECT id FROM media_files WHERE path = ?)", event.Name).
				Update("paired_media_id", nil)
			database.DB.Where("path = ?", event.Name).Delete(&models.MediaFile{})
			log.Printf("[INFO] 增量删除文件: %s", event.Name)
		} else {
			// 目录被删除：前缀匹配该目录下所有媒体记录
			prefix := event.Name + string(os.PathSeparator)
			// 先把目录内所有 video 记录的配对置空（被配对的 audio 也会一并删除，无需单独处理）
			database.DB.Model(&models.MediaFile{}).
				Where("path LIKE ? AND paired_media_id IS NOT NULL", prefix+"%").
				Update("paired_media_id", nil)
			res := database.DB.Where("path LIKE ?", prefix+"%").Delete(&models.MediaFile{})
			if res.RowsAffected > 0 {
				log.Printf("[INFO] 增量删除目录 %s: 软删除 %d 条媒体记录", event.Name, res.RowsAffected)
			}
			// 同时尝试从 watcher 移除（目录已不存在，Add/Remove 都会失败，忽略即可）
		}
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
