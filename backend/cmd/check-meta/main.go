package main

import (
	"fmt"
	"log"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

type AlbumMeta struct {
	ID          uint   `gorm:"primaryKey"`
	Album       string
	SubAlbum    string
	CoverPath   *string
	BannerPath  *string
	NFOPath     *string
	Description string
}

type MediaFile struct {
	ID          uint
	Path        string
	Name        string
	Album       *string
	SubAlbum    *string
	NFOPath     *string
	Description string
	Duration    float64
}

type PlayRecord struct {
	ID           uint
	UserID       uint
	MediaID      uint
	PlayCount    int
	LastPosition float64
	LastPlayedAt string
}

func main() {
	db, err := gorm.Open(sqlite.Open(`D:/Code/Go/EchoSub/backend/data/echosub.db`), &gorm.Config{})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("=== AlbumMeta ===")
	var rows []AlbumMeta
	db.Find(&rows)
	for _, r := range rows {
		sub := r.SubAlbum
		if sub == "" {
			sub = "(album root)"
		}
		cover := "(nil)"
		if r.CoverPath != nil {
			cover = *r.CoverPath
		}
		banner := "(nil)"
		if r.BannerPath != nil {
			banner = *r.BannerPath
		}
		fmt.Printf("[%s / %s]\n  cover: %s\n  banner: %s\n  desc: %s\n\n", r.Album, sub, cover, banner, r.Description)
	}

	fmt.Println("=== PlayRecord (recent) ===")
	var prs []PlayRecord
	db.Order("last_played_at DESC").Limit(20).Find(&prs)
	for _, p := range prs {
		fmt.Printf("  uid=%d mid=%d play=%d pos=%.1f at=%s\n", p.UserID, p.MediaID, p.PlayCount, p.LastPosition, p.LastPlayedAt)
	}
}
