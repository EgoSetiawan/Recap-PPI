package service

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/jpeg"
	"image/png"
	"log"
	"math"
	"net/http"
	"strings"
	"time"

	"PPI/internal/model"
	"PPI/internal/response"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/col"
	marotoimage "github.com/johnfercher/maroto/v2/pkg/components/image"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/border"
	"github.com/johnfercher/maroto/v2/pkg/consts/extension"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/consts/orientation"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/core/entity"
	"github.com/johnfercher/maroto/v2/pkg/fontrepository"
	"github.com/johnfercher/maroto/v2/pkg/props"
	_ "golang.org/x/image/webp"
)

func loadFonts() ([]entity.CustomFont, error) {
	customFonts, err := fontrepository.New().
		AddUTF8Font(
			"MaterialSymbols",
			fontstyle.Normal,
			"fonts/MaterialSymbolsOutlined-Regular.ttf",
		).
		AddUTF8Font(
			"MaterialSymbols",
			fontstyle.Bold,
			"fonts/MaterialSymbolsOutlined-Bold.ttf",
		).
		Load()

	if err != nil {
		return nil, fmt.Errorf("failed to load Noto Sans: %w", err)
	}

	return customFonts, nil
}

func (s *Service) CreateMonthlyInspectionPDF(actor *model.User, id int64) ([]byte, string, error) {
	ins, err := s.getInspectionForActor(actor, id)
	if err != nil {
		return nil, "", err
	}
	if ins == nil || ins.Room == nil {
		return nil, "", fmt.Errorf("inspection or room not found")
	}
	// Draft preview only; PDF export is blocked.
	if ins.Status == StatusDraft {
		return nil, "", response.Err(
			"INVALID_STATUS",
			"Pemeriksaan masih berstatus draft; gunakan pratinjau untuk melihat laporan",
			http.StatusForbidden,
		)
	}
	year := ins.InspectionMonth.Year()
	month := ins.InspectionMonth.Month()
	pdfData, err := s.Repo.GetInspectionPDFChecklist(
		ins.ID,
		ins.Room.RoomType,
		year,
		month,
	)
	if err != nil {
		return nil, "", err
	}

	customFonts, err := loadFonts()
	if err != nil {
		fmt.Println("FONT ERROR:", err)
		return nil, "", err
	}

	fmt.Println("FONT LOADED")

	cfg := config.NewBuilder().
		WithOrientation(orientation.Horizontal).
		WithPageSize(pagesize.A4).
		WithMaxGridSize(36).
		WithLeftMargin(6).
		WithRightMargin(6).
		WithTopMargin(6).
		WithBottomMargin(6).
		WithCustomFonts(customFonts).
		Build()

	m := maroto.New(cfg)
	// HEADER
	m.AddRow(
		8,
		text.NewCol(
			36,
			"LAPORAN KINERJA IPCLN PPI",
			props.Text{
				Size:  14,
				Style: fontstyle.Bold,
				Align: align.Center,
			},
		),
	)

	m.AddRow(
		7,
		text.NewCol(
			36,
			"RSU Dr. H. Koesnadi Bondowoso",
			props.Text{
				Size:  13,
				Style: fontstyle.Bold,
				Align: align.Center,
			},
		),
	)

	m.AddRow(3, text.NewCol(36, "", props.Text{Size: 1}))

	m.AddRow(
		5,
		text.NewCol(
			2,
			"Bulan",
			props.Text{
				Size: 9,
			},
		),
		text.NewCol(
			10,
			": "+ins.InspectionMonth.Format("January 2006"),
			props.Text{
				Size: 9,
			},
		),
	)

	m.AddRow(
		5,
		text.NewCol(
			2,
			"Ruangan",
			props.Text{
				Size: 9,
			},
		),
		text.NewCol(
			10,
			": "+ins.Room.Name,
			props.Text{
				Size: 9,
			},
		),
	)
	m.AddRow(4, text.NewCol(12, "", props.Text{Size: 1}))
	m.AddRow(
		6,
		text.NewCol(
			12,
			"HASIL PEMERIKSAAN",
			props.Text{
				Size:  10,
				Style: fontstyle.Bold,
				Align: align.Left,
			},
		),
	)
	// MONTH MATRIX
	addMonthlyChecklistMatrix(
		m,
		year,
		month,
		pdfData.Items,
		pdfData.Answers,
	)
	// Spacing for notes.
	m.AddRow(
		6,
		text.NewCol(18, "", props.Text{Size: 1}),
		text.NewCol(18, "", props.Text{Size: 1}),
	)
	// NOTES
	m.AddRow(
		5,
		text.NewCol(
			12,
			"CATATAN",
			props.Text{
				Size:  10,
				Style: fontstyle.Bold,
			},
		),
	)

	// One incident per line inside a single box, each line starting with a
	// dash: only the first and last entries carry the outer borders, the
	// sides stay open between entries.
	notes := splitNotes(ins.Notes)
	if len(notes) == 0 {
		notes = []string{"-"}
	}

	for i, note := range notes {
		m.AddAutoRow(
			text.NewCol(
				12,
				noteBullet(note),
				props.Text{
					Size:   9,
					Align:  align.Left,
					Top:    1,
					Left:   1,
					Right:  1,
					Bottom: 1,
				},
			).WithStyle(noteCellStyle(i, len(notes))),
		)
	}

	m.AddRow(
		12,
		text.NewCol(18, "", props.Text{Size: 1}),
		text.NewCol(18, "", props.Text{Size: 1}),
	)
	// SIGNATURE
	kepalaSignature, anggotaSignature, err := s.trustedReportSignatures(ins)
	if err != nil {
		return nil, "", err
	}

	signers, err := s.resolveReportSigners(ins, kepalaSignature, anggotaSignature)
	if err != nil {
		return nil, "", err
	}
	ketuaDisplayName, ketuaDisplayNip := signers.KepalaName, signers.KepalaNip
	anggotaDisplayName := signers.AnggotaName

	m.AddRow(
		5,
		text.NewCol(
			18,
			"Kepala Komite IPCLN",
			props.Text{
				Size:  9,
				Align: align.Center,
			},
		),
		text.NewCol(
			18,
			"IPCLN Ruangan",
			props.Text{
				Size:  9,
				Align: align.Center,
			},
		),
	)

	m.AddRow(
		18,
		signatureImageCol(18, kepalaSignature),
		signatureImageCol(18, anggotaSignature),
	)
	// Names
	m.AddRow(
		5,
		text.NewCol(
			18,
			ketuaDisplayName,
			props.Text{
				Size:  9,
				Style: fontstyle.Bold,
				Align: align.Center,
			},
		),
		text.NewCol(
			18,
			anggotaDisplayName,
			props.Text{
				Size:  9,
				Style: fontstyle.Bold,
				Align: align.Center,
			},
		),
	)

	if strings.TrimSpace(ketuaDisplayNip) != "" {
		m.AddRow(
			5,
			text.NewCol(
				18,
				"NIP. "+ketuaDisplayNip,
				props.Text{
					Size:  8,
					Align: align.Center,
				},
			),
			text.NewCol(18, "", props.Text{Size: 8}),
		)
	}

	// GENERATE
	doc, err := m.Generate()
	if err != nil {
		return nil, "", err
	}
	filename := fmt.Sprintf(
		"inspection-%d-%s.pdf",
		ins.ID,
		ins.InspectionMonth.Format("2006-01"),
	)
	return doc.GetBytes(), filename, nil
}

