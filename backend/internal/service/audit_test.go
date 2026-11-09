package service

import (
	"testing"

	"PPI/internal/model"
)

func TestRoomNames(t *testing.T) {
	rooms := []model.Room{
		{ID: 1, Name: "Pav. Krisan"},
		{ID: 2, Name: "ICU"},
	}

	names := roomNames(rooms, []int64{2, 1, 99})
	if len(names) != 3 {
		t.Fatalf("roomNames length = %d, want 3", len(names))
	}
	if names[0] != "ICU" || names[1] != "Pav. Krisan" || names[2] != "#99" {
		t.Fatalf("roomNames = %#v", names)
	}
}

func TestSameIDs(t *testing.T) {
	cases := []struct {
		name string
		a    []int64
		b    []int64
		want bool
	}{
		{name: "same order", a: []int64{1, 2}, b: []int64{1, 2}, want: true},
		{name: "different order", a: []int64{1, 2}, b: []int64{2, 1}, want: true},
		{name: "different length", a: []int64{1}, b: []int64{1, 2}, want: false},
		{name: "different value", a: []int64{1, 2}, b: []int64{1, 3}, want: false},
		{name: "empty", a: nil, b: []int64{}, want: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := sameIDs(tc.a, tc.b); got != tc.want {
				t.Fatalf("sameIDs() = %v, want %v", got, tc.want)
			}
		})
	}
}
