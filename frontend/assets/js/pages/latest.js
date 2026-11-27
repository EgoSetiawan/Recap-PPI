import { requireAuth, api } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml, formatMonth, statusBadge } from "../utils/format.js";
import { btnSecondary, btnSm, tableWrap, empty } from "../ui.js";
import {
  paginate,
  renderPagination,
  emptyPagination,
} from "../components/pagination.js";

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("latest.html");

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
              <th>Hasil</th>
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
      <div class="${empty}">Memuat riwayat pemeriksaan...</div>
    `;

    emptyPagination(pagination);

    try {
      const query = {
        result: filterResult?.value || undefined,
      };

      const { data } = await api("/inspections", { query });

      allRows = (Array.isArray(data) ? data : []).filter(
        (inspection) =>
          String(inspection.status || "").toLowerCase() !== "draft",
      );

      page = 1;
      renderRows();
    } catch (error) {
      table.innerHTML = `
        <div class="${empty}">
          Gagal memuat riwayat pemeriksaan.
        </div>
      `;

      emptyPagination(pagination);
      throw error;
    }
  }

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