func monthlyCellStyle() *props.Cell {
	return &props.Cell{
		BorderType:      border.Full,
		BorderColor:     &props.BlackColor,
		BorderThickness: 0.1,
	}
}

// noteCellStyle renders the catatan entries as one continuous box: the first
// entry draws the top, the last entry draws the bottom, and every entry draws
// the sides, so no inner horizontal lines appear between entries.
func noteCellStyle(index, total int) *props.Cell {
	style := monthlyCellStyle()

	borderType := border.Left | border.Right
	if index == 0 {
		borderType |= border.Top
	}
	if index == total-1 {
		borderType |= border.Bottom
	}
	style.BorderType = borderType

	return style
}

// noteBullet prefixes an incident with a dash so every line of the catatan box
// starts with "- ". The empty placeholder already is a dash.
func noteBullet(note string) string {
	if note == "-" {
		return note
	}

	return "- " + note
}

// Returns the signer NIP.
func (s *Service) signatureSignerNip(sig *model.Signature) string {
	if sig == nil || sig.SignerUserID == nil {
		return ""
	}

	nip, err := s.Repo.GetUserNIP(*sig.SignerUserID)
	if err != nil {
		log.Printf("resolve signature NIP for user %d: %v", *sig.SignerUserID, err)
		return ""
	}

	return strings.TrimSpace(nip)
}

// Returns the signature image column.
func signatureImageCol(size int, sig *model.Signature) core.Col {
	if sig == nil || strings.TrimSpace(sig.ImageDataURL) == "" {
		return col.New(size)
	}

	pngBytes, err := signatureDataURLToPNG(sig.ImageDataURL)
	if err != nil {
		log.Printf("render %s signature: %v", sig.Role, err)
		return col.New(size)
	}

	return marotoimage.NewFromBytesCol(
		size,
		pngBytes,
		extension.Png,
		props.Rect{
			Center:  true,
			Percent: 100,
		},
	)
}

// Converts a data URL to PNG.
func signatureDataURLToPNG(dataURL string) ([]byte, error) {
	raw := strings.TrimSpace(dataURL)
	if !strings.HasPrefix(raw, "data:image/") {
		return nil, fmt.Errorf("unsupported signature data URL")
	}

	comma := strings.IndexByte(raw, ',')
	if comma < 0 || !strings.Contains(raw[:comma], ";base64") {
		return nil, fmt.Errorf("signature data URL is not base64 encoded")
	}

	decoded, err := base64.StdEncoding.DecodeString(raw[comma+1:])
	if err != nil {
		return nil, fmt.Errorf("decode signature base64: %w", err)
	}

	img, _, err := image.Decode(bytes.NewReader(decoded))
	if err != nil {
		return nil, fmt.Errorf("decode signature image: %w", err)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, trimSignatureMargins(img)); err != nil {
		return nil, fmt.Errorf("encode signature image: %w", err)
	}

	return buf.Bytes(), nil
}

