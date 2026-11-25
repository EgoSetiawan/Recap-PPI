package service

import "strings"

// comma or a line break separates incidents, so comma-separated notes and notes typed on separate lines are treated the same way.
func isNoteSeparator(r rune) bool {
	return r == ',' || r == '\n' || r == '\r'
}

// split notes if have comma or line break, and drop blank entries. It returns an empty slice when there is nothing to show.
func splitNotes(notes string) []string {
	fields := strings.FieldsFunc(notes, isNoteSeparator)

	entries := make([]string, 0, len(fields))

	for _, field := range fields {
		if entry := strings.TrimSpace(field); entry != "" {
			entries = append(entries, entry)
		}
	}

	return entries
}

// normalizeNotes stores catatan with one incident into per line.
func normalizeNotes(notes string) string {
	return strings.Join(splitNotes(notes), "\n")
}
