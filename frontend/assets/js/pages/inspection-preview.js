import { requireAuth, api } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml, notesHtml, qs, statusBadge } from "../utils/format.js";

// Preview rendered using HTML.
const CHECK_MARK = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
`;

// Only the Kepala Komite IPCLN column prints a NIP; the IPCLN Ruangan column is name-only.
function signatureColumn(title, name, image, nip) {
  return `
    <div class="report-signature">
      <div class="report-signature-title">${escapeHtml(title)}</div>
      ${
        image
          ? `<img class="report-signature-image" src="${image}" alt="Tanda tangan ${escapeHtml(title)}" />`
          : `<div class="report-signature-empty">Belum ditandatangani</div>`
      }
      <div class="report-signature-name">${escapeHtml(name || "-")}</div>
      ${nip ? `<div class="report-signature-nip">NIP. ${escapeHtml(nip)}</div>` : ""}
    </div>
  `;
}

function renderMatrix(data) {
  const days = Array.from({ length: data.days_in_month }, (_, i) => i + 1);

  const header = `
    <tr>
      <th class="col-no">No</th>
      <th class="col-item">Keterangan Item Pemeriksaan</th>
      ${days.map((day) => `<th class="col-day">${day}</th>`).join("")}
    </tr>
  `;

  const rows = (data.items || [])
    .map((item, index) => {
      const cells = days
        .map((day) => {
          const done = data.answers?.[String(day)]?.[String(item.id)] === "GOOD";
          return `<td class="col-day${done ? " is-done" : ""}">${
            done ? CHECK_MARK : ""
          }</td>`;
        })
        .join("");

      return `
        <tr>
          <td class="col-no">${index + 1}</td>
          <td class="col-item">${escapeHtml(item.name)}</td>
          ${cells}
        </tr>
      `;
    })
    .join("");

  return `
    <table class="report-table">
      <thead>${header}</thead>
      <tbody>
        ${
          rows ||
          `<tr><td colspan="${days.length + 2}" class="report-empty">Belum ada item pemeriksaan.</td></tr>`
        }
      </tbody>
    </table>
  `;
}

function renderReport(data) {
  return `
    <div class="report-head">
      <h2>LAPORAN KINERJA IPCLN PPI</h2>
      <p>RSU Dr. H. Koesnadi Bondowoso</p>
    </div>

    <dl class="report-meta">
      <dt>Bulan</dt><dd>: ${escapeHtml(data.month_label)}</dd>
      <dt>Ruangan</dt><dd>: ${escapeHtml(data.room_name)}</dd>
      <dt>Jenis Ruangan</dt><dd>: ${escapeHtml(data.room_type || "-")}</dd>
      <dt>Status</dt><dd>: ${statusBadge(data.status)}</dd>
    </dl>

    <h3 class="report-section-title">HASIL PEMERIKSAAN</h3>
    ${renderMatrix(data)}

    <h3 class="report-section-title">CATATAN</h3>
    <div class="report-notes">${notesHtml(data.notes)}</div>

    <div class="report-signatures">
      ${signatureColumn("Kepala Komite IPCLN", data.ketua_name, data.ketua_signature, data.ketua_nip)}
      ${signatureColumn("IPCLN Ruangan", data.anggota_name, data.anggota_signature)}
    </div>
  `;
}

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("open-inspection.html");

  const id = qs("id");
  const preview = document.getElementById("preview");
  if (!id || !preview) {
    toast("Pemeriksaan tidak ditemukan.", "error");
    return;
  }

  try {
    const { data } = await api(`/inspections/${id}/preview`);
    preview.innerHTML = renderReport(data);

    const actions = document.getElementById("preview-actions");
    if (actions) {
      actions.innerHTML = `
        <a class="btn btn-secondary" href="./inspection-detail.html?id=${encodeURIComponent(id)}">
          Kembali ke Pemeriksaan
        </a>
      `;
    }
  } catch (error) {
    preview.innerHTML = "";
    toast(error.message, "error");
  }
}

main();
