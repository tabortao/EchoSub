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

// findNfo 在同目录下查找视频/音频文件的同基名 .nfo（Emby / Kodi 风格 <basename>.nfo）。
// 形如「小猪佩奇.S01E01.Muddy Puddles.nfo」对应「小猪佩奇.S01E01.Muddy Puddles.mp4」。
// 命中后立即返回绝对路径；未找到返回空串。
func (s *Scanner) findNfo(mediaPath string) string {
	dir := filepath.Dir(mediaPath)
	base := strings.TrimSuffix(mediaPath, filepath.Ext(mediaPath))
	baseName := filepath.Base(base)
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
		if ext != ".nfo" {
			continue
		}
		nameBase := strings.TrimSuffix(name, filepath.Ext(name))
		if strings.EqualFold(nameBase, baseName) {
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
	// Emby 缩略图（最优先）：<basename>-thumb.<ext>
	// 形如「小猪佩奇.S01E01.Muddy Puddles-thumb.jpg」对应「小猪佩奇.S01E01.Muddy Puddles.mp4」
	baseName := filepath.Base(base)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if !imgExts[ext] {
			continue
		}
		stripped := strings.TrimSuffix(name, "-thumb"+ext)
		if strings.EqualFold(stripped, baseName) {
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

// Emby / Jellyfin / Kodi 风格的专辑/季元数据文件名（不带扩展名）。
// 优先级：albumCoverNames 列表中下标越小优先级越高（folder > poster > cover > albumart > albumartwork）。
// 同样地，albumBannerNames 中 banner 优先于 backdrop 优先于 fanart。
// 注意：os.ReadDir 顺序不保证文件按字母序返回，所以 scanAlbumMeta 内部会记录所有候选，
// 在循环结束后再按这些列表的优先级选择最终值。
var albumCoverNames = []string{"folder", "poster", "cover", "albumart", "albumartwork"}
var albumBannerNames = []string{"banner", "backdrop", "fanart"}

// pickByPriority 在 candidates 中按 priority 列表的顺序选最优先的（priority[0] 最优先）。
// candidates 是 stem（小写、不带扩展名）到文件名的映射；返回最终选中的文件名。
func pickByPriority(candidates map[string]string, priority []string) string {
	for _, name := range priority {
		if v, ok := candidates[name]; ok {
			return v
		}
	}
	return ""
}

// pickNFOPathByContent 季目录 nfo 路径选择：内容优先。
// 若 first 存在且 plot 非空，返回 first（Emby 标准 season.nfo）；
// 否则回退到 fallback（兼容 Emby 部分刮削后的 tvshow.nfo 冗余文件）。
func pickNFOPathByContent(first, fallback *string) *string {
	if first != nil {
		if data, err := os.ReadFile(*first); err == nil {
			if plot := parseNFOPlot(string(data)); plot != "" {
				return first
			}
		}
	}
	return fallback
}

// scanAlbumMeta 扫描指定目录，识别 Emby 风格元数据（folder.jpg / banner.jpg / season.nfo 等）
// 写入或更新 AlbumMeta 表。subAlbum 为空表示专辑本身，非空表示季。
// 安全：路径必须在 media root 下（防止误识别）。
//
// 增强（v0.4.5）：
//   - 季目录识别 tvshow.nfo（Emby 把整季描述放在这里）
//   - 季目录识别 backdrop.jpg / fanart.jpg 作为横幅
//   - 专辑目录识别 seasonXX-poster.jpg 自动关联到对应季的 cover_path
//
// 修复（v0.4.7）：
//   - 改用 filepath.Rel 校验目录归属，兼容 Windows 反斜杠与配置里的正斜杠。
//     旧实现 `strings.HasPrefix(absDir, root)` 在 Windows 上当 root 来自 yaml（用 `/`）
//     而 absDir 来自 filepath.Abs（用 `\`）时永远为 false，导致所有 Emby 元数据识别全部失效。
func (s *Scanner) scanAlbumMeta(dir string, album string, subAlbum string) {
	if album == "" {
		return
	}
	// 限制在 media root 下：用 filepath.Rel 而非 strings.HasPrefix 校验归属，
	// 避免 Windows 上 root（来自 yaml 用 /）与 absDir（来自 filepath.Abs 用 \）分隔符不一致。
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return
	}
	rootAbs, _ := filepath.Abs(s.cfg.Media.Dir)
	rel, err := filepath.Rel(rootAbs, absDir)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
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
	// seasonXX-poster.<ext>：专辑根目录下的季封面图，关联到对应季
	seasonCovers := make(map[string]string) // seasonXX -> abs path
	// 季目录的 nfo 候选：season.nfo / seasonXX.nfo（Emby 标准） 与 tvshow.nfo（Emby 部分刮削的冗余文件）。
	// ReadDir 顺序不保证文件按字母序返回，因此同时记录所有候选，循环结束后按优先级选择。
	var seasonNFOCandidate, tvshowNFOCandidate *string
	// 封面 / 横幅候选：记录 stem → 文件名，循环结束后按 albumCoverNames / albumBannerNames 优先级选择。
	coverCandidates := make(map[string]string)
	bannerCandidates := make(map[string]string)

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		lower := strings.ToLower(e.Name())
		stem := strings.ToLower(strings.TrimSuffix(lower, filepath.Ext(lower)))
		ext := strings.ToLower(filepath.Ext(lower))
		// 封面候选（专辑和季都识别，folder 优先于 poster 优先于 cover）
		if imgExts[ext] {
			for _, name := range albumCoverNames {
				if stem == name {
					coverCandidates[name] = e.Name()
					break
				}
			}
		}
		// 横幅候选（仅在专辑根目录识别 banner / backdrop / fanart）。
		// 季目录不识别自身的横幅图（Emby 风格：所有季共用专辑根的 banner.jpg），
		// 季的 AlbumMeta.banner_path 保持 nil，由 ServeAlbumBanner 兜底到专辑横幅。
		if subAlbum == "" && imgExts[ext] {
			for _, name := range albumBannerNames {
				if stem == name {
					bannerCandidates[name] = e.Name()
					break
				}
			}
		}
		// 季封面图（仅在专辑根目录识别）：seasonXX-poster.<ext>
		// 把 seasonXX-poster.jpg 等候选放入 seasonCovers[XX]，例如 "02" / "2" / "1" 等。
		// 在写库时再通过候选季目录名列表尝试匹配，匹配成功则关联到对应季。
		if subAlbum == "" && imgExts[ext] && strings.HasSuffix(stem, "-poster") {
			prefix := strings.TrimSuffix(stem, "-poster")
			// 兼容 "season" / "season1" / "season01" / "s01" / "s1"
			num := ""
			switch {
			case strings.HasPrefix(prefix, "season"):
				num = strings.TrimPrefix(prefix, "season")
			case strings.HasPrefix(prefix, "s"):
				num = strings.TrimPrefix(prefix, "s")
			}
			if num != "" {
				// 同时记录两种 key：带前导零 + 去前导零
				seasonCovers[num] = filepath.Join(absDir, e.Name())
				// 去前导零再记录一次（如 "02" → "2"）
				trimmed := strings.TrimLeft(num, "0")
				if trimmed != "" && trimmed != num {
					seasonCovers[trimmed] = filepath.Join(absDir, e.Name())
				}
			}
		}
		// nfo 文件
		if ext == ".nfo" {
			if subAlbum != "" {
				// 季目录：分别记录 season.nfo（Emby 标准，季描述）与 tvshow.nfo（兼容 Emby 部分刮削后的冗余文件）。
				if stem == "tvshow" {
					p := filepath.Join(absDir, e.Name())
					tvshowNFOCandidate = &p
				} else if stem == "season" || strings.HasPrefix(stem, "season") {
					p := filepath.Join(absDir, e.Name())
					seasonNFOCandidate = &p
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

	// 封面 / 横幅最终选择：按 albumCoverNames / albumBannerNames 优先级挑最优先的文件名。
	if name := pickByPriority(coverCandidates, albumCoverNames); name != "" {
		p := filepath.Join(absDir, name)
		coverPath = &p
	}
	if subAlbum == "" {
		if name := pickByPriority(bannerCandidates, albumBannerNames); name != "" {
			p := filepath.Join(absDir, name)
			bannerPath = &p
		}
	}

	// 季目录 nfo 选择：内容优先——若 season.nfo（Emby 标准）解析出非空 plot 则用它，
	// 否则回退到 tvshow.nfo（兼容 Emby 部分刮削后的冗余文件）。
	if subAlbum != "" {
		nfoPath = pickNFOPathByContent(seasonNFOCandidate, tvshowNFOCandidate)
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
		// 用 Select 显式指定要更新的字段，确保 banner_path / nfo_path / cover_path 为 nil 时也会清空旧值
		// （Emby 文件可能被用户删除，需要同步反映到数据库）
		database.DB.Model(&meta).Select("cover_path", "banner_path", "nfo_path", "description").Updates(updates)
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

	// 同步专辑根目录下的 seasonXX-poster.jpg 到对应季的 cover_path
	for num, p := range seasonCovers {
		// 多种季目录命名约定：
		//   "Season 1" / "Season 01" / "season 1" / "season 01" / "Season1" / "season1" / "Season01" / "season01" / "S01" / "s01" / "S1" / "s1"
		candidates := seasonDirCandidates(num)
		matched := ""
		for _, sd := range candidates {
			if _, err := os.Stat(filepath.Join(absDir, sd)); err == nil {
				matched = sd
				break
			}
		}
		if matched != "" {
			upsertSeasonCover(album, matched, p)
		} else {
			// 季目录尚未创建时，预创建 AlbumMeta 记录（让 UI 能展示该季的占位封面）。
			// 统一用规范命名「Season N」（不带前导零），与已有 Season 1 / Season 2 风格一致。
			trimmed := strings.TrimLeft(num, "0")
			if trimmed == "" {
				trimmed = "0"
			}
			expected := "Season " + trimmed
			upsertSeasonCover(album, expected, p)
		}
	}
}

// seasonDirCandidates 返回给定季号 num 的候选季目录名列表。
// 例如 num="02" → ["Season 02","season 02","Season02","season02","Season 2","season 2","Season2","season2","S02","s02","S2","s2","Season 0","season 0"]
// num="2"   → ["Season 2","season 2","Season2","season2","Season 02","season 02","Season02","season02","S2","s2","S02","s02","Season 02","season 02"]
func seasonDirCandidates(num string) []string {
	withZero := num
	noZero := strings.TrimLeft(num, "0")
	if noZero == "" {
		noZero = "0"
	}
	all := []string{withZero, noZero}
	var out []string
	seen := make(map[string]bool)
	add := func(s string) {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for _, n := range all {
		add("Season " + n)
		add("season " + n)
		add("Season" + n)
		add("season" + n)
		add("S" + n)
		add("s" + n)
	}
	return out
}

// upsertSeasonCover 把 seasonXX-poster.jpg 写入对应季的 cover_path。
// 仅在季自身没有封面（meta 不存在或 cover_path 为空）时设置，避免覆盖季根的 folder.jpg（Emby 标准：季根 folder.jpg 优先）。
func upsertSeasonCover(album, subAlbum, coverPath string) {
	var meta models.AlbumMeta
	tx := database.DB.Where("album = ? AND sub_album = ?", album, subAlbum).First(&meta)
	if tx.Error == nil {
		// 季已有封面（通常来自季根的 folder.jpg）→ 跳过，避免被专辑根的 seasonXX-poster 覆盖
		if meta.CoverPath != nil && *meta.CoverPath != "" {
			return
		}
		database.DB.Model(&meta).Update("cover_path", coverPath)
	} else {
		p := coverPath
		database.DB.Create(&models.AlbumMeta{
			Album:     album,
			SubAlbum:  subAlbum,
			CoverPath: &p,
		})
	}
}

// parseNFOPlot 从 nfo 文本中提取 <plot>...</plot> 内容（Kodi 标准）。
// 自动去除 CDATA 包装（Emby 风格常写成 <![CDATA[...]]>）。
// 若无 plot 标签则返回空字符串。
func parseNFOPlot(content string) string {
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
	plot := strings.TrimSpace(content[start : start+end])
	// 去除 CDATA 包装：<![CDATA[ ... ]]>
	if strings.HasPrefix(plot, "<![CDATA[") && strings.HasSuffix(plot, "]]>") {
		plot = strings.TrimSpace(plot[len("<![CDATA[") : len(plot)-len("]]>")])
	}
	return plot
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

	// 单集 nfo（Emby 风格 <basename>.nfo）：用于存储每一集的 plot 描述
	nfoPath := s.findNfo(path)
	var nfoPtr *string
	var description string
	if nfoPath != "" {
		nfoPtr = &nfoPath
		if data, err := os.ReadFile(nfoPath); err == nil {
			description = parseNFOPlot(string(data))
		}
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
			"nfo_path":         nfoPtr,
			"description":      description,
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
			NfoPath:        nfoPtr,
			Description:    description,
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
	// 季内文件入库时，同步扫描专辑根目录的元数据（banner.jpg / folder.jpg / tvshow.nfo），
	// 避免只识别到 Season 1 内的 folder.jpg，而忽略专辑根的横幅 / 封面 / 描述。
	// rootAbs 始终在 media root 之下（filepath.Join + 路径解析），无需额外越界检查。
	if subAlbum != nil && *subAlbum != "" && album != nil {
		rootAbs := filepath.Join(s.cfg.Media.Dir, *album)
		if rootAbs != absDir {
			s.scanAlbumMeta(rootAbs, *album, "")
		}
	}
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
