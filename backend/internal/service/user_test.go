package service

import "testing"

func TestCanonicalRoleName(t *testing.T) {
	cases := map[string]string{
		"KEPALA":      "KEPALA",
		"kepala":      "KEPALA",
		"ATASAN_PPI":  "KEPALA",
		"KEPALA_PPI":  "KEPALA",
		"ANGGOTA_PPI": "ANGGOTA",
		" anggota ":   "ANGGOTA",
		"SUPER_ADMIN": "SUPER_ADMIN",
	}

	for input, want := range cases {
		if got := canonicalRoleName(input); got != want {
			t.Fatalf("canonicalRoleName(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizeUserStatus(t *testing.T) {
	cases := map[string]string{
		"ACTIVE":     "ACTIVE",
		"active":     "ACTIVE",
		"INACTIVE":   "INACTIVE",
		" inactive ": "INACTIVE",
		"":           "",
		"DRAFT":      "",
	}

	for input, want := range cases {
		if got := normalizeUserStatus(input); got != want {
			t.Fatalf("normalizeUserStatus(%q) = %q, want %q", input, got, want)
		}
	}
}
