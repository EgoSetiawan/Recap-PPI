import { requireAuth, api } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml, formatMonth, statusBadge } from "../utils/format.js";
import { btnSecondary, btnSm, tableWrap, empty } from "../ui.js";

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("latest.html");

  const table = document.getElementById("table");
  const filterResult = document.getElementById("filter-result");

  if (!table) {
    toast("Elemen tabel riwayat tidak ditemukan.", "error");
    return;
  }

  async function load() {
    table.innerHTML = `
      <div class="${empty}">Memuat riwayat pemeriksaan...</div>
    `;

    try {
      // The Go handler accepts the "result" query parameter.
      const query = {
        result: filterResult?.value || undefined,
      };

      const { data } = await api("/inspections", { query });

      // The backend returns inspection records in newest-first order.
      // Hide drafts from the history page.
      const rows = (Array.isArray(data) ? data : []).filter(
        (inspection) => String(inspection.status || "").toLowerCase() !== "draft",
      );

      table.innerHTML = `
        <div class="${tableWrap}">
          <table class="data" style="border:none">
            <thead>
              <tr>
                <th class="hide-sm">Tanggal</th>
                <th>Ruangan</th>
                <th>Hasil</th>
                <th class="hide-sm">Pemeriksa</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
             ${
               rows.length
                 ? rows
                     .map((inspection) => {
                       const roomName = inspection.room?.name || `Room #${inspection.room_id}`;

                       const inspectorName =
                         inspection.inspector_name || `User #${inspection.inspector_id}`;

                       const status = inspection.status || "—";

                       return `
            <tr>
              <td class="hide-sm">
                ${formatMonth(inspection.inspection_month)}
              </td>

              <td>
                <span class="cell-title">${escapeHtml(roomName)}</span>
                <small class="cell-sub">${formatMonth(inspection.inspection_month)}</small>
              </td>

              <td>
                ${statusBadge(status)}
              </td>

              <td class="hide-sm">
                ${escapeHtml(inspectorName)}
              </td>

              <td class="row-actions">
                <a
                  class="${btnSecondary} ${btnSm}"
                  href="inspection-detail?id=${encodeURIComponent(inspection.id)}"
                >
                  Lihat
                </a>
              </td>
            </tr>
          `;
                     })
                     .join("")
                 : `<tr><td colspan="5" class="${empty}">Tidak ada riwayat pemeriksaan</td></tr>`
             }
            </tbody>
          </table>
        </div>
      `;
    } catch (error) {
      table.innerHTML = `
        <div class="${empty}">
          Gagal memuat riwayat pemeriksaan.
        </div>
      `;

      throw error;
    }
  }

  // Reload when the result filter changes.
  filterResult?.addEventListener("change", async () => {
    try {
      await load();
    } catch (error) {
      toast(error.message, "error");
    }
  });

  try {
    await load();
  } catch (error) {
    toast(error.message, "error");
  }
}

main().catch((error) => {
  console.error("History page error:", error);
  toast(error.message || "Gagal memuat riwayat.", "error");
});
