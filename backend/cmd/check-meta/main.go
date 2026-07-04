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

func main() {
	db, err := gorm.Open(sqlite.Open(`d:\Code\Go\EchoSub\test.db`), &gorm.Config{})
	if err != nil {
		log.Fatal(err)
	}
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
}
