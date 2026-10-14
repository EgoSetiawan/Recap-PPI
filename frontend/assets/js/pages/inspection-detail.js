import { requireAuth, api, hasPermission, downloadInspectionPdf } from '../api.js';
import { mountShell, toast } from '../components/shell.js';
import {qs, escapeHtml, formatDate, statusBadge,} from '../utils/format.js';
import {btn, btnSecondary, empty, section, sectionHeader, sectionBody, alert as alertClass,} from '../ui.js';
import { SignaturePad } from '../signature.js';


function sigBlock(title, sig) {
  if (!sig) {
    return `<div class="sig-card"><div class="sig-label">${escapeHtml(title)}</div><p class="page-meta">Belum ada tanda tangan</p></div>`;
  }
  const src = typeof sig.image_data_url === 'string' && sig.image_data_url.length > 80 ? sig.image_data_url : '';
  return `<div class="sig-card">
    <div class="sig-label">${escapeHtml(title)}</div>
    ${src ? `<img class="sig-image" src="${src}" alt="Tanda tangan ${escapeHtml(title)}" />` : '<p class="page-meta">Gambar tanda tangan tidak tersedia</p>'}
    <strong>${escapeHtml(sig.signer_name || '')}</strong>
    <div class="page-meta">${escapeHtml(sig.signer_title || '')} · ${formatDate(sig.signed_at)}</div>
  </div>`;
}

function photoUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('http')) return url;
  const base = (window.APP_CONFIG?.API_BASE_URL || '').replace(/\/api\/?$/, '');
  return base + url;
}

function showError(message) {
  document.getElementById('header-actions').innerHTML = '';
  document.getElementById('detail-root').innerHTML = `
    <div class="${alertClass('error')}">${escapeHtml(message)}</div>
    <p class="page-meta" style="margin-top:12px"><a href="latest.html">Kembali ke daftar pemeriksaan</a></p>
  `;
}

