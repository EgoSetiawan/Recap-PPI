package service

import (
	"slices"
	"strings"
	"testing"

	"github.com/johnfercher/maroto/v2"
	"github.com/johnfercher/maroto/v2/pkg/components/text"
	"github.com/johnfercher/maroto/v2/pkg/config"
	"github.com/johnfercher/maroto/v2/pkg/consts/orientation"
	"github.com/johnfercher/maroto/v2/pkg/consts/pagesize"
	"github.com/johnfercher/maroto/v2/pkg/props"
)

func TestSplitNotes(t *testing.T) {
	cases := []struct {
		name  string
		notes string
		want  []string
	}{
		{name: "empty", notes: "", want: []string{}},
		{name: "blank", notes: "   \n\t ", want: []string{}},
		{name: "single entry", notes: "Lantai bersih", want: []string{"Lantai bersih"}},
		{
			name:  "comma separated",
			notes: "this is incident, another incident",
			want:  []string{"this is incident", "another incident"},
		},
		{name: "comma without space", notes: "a,b,c", want: []string{"a", "b", "c"}},
		{name: "line breaks", notes: "a\nb\r\nc", want: []string{"a", "b", "c"}},
		{name: "mixed separators", notes: "a, b\nc", want: []string{"a", "b", "c"}},
		{name: "blank entries dropped", notes: " a , , b ,", want: []string{"a", "b"}},
		{name: "separators only", notes: ",,\n\n", want: []string{}},
		{name: "entries trimmed", notes: "  a  ,  b  ", want: []string{"a", "b"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := splitNotes(tc.notes); !slices.Equal(got, tc.want) {
				t.Fatalf("splitNotes(%q) = %#v, want %#v", tc.notes, got, tc.want)
			}
		})
	}
}

func TestNormalizeNotes(t *testing.T) {
	cases := []struct {
		name  string
		notes string
		want  string
	}{
		{name: "empty", notes: "", want: ""},
		{name: "blank", notes: "   ", want: ""},
		{name: "single entry", notes: "single", want: "single"},
		{name: "comma and space", notes: "a, b", want: "a\nb"},
		{name: "comma without space", notes: "a,b", want: "a\nb"},
		{name: "already line separated", notes: "a\nb", want: "a\nb"},
		{name: "blanks dropped", notes: " a , , b ,", want: "a\nb"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeNotes(tc.notes); got != tc.want {
				t.Fatalf("normalizeNotes(%q) = %q, want %q", tc.notes, got, tc.want)
			}
		})
	}
}

// Mirrors the CATATAN section of the report: one auto row per incident inside
// a single box (no inner horizontal borders between entries).
func TestNotesRenderAsSeparatePDFRows(t *testing.T) {
	cfg := config.NewBuilder().
		WithOrientation(orientation.Horizontal).
		WithPageSize(pagesize.A4).
		WithMaxGridSize(36).
		Build()

	entries := splitNotes("this is incident, another incident")
	if len(entries) != 2 {
		t.Fatalf("expected 2 note entries, got %d", len(entries))
	}

	m := maroto.New(cfg)
	for i, note := range entries {
		m.AddAutoRow(
			text.NewCol(
				12,
				noteBullet(note),
				props.Text{Size: 9},
			).WithStyle(noteCellStyle(i, len(entries))),
		)
	}

	doc, err := m.Generate()
	if err != nil {
		t.Fatalf("generate pdf: %v", err)
	}

	pdf := string(doc.GetBytes())
	if pdf == "" {
		t.Fatal("generated pdf is empty")
	}

	if !strings.Contains(pdf, "(- this is incident)") ||
		!strings.Contains(pdf, "(- another incident)") {
		t.Fatal("both incidents must be drawn with a dash bullet in the pdf")
	}

	// One continuous box: the first entry draws top+left+right and the last
	// entry left+right+bottom = 6 segments. A per-entry Full border would
	// draw 8, adding an inner horizontal line between the entries.
	if got := strings.Count(pdf, " l S"); got != 6 {
		t.Fatalf("border segments = %d, want 6 (single box)", got)
	}
}

func TestNotesSingleEntryKeepsFullBox(t *testing.T) {
	cfg := config.NewBuilder().
		WithOrientation(orientation.Horizontal).
		WithPageSize(pagesize.A4).
		WithMaxGridSize(36).
		Build()

	m := maroto.New(cfg)
	m.AddAutoRow(
		text.NewCol(12, "only one incident", props.Text{Size: 9}).
			WithStyle(noteCellStyle(0, 1)),
	)

	doc, err := m.Generate()
	if err != nil {
		t.Fatalf("generate pdf: %v", err)
	}

	if got := strings.Count(string(doc.GetBytes()), " l S"); got != 4 {
		t.Fatalf("border segments = %d, want 4 (full box for a single entry)", got)
	}
}

func TestNoteBullet(t *testing.T) {
	cases := []struct {
		note string
		want string
	}{
		{note: "incident", want: "- incident"},
		{note: "a, b", want: "- a, b"},
		{note: "-", want: "-"},
	}

	for _, tc := range cases {
		if got := noteBullet(tc.note); got != tc.want {
			t.Errorf("noteBullet(%q) = %q, want %q", tc.note, got, tc.want)
		}
	}
}
