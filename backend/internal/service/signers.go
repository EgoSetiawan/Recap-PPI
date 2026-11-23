package service

import (
	"strings"

	"PPI/internal/auth"
	"PPI/internal/model"
)

// Names printed on the monthly report; only the kepala carries a NIP.
type reportSigners struct {
	KepalaName  string
	KepalaNip   string
	AnggotaName string
}

// Resolves report signers from the room assignments, preferring recorded signatures.
func (s *Service) resolveReportSigners(
	ins *model.Inspection,
	kepalaSignature, anggotaSignature *model.Signature,
) (reportSigners, error) {
	var out reportSigners

	kepala, err := s.Repo.GetRoomKepala(ins.RoomID)
	if err != nil {
		return out, err
	}
	if kepala != nil {
		out.KepalaName, out.KepalaNip = kepala.Name, kepala.Nip
	} else {
		name, nip, err := s.Repo.GetKetua()
		if err != nil {
			return out, err
		}
		out.KepalaName, out.KepalaNip = name, nip
	}

	anggota, err := s.Repo.GetRoomAnggota(ins.RoomID)
	if err != nil {
		return out, err
	}
	if anggota != nil {
		out.AnggotaName = anggota.Name
	}

	// The inspector is the IPCLN of the room only when that account inspects.
	if ins.InspectorID > 0 {
		inspector, err := s.Repo.GetByID(ins.InspectorID)
		if err != nil {
			return out, err
		}
		if inspector != nil && auth.IsAnggota(inspector.Role) {
			if name := strings.TrimSpace(inspector.Name); name != "" {
				out.AnggotaName = name
			}
		}
	}

	if kepalaSignature != nil {
		if name := strings.TrimSpace(kepalaSignature.SignerName); name != "" {
			out.KepalaName = name
		}
		if nip := s.signatureSignerNip(kepalaSignature); nip != "" {
			out.KepalaNip = nip
		}
	}
	if anggotaSignature != nil {
		if name := strings.TrimSpace(anggotaSignature.SignerName); name != "" {
			out.AnggotaName = name
		}
	}

	return out, nil
}
