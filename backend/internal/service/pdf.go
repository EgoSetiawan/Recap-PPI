package service

import (
	"PPI/internal/model"
	"fmt"
	"strings"
	"time"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/checkbox"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/align"
	"github.com/johnfercher/maroto/v2/pkg/consts/border"
	"github.com/johnfercher/maroto/v2/pkg/consts/fontstyle"
	"github.com/johnfercher/maroto/v2/pkg/consts/orientation"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
	"github.com/johnfercher/maroto/v2/pkg/core"
	"github.com/johnfercher/maroto/v2/pkg/props"
)

func (s *Service) CreateMonthlyInspectionPDF(actor *model.User, id int64) ([]byte, string, error) {
	ins, err := s.getInspectionForActor(actor, id)
	if err != nil {
		return nil, "", err
	}

	if ins == nil || ins.Room == nil {
		return nil, "", fmt.Errorf("inspection or room not found")
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

	cfg := config.NewBuilder().
		WithOrientation(orientation.Horizontal).
		WithPageSize(pagesize.A4).
		WithMaxGridSize(36).
		WithLeftMargin(6).
		WithRightMargin(6).
		WithTopMargin(6).
		WithBottomMargin(6).
		Build()

	m := maroto.New(cfg)
	// HEADER
	m.AddRow(
		8,
		text.NewCol(
			12,
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
			12,
			"RSU Dr. H. Koesnadi Bondowoso",
			props.Text{
				Size:  11,
				Style: fontstyle.Bold,
				Align: align.Center,
			},
		),
	)

	m.AddRow(3, text.NewCol(12, "", props.Text{Size: 1}))

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
	// CHECKLIST LEGEND
	m.AddRow(
		5,
		text.NewCol(
			12,
			"KETERANGAN ITEM PEMERIKSAAN",
			props.Text{
				Size:  8,
				Style: fontstyle.Bold,
			},
		),
	)

	// for i, item := range pdfData.Items {
	// 	m.AddAutoRow(
	// 		text.NewCol(
	// 			1,
	// 			fmt.Sprintf("%d", i+1),
	// 			props.Text{
	// 				Size:  7,
	// 				Align: align.Center,
	// 			},
	// 		).WithStyle(monthlyCellStyle()),

	// 		text.NewCol(
	// 			11,
	// 			item.Name,
	// 			props.Text{
	// 				Size:   7,
	// 				Align:  align.Left,
	// 				Top:    0.5,
	// 				Left:   1,
	// 				Right:  1,
	// 				Bottom: 0.5,
	// 			},
	// 		).WithStyle(monthlyCellStyle()),
	// 	)
	// }

	// MONTH MATRIX
	addMonthlyChecklistMatrix(
		m,
		year,
		month,
		pdfData.Items,
		pdfData.Answers,
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

	notes := strings.TrimSpace(ins.Notes)

	if notes == "" {
		notes = "-"
	}

	m.AddAutoRow(
		text.NewCol(
			12,
			notes,
			props.Text{
				Size:   9,
				Align:  align.Left,
				Top:    1,
				Left:   1,
				Right:  1,
				Bottom: 1,
			},
		).WithStyle(monthlyCellStyle()),
	)
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

func addMonthlyChecklistMatrix(
	m core.Maroto,
	year int,
	month time.Month,
	items []model.ChecklistItem,
	answers map[int]map[int64]string,
) {
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
				Size:  6,
				Style: fontstyle.Bold,
				Align: align.Center,
			},
		).WithStyle(style),
		text.NewCol(
			4,
			"Keterangan Item Pemeriksaan",
			props.Text{
				Size:  6,
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
					Size:  5,
					Style: fontstyle.Bold,
					Align: align.Center,
				},
			).WithStyle(style),
		)
	}

	m.AddRow(5, header...)

	// CHECKLIST ITEMS
	for i, item := range items {

		row := []core.Col{
			// No
			text.NewCol(
				1,
				fmt.Sprintf("%d", i+1),
				props.Text{
					Size:  6,
					Align: align.Center,
				},
			).WithStyle(style),

			// Keterangan
			text.NewCol(
				4,
				fmt.Sprintf("%d. %s", i+1, item.Name),
				props.Text{
					Size:   5.5,
					Align:  align.Left,
					Top:    0.5,
					Left:   1,
					Right:  1,
					Bottom: 0.5,
				},
			).WithStyle(style),
		}

		// =================================================
		// DAY COLUMNS
		// =================================================

		for day := 1; day <= daysInMonth; day++ {

			status := ""

			if answers[day] != nil {
				status = answers[day][item.ID]
			}

			if status == "GOOD" {
				row = append(
					row,
					checkbox.NewCol(
						1,
						"",
						props.Checkbox{
							Checked: true,
							Size:    3,
							Top:     0.4,
						},
					).WithStyle(style),
				)
			} else {
				row = append(
					row,
					text.NewCol(
						1,
						"",
						props.Text{
							Size: 5,
						},
					).WithStyle(style),
				)
			}
		}

		m.AddRow(5, row...)
	}
}