const (
	// Channels at or above this are blank paper, not signature ink.
	signatureWhiteThreshold uint32 = 0xF000
	// Blank space kept around the ink, relative to the ink size.
	signatureTrimPadding = 0.06
	// Padding keeps the signature aspect ratio within the printable range.
	signatureMinAspect = 1.2
	signatureMaxAspect = 6.0
	// Ink smaller than this is not worth cropping around (stray dot).
	signatureMinInkPixels = 3
)

// Crops blank paper around a signature so the ink fills the report cell.
func trimSignatureMargins(src image.Image) image.Image {
	bounds := src.Bounds()
	minX, minY := bounds.Max.X, bounds.Max.Y
	maxX, maxY := bounds.Min.X-1, bounds.Min.Y-1
	found := false

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, bl, a := src.At(x, y).RGBA()
			if a == 0 ||
				(r >= signatureWhiteThreshold &&
					g >= signatureWhiteThreshold &&
					bl >= signatureWhiteThreshold) {
				continue
			}
			found = true
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
	if !found || maxX-minX < signatureMinInkPixels || maxY-minY < signatureMinInkPixels {
		return src
	}

	padX := max(int(math.Round(float64(maxX-minX)*signatureTrimPadding)), 4)
	padY := max(int(math.Round(float64(maxY-minY)*signatureTrimPadding)), 4)
	crop := image.Rect(minX-padX, minY-padY, maxX+1+padX, maxY+1+padY)

	width, height := crop.Dx(), crop.Dy()
	switch aspect := float64(width) / float64(height); {
	case aspect > signatureMaxAspect:
		height = int(math.Round(float64(width) / signatureMaxAspect))
	case aspect < signatureMinAspect:
		width = int(math.Round(float64(height) * signatureMinAspect))
	}

	// White canvas so the padded area disappears on the printed page.
	out := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(out, out.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)

	// Centre the cropped ink; anything outside the source stays white.
	offset := image.Pt((width-crop.Dx())/2, (height-crop.Dy())/2)
	draw.Draw(
		out,
		image.Rectangle{Min: offset, Max: offset.Add(crop.Size())},
		src,
		crop.Min,
		draw.Over,
	)

	return out
}

func addMonthlyChecklistMatrix(m core.Maroto, year int, month time.Month, items []model.ChecklistItem, answers map[int]map[int64]string) {
	daysInMonth := time.Date(
		year,
		month+1,
		0,
		0, 0, 0, 0,
		time.UTC,
	).Day()

	style := monthlyCellStyle()

	// HEADER
	header := []core.Col{
		text.NewCol(
			1,
			"No",
			props.Text{
				Size:  7,
				Top:   1,
				Style: fontstyle.Bold,
				Align: align.Center,
			},
		).WithStyle(style),

		text.NewCol(
			4,
			"Keterangan Item Pemeriksaan",
			props.Text{
				Size:  7,
				Top:   1,
				Style: fontstyle.Bold,
				Align: align.Center,
			},
		).WithStyle(style),
	}

	// DAYS, not checklist numbers
	for day := 1; day <= daysInMonth; day++ {
		header = append(
			header,
			text.NewCol(
				1,
				fmt.Sprintf("%d", day),
				props.Text{
					Size:  7,
					Top:   1,
					Style: fontstyle.Bold,
					Align: align.Center,
				},
			).WithStyle(style),
		)
	}

	m.AddRow(7, header...)

	// CHECKLIST ITEMS
	for i, item := range items {

		row := []core.Col{
			// No
			text.NewCol(
				1,
				fmt.Sprintf("%d", i+1),
				props.Text{
					Size:   7,
					Align:  align.Center,
					Top:    1.5,
					Left:   1,
					Right:  1,
					Bottom: 1,
				},
			).WithStyle(style),

			// Keterangan
			text.NewCol(
				4, item.Name,
				props.Text{
					Size:   7,
					Align:  align.Left,
					Top:    1,
					Left:   1,
					Right:  1,
					Bottom: 1,
				},
			).WithStyle(style),
		}
		// DAY COLUMNS
		for day := 1; day <= daysInMonth; day++ {
			symbol := ""
			if answers[day] != nil && answers[day][item.ID] == "GOOD" {
				symbol = "\uE5CA"
			}
			row = append(
				row,
				text.NewCol(
					1,
					symbol,
					props.Text{
						Family: "MaterialSymbols",
						Top:    2,
						Size:   12,
						Align:  align.Center,
					},
				).WithStyle(style),
			)
		}
		m.AddRow(12, row...)
	}
}
