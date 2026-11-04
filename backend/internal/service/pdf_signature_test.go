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
	if bounds := img.Bounds(); bounds.Dx() != 560 || bounds.Dy() != 180 {
		t.Fatalf("converted signature size = %dx%d, want 560x180", bounds.Dx(), bounds.Dy())
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
