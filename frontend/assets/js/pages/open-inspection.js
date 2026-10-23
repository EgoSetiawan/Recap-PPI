
import { requireAuth, api } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml, formatDate, statusBadge } from "../utils/format.js";
import { btnSecondary, btnSm, tableWrap } from "../ui.js";

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("history.html");

  const table = document.getElementById("table");
  const filterResult = document.getElementById("filter-result");

  if (!table) {
    toast("Elemen tabel riwayat tidak ditemukan.", "error");
    return;
  }

  async function load() {
    table.innerHTML = `
      <div class="page-meta">
        Memuat pemeriksaan...
      </div>
    `;

    try {
      const query = {
        result: filterResult?.value || undefined,
      };

      // This endpoint returns OPEN inspections only.
      const { data } = await api("/inspections/open", { query });

      const rows = (Array.isArray(data) ? data : []).filter(
        (inspection) =>
          String(inspection.status || "").trim().toUpperCase() === "OPEN"
      );

      table.innerHTML = `
        <div class="${tableWrap}">
          <table class="data" style="border:none">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>Ruangan</th>
                <th>Status</th>
                <th>Pemeriksa</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              ${
                rows.length
                  ? rows.map((inspection) => {
                      const roomName =
                        inspection.room?.name ||
                        `Room #${inspection.room_id}`;

                      const inspectorName =
                        inspection.inspector_name ||
                        `User #${inspection.inspector_id}`;

                      return `
                        <tr>
                          <td>
                            ${formatDate(inspection.inspection_month)}
                          </td>

                          <td>
                            ${escapeHtml(roomName)}
                          </td>

                          <td>
                            ${statusBadge(inspection.status)}
                          </td>

                          <td>
                            ${escapeHtml(inspectorName)}
                          </td>

                          <td class="row-actions">
                            <a
                              class="${btnSecondary} ${btnSm}"
                              href="inspection-detail?id=${encodeURIComponent(inspection.id)}"
                            >
                              Edit
                            </a>
                          </td>
                        </tr>
                      `;
                    }).join("")
                  : `
                    <tr>
                      <td
                        colspan="5"
                        style="text-align:center; padding:24px"
                      >
                        Tidak ada pemeriksaan yang dapat diubah.
                      </td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>
      `;
    } catch (error) {
      table.innerHTML = `
        <div class="page-meta">
          Gagal memuat pemeriksaan.
        </div>
      `;

      // Toast only for actual API/request errors,
      // not when the returned list is empty.
      toast(error.message || "Gagal memuat pemeriksaan.", "error");
    }
  }

  filterResult?.addEventListener("change", load);

  await load();
}

main().catch((error) => {
  console.error("Inspection list error:", error);
  toast(error.message || "Gagal memuat pemeriksaan.", "error");
});