async function main() {
  const user = await requireAuth();
  if (!user) return;
  await mountShell('latest.html', {
    breadcrumb: `<a href="latest.html">Pemeriksaan</a><span>/</span>Detail`,
    mobileBack: { href: 'latest.html', label: 'Kembali' },
  });

  const id = qs('id');
  if (!id || !/^[1-9]\d*$/.test(id)) {
    showError('Parameter ID pemeriksaan tidak valid atau tidak ditemukan.');
    return;
  }

  const { data: insp } = await api(`/inspections/${id}`);
  const room = insp.room || {};
  const failed = insp.result === 'FAILED';

const canManageInspection = hasPermission('inspections.manage');

const canSignAsKepalaRuangan =
  user.role === 'KEPALA_RUANGAN' &&
  hasPermission('inspections.sign') &&
  !!insp.inspector_signature &&
  !insp.kepala_ruangan_signature;

  document.getElementById('header-actions').innerHTML = `<button type="button" class="${btnSecondary}" id="btn-pdf">Cetak PDF</button>
    ${ canManageInspection ? `<button type="button" class="${btnSecondary}" id="btn-delete">Hapus Pemeriksaan</button>`: ''}` ;

  document.getElementById('btn-pdf').addEventListener('click', async () => {
    try {
      await downloadInspectionPdf(insp.id);
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  const btnDelete = document.getElementById('btn-delete');

  if (btnDelete) {
    btnDelete.addEventListener('click', async () => {
      const confirmed = window.confirm(
        'Apakah Anda yakin ingin menghapus pemeriksaan ini? Data akan dihapus secara soft delete.'
      );
      if (!confirmed) return;
      btnDelete.disabled = true;
      btnDelete.textContent = 'Menghapus...';
      try {
        await api(`/inspections/${insp.id}`, {
          method: 'DELETE',
        });
        toast('Pemeriksaan berhasil dihapus', 'success');
        setTimeout(() => {
          window.location.href = 'latest.html';
        }, 700);
      } catch (e) {
        btnDelete.disabled = false;
        btnDelete.textContent = 'Hapus Pemeriksaan';
        toast(
          e.message || 'Gagal menghapus pemeriksaan',
          'error'
        );
      }
    });
  }

  const items = insp.checklist_detail || insp.checklist || [];
  const findings = items.filter((i) => (i.notes || '').trim());
  const photos = insp.photos || [];
  const logs = insp.workflow_logs || [];
const monthNames = [
  'Januari', 'Februari', 'Maret', 'April',
  'Mei', 'Juni', 'Juli', 'Agustus',
  'September', 'Oktober', 'November', 'Desember'
];

const monthNumber = insp.inspection_month?.match(/^\d{4}-(\d{2})-/)?.[1];

const monthName = monthNumber
  ? monthNames[Number(monthNumber) - 1] || '—'
  : '—';

  document.getElementById('detail-root').innerHTML = `
    ${failed ? `<div class="${alertClass('failed')}">Temuan kritis PPI (Tidak Sesuai) — perlu perhatian segera.</div>` : ''}
    <div class="${section}">
      <div class="${sectionHeader}">Informasi</div>
      <div class="${sectionBody}">
        <div class="info-grid">
          <div><span>Nomor</span><strong>${insp.document_number || insp.id}</strong></div>
          <div><span>Ruangan</span><strong>${escapeHtml(room.name || '')}</strong></div>
          <div><span>Kode</span><strong>${escapeHtml(room.code || '')}</strong></div>
          <div><span>Bulan</span><strong>${formatDate(monthName)}</strong></div>
          <div><span>Hasil</span><strong>${statusBadge(insp.result)}</strong></div>
          <div><span>Status</span><strong>${statusBadge(insp.status)}</strong></div>
        </div>
      </div>
    </div>
    <div class="${section}" style="margin-top:12px">
      <div class="${sectionHeader}">Pemeriksaan</div>
      <div class="${sectionBody}" style="padding:0">
        <table class="data"><thead><tr><th>Item</th><th>Penilaian</th><th>Temuan</th></tr></thead>
        <tbody>
          ${items.map((i) => `<tr>
            <td>${escapeHtml(i.name || '')}</td>
            <td>${statusBadge(i.status)}</td>
            <td>${escapeHtml(i.notes || '—')}</td>
          </tr>`).join('') || `<tr><td colspan="3" class="${empty}">Tidak ada item</td></tr>`}
        </tbody></table>
      </div>
    </div>
    <div class="${section}" style="margin-top:12px">
      <div class="${sectionHeader}">Catatan</div>
      <div class="${sectionBody}">${escapeHtml(insp.notes || '—')}</div>
    </div>
    <div class="${section}" style="margin-top:12px">
      <div class="${sectionHeader}">Tanda Tangan</div>
      <div class="${sectionBody}">
        <div class="sig-row">
          ${sigBlock(
            'Pemeriksa',
            insp.inspector_signature
          )}
          ${sigBlock(
            'Kepala Ruangan',
            insp.kepala_ruangan_signature
          )}
        </div>
          ${canSignAsKepalaRuangan
              ? `
                <div style="margin-top:16px">
                  <button
                    type="button"
                    class="${btn}"
                    id="btn-sign-kepala"
                  >
                    Tanda Tangan sebagai Kepala Ruangan
                  </button>
                </div>
              `
              : ''
          }
      </div>
    </div>
  `;
if (canSignAsKepalaRuangan) {
  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div
        id="kepala-sign-modal"
        class="kepala-sign-modal"
        aria-hidden="true"
      >
        <div
          class="kepala-sign-modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kepala-sign-title"
        >
          <!-- Header -->
          <div class="kepala-sign-modal-header">
            <div>
              <h2
                id="kepala-sign-title"
                class="text-lg font-semibold text-gray-900"
              >
                Tanda Tangan Kepala Ruangan
              </h2>

              <p class="page-meta mt-1">
                Pemeriksaan #${escapeHtml(String(insp.id))}
              </p>
            </div>

            <button
              type="button"
              id="btn-close-kepala-sign"
              class="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>

          <!-- Body -->
          <div class="kepala-sign-modal-body">
            <div id="kepala-signature-root"></div>
          </div>

          <!-- Footer -->
          <div class="flex justify-end gap-2 border-t px-6 py-4">
            <button
              type="button"
              class="${btnSecondary}"
              id="btn-cancel-kepala-sign"
            >
              Batal
            </button>

            <button
              type="button"
              class="${btn}"
              id="btn-save-kepala-sign"
            >
              Simpan Tanda Tangan
            </button>
          </div>
        </div>
      </div>
    `
  );

  const modal = document.getElementById('kepala-sign-modal');
  const openBtn = document.getElementById('btn-sign-kepala');
  const closeBtn = document.getElementById('btn-close-kepala-sign');
  const cancelBtn = document.getElementById('btn-cancel-kepala-sign');

  openBtn?.addEventListener('click', () => {
    modal?.classList.add('is-open');
    modal?.setAttribute('aria-hidden', 'false');
  });

  closeBtn?.addEventListener('click', () => {
    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
  });

  cancelBtn?.addEventListener('click', () => {
    modal?.classList.remove('is-open');
    modal?.setAttribute('aria-hidden', 'true');
  });

  const kepalaSignModal =
    document.getElementById('kepala-sign-modal');

  const kepalaSigPad = new SignaturePad(
    document.getElementById('kepala-signature-root')
  );

  function openKepalaSignModal() {
    kepalaSigPad.clear();

    kepalaSignModal.classList.remove('hidden');
    kepalaSignModal.classList.add('flex');

    kepalaSignModal.setAttribute('aria-hidden', 'false');
  }

  function closeKepalaSignModal() {
    kepalaSigPad.clear();

    kepalaSignModal.classList.remove('flex');
    kepalaSignModal.classList.add('hidden');

    kepalaSignModal.setAttribute('aria-hidden', 'true');
  }

  // Open
  document
    .getElementById('btn-sign-kepala')
    ?.addEventListener('click', openKepalaSignModal);

  // Close button
  document
    .getElementById('btn-close-kepala-sign')
    ?.addEventListener(
      'click',
      closeKepalaSignModal
    );

  // Cancel
  document
    .getElementById('btn-cancel-kepala-sign')
    ?.addEventListener(
      'click',
      closeKepalaSignModal
    );

  // Click overlay to close
  kepalaSignModal.addEventListener(
    'click',
    (event) => {
      if (event.target === kepalaSignModal) {
        closeKepalaSignModal();
      }
    }
  );

  // Escape to close
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Escape' &&
        !kepalaSignModal.classList.contains('hidden')
      ) {
        closeKepalaSignModal();
      }
    }
  );

  // Save
  document
    .getElementById('btn-save-kepala-sign')
    ?.addEventListener('click', async () => {
      if (kepalaSigPad.isEmpty()) {
        toast(
          'Tanda tangan wajib diisi',
          'error'
        );
        return;
      }

      const payload =
        await kepalaSigPad.getPayload();

      if (!payload) {
        toast(
          'Tanda tangan tidak valid',
          'error'
        );
        return;
      }

      const button =
        document.getElementById(
          'btn-save-kepala-sign'
        );

      button.disabled = true;
      button.textContent = 'Menyimpan...';

      try {
        await api(
          `/inspections/${insp.id}/signature/kepala-ruangan`,
          {
            method: 'POST',
            body: JSON.stringify(payload),
          }
        );

        toast(
          'Tanda tangan Kepala Ruangan berhasil disimpan',
          'success'
        );

        closeKepalaSignModal();

        window.location.reload();
      } catch (error) {
        toast(
          error.message ||
            'Gagal menyimpan tanda tangan',
          'error'
        );

        button.disabled = false;
        button.textContent =
          'Simpan Tanda Tangan';
      }
    });
  }
}

main().catch((e) => {
  showError(e.message);
  toast(e.message, 'error');
});
