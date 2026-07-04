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

// findCover 在同目录下查找视频/音频文件的封面图（Emby 风格）。
// 优先级：
//  1. <basename>-thumb.jpg/.png/.webp（Emby 视频缩略图命名）
//  2. <basename>.jpg/.png/.webp（Kodi/Jellyfin 命名）
//  3. cover.jpg/cover.png 同目录通用封面（兜底）
func (s *Scanner) findCover(mediaPath string) string {
	dir := filepath.Dir(mediaPath)
	base := strings.TrimSuffix(mediaPath, filepath.Ext(mediaPath))
	imgExts := make(map[string]bool, len(s.cfg.Media.SupportedImages))
	for _, e := range s.cfg.Media.SupportedImages {
		imgExts[strings.ToLower(e)] = true
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}
	// Emby 缩略图（最优先）
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if !imgExts[ext] {
			continue
		}
		// 去掉 -thumb 后再比 basename
		stripped := strings.TrimSuffix(name, "-thumb"+ext)
		if !imgExts[strings.ToLower(filepath.Ext(stripped))] && strings.EqualFold(filepath.Join(dir, stripped), base) {
			return filepath.Join(dir, name)
		}
	}
	// 同名图（Kodi 风格）
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if !imgExts[ext] {
			continue
		}
		nameBase := strings.TrimSuffix(name, ext)
		if strings.EqualFold(filepath.Join(dir, nameBase), base) {
			return filepath.Join(dir, name)
		}
	}
	return ""
}

// Emby / Jellyfin / Kodi 风格的专辑/季元数据文件名（不带扩展名）
var albumCoverNames = []string{"folder", "poster", "cover", "albumart", "albumartwork"}
var albumBannerNames = []string{"banner", "backdrop", "fanart"}

// scanAlbumMeta 扫描指定目录，识别 Emby 风格元数据（folder.jpg / banner.jpg / season.nfo 等）
// 写入或更新 AlbumMeta 表。subAlbum 为空表示专辑本身，非空表示季。
// 安全：路径必须在 media root 下（防止误识别）。
func (s *Scanner) scanAlbumMeta(dir string, album string, subAlbum string) {
	if album == "" {
		return
	}
	// 限制在 media root 下
	root := s.cfg.Media.Dir
	absDir, err := filepath.Abs(dir)
	if err != nil || !strings.HasPrefix(strings.ToLower(absDir), strings.ToLower(root)) {
		return
	}
	entries, err := os.ReadDir(absDir)
	if err != nil {
		return
	}
	imgExts := make(map[string]bool, len(s.cfg.Media.SupportedImages))
	for _, e := range s.cfg.Media.SupportedImages {
		imgExts[strings.ToLower(e)] = true
	}

	var coverPath, bannerPath, nfoPath *string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		lower := strings.ToLower(e.Name())
		stem := strings.ToLower(strings.TrimSuffix(lower, filepath.Ext(lower)))
		ext := strings.ToLower(filepath.Ext(lower))
		// 封面
		if coverPath == nil && imgExts[ext] {
			for _, name := range albumCoverNames {
				if stem == name {
					p := filepath.Join(absDir, e.Name())
					coverPath = &p
					break
				}
			}
		}
		// 横幅
		if bannerPath == nil && imgExts[ext] {
			for _, name := range albumBannerNames {
				if stem == name {
					p := filepath.Join(absDir, e.Name())
					bannerPath = &p
					break
				}
			}
		}
		// nfo 文件
		if nfoPath == nil && ext == ".nfo" {
			// season.nfo 仅作季描述；tvshow.nfo / album.nfo / folder.nfo 任何位置都作专辑/季描述
			if subAlbum != "" {
				// 季目录：识别 season.nfo / seasonXX.nfo
				if stem == "season" || strings.HasPrefix(stem, "season") {
					p := filepath.Join(absDir, e.Name())
					nfoPath = &p
				}
			} else {
				// 专辑目录：识别 tvshow.nfo / album.nfo / folder.nfo
				if stem == "tvshow" || stem == "album" || stem == "folder" || strings.HasPrefix(stem, "tvshow") {
					p := filepath.Join(absDir, e.Name())
					nfoPath = &p
				}
			}
		}
	}

	// 解析 nfo 中的 <plot> 描述（Kodi 格式）
	description := ""
	if nfoPath != nil {
		if data, err := os.ReadFile(*nfoPath); err == nil {
			description = parseNFOPlot(string(data))
		}
	}

	// upsert 到 AlbumMeta（album + sub_album 唯一）
	var meta models.AlbumMeta
	updates := map[string]interface{}{
		"cover_path":  coverPath,
		"banner_path": bannerPath,
		"nfo_path":    nfoPath,
		"description": description,
	}
	tx := database.DB.Where("album = ? AND sub_album = ?", album, subAlbum).First(&meta)
	if tx.Error == nil {
		// 若仅 None 字段也保留为 NULL，避免覆写已有值；这里直接更新（Emby 文件可能消失）
		database.DB.Model(&meta).Updates(updates)
	} else {
		meta = models.AlbumMeta{
			Album:       album,
			SubAlbum:    subAlbum,
			CoverPath:   coverPath,
			BannerPath:  bannerPath,
			NFOPath:     nfoPath,
			Description: description,
		}
		database.DB.Create(&meta)
	}
}

// parseNFOPlot 从 nfo 文本中提取 <plot>...</plot> 内容（Kodi 标准）。
// 若无 plot 标签则返回空字符串。
func parseNFOPlot(content string) string {
	// 简单正则：忽略大小写、首尾空白
	lower := strings.ToLower(content)
	start := strings.Index(lower, "<plot>")
	if start < 0 {
		return ""
	}
	start += len("<plot>")
	end := strings.Index(lower[start:], "</plot>")
	if end < 0 {
		return ""
	}
	return strings.TrimSpace(content[start : start+end])
}

// pruneAlbumMeta 清理 AlbumMeta 中磁盘已不存在的条目（目录被删时调用）。
func (s *Scanner) pruneAlbumMeta(albumSubPairs [][2]string) {
	if len(albumSubPairs) == 0 {
		return
	}
	for _, p := range albumSubPairs {
		database.DB.Where("album = ? AND sub_album = ?", p[0], p[1]).Delete(&models.AlbumMeta{})
	}
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

	// 识别该目录的 Emby / Kodi 风格元数据并写入 AlbumMeta
	absDir := filepath.Join(s.cfg.Media.Dir, dir)
	s.scanAlbumMeta(absDir, getOrEmpty(album), getOrEmpty(subAlbum))
	return nil
}

// getOrEmpty 安全取 *string，未设置时返回空串。
func getOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return *p
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
			// 收集被删目录下所有 (album, sub_album) 组合，删除对应 AlbumMeta
			type asp struct {
				Album    string
				SubAlbum string
			}
			var pairs []asp
			database.DB.Model(&models.MediaFile{}).
				Select("album, sub_album").
				Where("path LIKE ? AND album IS NOT NULL", prefix+"%").
				Group("album, sub_album").
				Scan(&pairs)
			res := database.DB.Where("path LIKE ?", prefix+"%").Delete(&models.MediaFile{})
			if res.RowsAffected > 0 {
				log.Printf("[INFO] 增量删除目录 %s: 软删除 %d 条媒体记录", event.Name, res.RowsAffected)
			}
			// 删除该目录及其子目录对应的 AlbumMeta
			for _, p := range pairs {
				if p.Album == "" {
					continue
				}
				database.DB.Where("album = ? AND sub_album = ?", p.Album, p.SubAlbum).Delete(&models.AlbumMeta{})
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
