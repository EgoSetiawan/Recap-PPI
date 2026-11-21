package service

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"testing"

	"PPI/internal/model"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/orientation"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
)

func sampleSignatureDataURL(t *testing.T) string {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, 560, 180))
	for x := 0; x < img.Bounds().Dx(); x++ {
		for y := 0; y < img.Bounds().Dy(); y++ {
			img.Set(x, y, color.White)
		}
	}
	for x := 40; x < 520; x++ {
		img.Set(x, 90+(x%20), color.Black)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode sample signature: %v", err)
	}

	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

func TestSignatureDataURLToPNG(t *testing.T) {
	got, err := signatureDataURLToPNG(sampleSignatureDataURL(t))
	if err != nil {
		t.Fatalf("signatureDataURLToPNG returned an error: %v", err)
	}

	img, format, err := image.Decode(bytes.NewReader(got))
	if err != nil {
		t.Fatalf("decode converted signature: %v", err)
	}
	if format != "png" {
		t.Fatalf("converted signature format = %q, want png", format)
	}

	// The blank margins around the stroke are cropped, so the result no longer
	// has the source dimensions but must still contain the ink.
	minX, minY, maxX, maxY, ok := inkBounds(img)
	if !ok {
		t.Fatal("converted signature has no ink")
	}
	if bounds := img.Bounds(); bounds.Dx() >= 560 || bounds.Dy() >= 180 {
		t.Errorf("expected trimmed size below 560x180, got %dx%d", bounds.Dx(), bounds.Dy())
	}
	if minX < 0 || minY < 0 || maxX >= img.Bounds().Dx() || maxY >= img.Bounds().Dy() {
		t.Errorf("ink outside the converted image")
	}
}

func TestSignatureDataURLToPNGRejectsInvalidInput(t *testing.T) {
	cases := []string{
		"",
		"not-a-data-url",
		"data:image/png;base64,not-base64!",
		"data:image/png;base64," + base64.StdEncoding.EncodeToString([]byte("not an image")),
	}

	for _, dataURL := range cases {
		if _, err := signatureDataURLToPNG(dataURL); err == nil {
			t.Errorf("signatureDataURLToPNG(%q) returned no error", dataURL)
		}
	}
}

func TestSignatureImageColEmbedsImageInPDF(t *testing.T) {
	cfg := config.NewBuilder().
		WithOrientation(orientation.Horizontal).
		WithPageSize(pagesize.A4).
		WithMaxGridSize(36).
		Build()

	m := maroto.New(cfg)
	m.AddRow(
		18,
		signatureImageCol(18, &model.Signature{
			Role:         "ANGGOTA",
			ImageDataURL: sampleSignatureDataURL(t),
		}),
		signatureImageCol(18, nil),
	)

	doc, err := m.Generate()
	if err != nil {
		t.Fatalf("generate pdf: %v", err)
	}

	pdfBytes := doc.GetBytes()
	if !bytes.Contains(pdfBytes, []byte("/Subtype /Image")) {
		t.Fatal("generated pdf does not contain an embedded image")
	}
}

// Builds a data URL for a white bitmap of the given size, with ink painted by
// the callback.
func signatureDataURLWithInk(t *testing.T, width, height int, ink func(*image.RGBA)) string {
	t.Helper()

	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for x := 0; x < width; x++ {
		for y := 0; y < height; y++ {
			img.Set(x, y, color.White)
		}
	}
	ink(img)

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode sample signature: %v", err)
	}

	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

// Returns the bounding box of non-white pixels.
func inkBounds(img image.Image) (minX, minY, maxX, maxY int, ok bool) {
	bounds := img.Bounds()
	minX, minY = bounds.Max.X, bounds.Max.Y
	maxX, maxY = bounds.Min.X-1, bounds.Min.Y-1

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			if a == 0 || (r >= 0xF000 && g >= 0xF000 && b >= 0xF000) {
				continue
			}
			ok = true
			if x < minX {
				minX = x
			}
			if y < minY {
				minY = y
			}
			if x > maxX {
				maxX = x
			}
			if y > maxY {
				maxY = y
			}
		}
	}

	return minX, minY, maxX, maxY, ok
}

func TestSignatureDataURLToPNGCentersInk(t *testing.T) {
	// Ink confined to the left third of a wide canvas, like a person starting
	// to write at the left edge of the pad.
	dataURL := signatureDataURLWithInk(t, 560, 280, func(img *image.RGBA) {
		for x := 60; x < 200; x++ {
			for y := 100; y < 160; y++ {
				img.Set(x, y, color.Black)
			}
		}
	})

	pngBytes, err := signatureDataURLToPNG(dataURL)
	if err != nil {
		t.Fatalf("signatureDataURLToPNG: %v", err)
	}
	img, err := png.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("decode trimmed signature: %v", err)
	}

	minX, minY, maxX, maxY, ok := inkBounds(img)
	if !ok {
		t.Fatal("trimmed signature has no ink")
	}

	bounds := img.Bounds()
	centerX := (float64(minX+maxX) / 2) / float64(bounds.Dx()) * 100
	centerY := (float64(minY+maxY) / 2) / float64(bounds.Dy()) * 100
	if centerX < 45 || centerX > 55 {
		t.Errorf("ink not horizontally centred: %.1f%%", centerX)
	}
	if centerY < 45 || centerY > 55 {
		t.Errorf("ink not vertically centred: %.1f%%", centerY)
	}

	// The crop must have removed the empty right-hand side of the canvas.
	if bounds.Dx() >= 560 {
		t.Errorf("expected a narrower trimmed image, got width %d", bounds.Dx())
	}
}

func TestSignatureDataURLToPNGClampsExtremeAspect(t *testing.T) {
	// Very wide, very short ink: trimming alone would produce an image wider
	// than the report cell.
	dataURL := signatureDataURLWithInk(t, 560, 280, func(img *image.RGBA) {
		for x := 20; x < 540; x++ {
			for y := 138; y < 142; y++ {
				img.Set(x, y, color.Black)
			}
		}
	})

	pngBytes, err := signatureDataURLToPNG(dataURL)
	if err != nil {
		t.Fatalf("signatureDataURLToPNG: %v", err)
	}
	img, err := png.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("decode trimmed signature: %v", err)
	}

	aspect := float64(img.Bounds().Dx()) / float64(img.Bounds().Dy())
	if aspect > 6.05 {
		t.Errorf("aspect %.2f exceeds the printable maximum", aspect)
	}

	minX, _, maxX, _, ok := inkBounds(img)
	if !ok {
		t.Fatal("trimmed signature has no ink")
	}
	centerX := (float64(minX+maxX) / 2) / float64(img.Bounds().Dx()) * 100
	if centerX < 45 || centerX > 55 {
		t.Errorf("ink not horizontally centred: %.1f%%", centerX)
	}
}

func TestSignatureDataURLToPNGKeepsBlankImage(t *testing.T) {
	dataURL := signatureDataURLWithInk(t, 560, 280, func(*image.RGBA) {})

	pngBytes, err := signatureDataURLToPNG(dataURL)
	if err != nil {
		t.Fatalf("signatureDataURLToPNG: %v", err)
	}
	img, err := png.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("decode signature: %v", err)
	}
	if img.Bounds().Dx() != 560 || img.Bounds().Dy() != 280 {
		t.Errorf("blank image should be unchanged, got %dx%d", img.Bounds().Dx(), img.Bounds().Dy())
	}
}
