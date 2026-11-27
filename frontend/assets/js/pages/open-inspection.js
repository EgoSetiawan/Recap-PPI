import { requireAuth, api } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml, formatMonth, statusBadge } from "../utils/format.js";
import { btnSecondary, btnSm, tableWrap } from "../ui.js";
import {
  paginate,
  renderPagination,
  emptyPagination,
} from "../components/pagination.js";

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("open-inspection.html");

  const table = document.getElementById("table");
  const pagination = document.getElementById("pagination");
  const filterResult = document.getElementById("filter-result");

  if (!table) {
    toast("Elemen tabel riwayat tidak ditemukan.", "error");
    return;
  }

  let allRows = [];
  let page = 1;
  let pageSize = 10;

  function renderRows() {
    const result = paginate(allRows, page, pageSize);
    page = result.page;

    table.innerHTML = `
      <div class="${tableWrap}">
        <table class="data" style="border:none">
          <thead>
            <tr>
              <th class="hide-sm">Tanggal</th>
              <th>Ruangan</th>
              <th>Status</th>
              <th class="hide-sm">Pemeriksa</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            ${
              result.items.length
                ? result.items
                    .map((inspection) => {
                      const roomName =
                        inspection.room?.name || `Room #${inspection.room_id}`;

                      const inspectorName =
                        inspection.inspector_name ||
                        `User #${inspection.inspector_id}`;

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
                            ${statusBadge(inspection.status)}
                          </td>

                          <td class="hide-sm">
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
                    })
                    .join("")
                : `
                  <tr>
                    <td colspan="5" style="text-align:center; padding:24px">
                      Tidak ada pemeriksaan yang dapat diubah.
                    </td>
                  </tr>
                `
            }
          </tbody>
        </table>
      </div>
    `;

    renderPagination(pagination, {
      page,
      pageSize,
      total: allRows.length,
      onPageChange: (next) => {
        page = next;
        renderRows();
      },
      onPageSizeChange: (size) => {
        pageSize = size;
        page = 1;
        renderRows();
      },
    });
  }

  async function load() {
    table.innerHTML = `
      <div class="page-meta">
        Memuat pemeriksaan...
      </div>
    `;

    emptyPagination(pagination);

    try {
      const query = {
        result: filterResult?.value || undefined,
      };

      const { data } = await api("/inspections/open", { query });

      allRows = (Array.isArray(data) ? data : []).filter(
        (inspection) =>
          String(inspection.status || "")
            .trim()
            .toUpperCase() === "DRAFT",
      );

      page = 1;
      renderRows();
    } catch (error) {
      table.innerHTML = `
        <div class="page-meta">
          Gagal memuat pemeriksaan.
        </div>
      `;

      emptyPagination(pagination);
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
