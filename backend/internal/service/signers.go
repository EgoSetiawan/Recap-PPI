package service

import (
	"strings"

	"PPI/internal/auth"
	"PPI/internal/model"
)

// Names printed on the monthly report; only the Kepala Komite IPCLN carries a NIP.
type reportSigners struct {
	KepalaName  string
	KepalaNip   string
	AnggotaName string
}

// Petugas signature is the who in charge that room
func (s *Service) trustedReportSignatures(ins *model.Inspection) (*model.Signature, *model.Signature, error) {
	kepala := findSignatureByRole(ins.Signatures, "KEPALA")
	anggota := findSignatureByRole(ins.Signatures, "ANGGOTA")

	trustedKepala, err := s.trustSignatureForRole(kepala, auth.RoleKepala)
	if err != nil {
		return nil, nil, err
	}

	trustedAnggota, err := s.trustSignatureForRole(anggota, auth.RoleAnggota)
	if err != nil {
		return nil, nil, err
	}

	return trustedKepala, trustedAnggota, nil
}

// Confirms that the signature's signer currently holds role. Signatures without a signer link (deleted users or legacy rows) are kept as they are.
func (s *Service) trustSignatureForRole(sig *model.Signature, role string) (*model.Signature, error) {
	if sig == nil || sig.SignerUserID == nil {
		return sig, nil
	}

	signer, err := s.Repo.GetByID(*sig.SignerUserID)
	if err != nil {
		return nil, err
	}
	if signer == nil || auth.NormalizeRole(signer.Role) != auth.NormalizeRole(role) {
		return nil, nil
	}

	return sig, nil
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
