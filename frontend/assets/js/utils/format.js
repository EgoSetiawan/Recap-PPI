import { badge } from '../ui.js';

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function conditionBadge(condition) {
  const map = {
    GOOD: { kind: 'good', label: 'Baik' },
    NEEDS_REPAIR: { kind: 'warn', label: 'Perlu Perbaikan' },
    FAILED: { kind: 'danger', label: 'Tidak Sesuai' },
  };

  const m = map[condition] || {
    kind: 'muted',
    label: condition || '—',
  };

  return `<span class="${badge(m.kind)}">${escapeHtml(m.label)}</span>`;
}

export function statusBadge(status) {
  const map = {
    OPEN: { kind: 'warn', label: 'Open' },
    SUBMITTED: { kind: 'info', label: 'Menunggu Review' },
    APPROVED: { kind: 'good', label: 'Disetujui' },
    REJECTED: { kind: 'danger', label: 'Ditolak' },

    ACTIVE: { kind: 'good', label: 'Active' },
    INACTIVE: { kind: 'muted', label: 'Inactive' },

    GOOD: { kind: 'good', label: 'Baik' },
    NEEDS_REPAIR: { kind: 'warn', label: 'Perlu Perbaikan' },
    FAILED: { kind: 'danger', label: 'Tidak Sesuai' },
  };

  const m = map[status] || {
    kind: 'muted',
    label: status || '—',
  };

  return `<span class="${badge(m.kind)}">${escapeHtml(m.label)}</span>`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

export function downloadText(filename, text, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Simple QR via Google Charts API (no npm dep) — demo only */
// export function qrImageUrl(text, size = 160) {
//   const data = encodeURIComponent(text);
//   return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`;
// }

export function roleLabel(role) {
  const map = {
    SUPER_ADMIN: 'Super Admin',
    KEPALA: 'Kepala PPI',
    ANGGOTA: 'Anggota PPI',
  };
  return map[role] || role || '';
}

export function resultLabel(result) {
  const map = {
    PASSED: 'Baik',
    GOOD: 'Baik',
    PASS: 'Baik',
    NEEDS_REPAIR: 'Perlu Perbaikan',
    FAILED: 'Tidak Sesuai',
    DAMAGED: 'Tidak Sesuai',
    FAIL: 'Tidak Sesuai',
  };
  return map[result] || result || '—';
}

export function normalizeItemStatus(status) {
  const u = String(status || '').toUpperCase().trim();
  if (u === 'GOOD' || u === 'PASS' || u === 'PASSED') return 'GOOD';
  if (u === 'NEEDS_REPAIR') return 'NEEDS_REPAIR';
  if (u === 'FAILED' || u === 'FAIL' || u === 'DAMAGED' || u === 'FAILED / DAMAGED' || u === 'FAILED/DAMAGED') {
    return 'FAILED';
  }
  return u || 'GOOD';
}

export function itemStatusLabel(status) {
  return resultLabel(normalizeItemStatus(status));
}

export function pagesBase() {
  return location.pathname.includes('/pages/') ? '' : 'pages/';
}

export function assetBase() {
  return location.pathname.includes('/pages/') ? '../assets' : 'assets';
}
