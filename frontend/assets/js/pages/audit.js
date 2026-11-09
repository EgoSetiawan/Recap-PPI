import { requireAuth, api, hasPermission } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml, formatDate } from "../utils/format.js";
import { tableWrap, empty } from "../ui.js";

const ACTION_LABELS = {
  UPDATE_USER_ROOMS: "Ubah penugasan ruangan",
  DELETE_INSPECTION: "Hapus pemeriksaan",
};

function listLabel(names) {
  return Array.isArray(names) && names.length ? names.join(", ") : "";
}

function detailFor(item) {
  if (item.action === "UPDATE_USER_ROOMS") {
    const target =
      item.entity_name || (item.entity_id ? `Pengguna #${item.entity_id}` : "Pengguna");
    const oldLabel = listLabel(item.old_value?.room_names);
    const newLabel = listLabel(item.new_value?.room_names);

    if (oldLabel && newLabel) {
      return `${target} pindah dari ${oldLabel} ke ${newLabel}`;
    }
    if (newLabel) {
      return `${target} ditugaskan ke ${newLabel}`;
    }
    if (oldLabel) {
      return `${target} dilepas dari ${oldLabel}`;
    }

    return `${target}: tidak ada perubahan ruangan`;
  }

  if (item.action === "DELETE_INSPECTION") {
    const value = item.old_value || {};
    return [value.room_name, value.inspection_month, value.status].filter(Boolean).join(" · ");
  }

  if (item.old_value) {
    return JSON.stringify(item.old_value);
  }

  return "—";
}

function render(logs) {
  const table = document.getElementById("audit-table");

  table.innerHTML = `
    <div class="${tableWrap}">
      <table class="data" style="border:none">
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Pengguna</th>
            <th>Aksi</th>
            <th>Detail</th>
          </tr>
        </thead>

        <tbody>
          ${
            logs
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(formatDate(item.created_at))}</td>

                    <td>
                      <strong>${escapeHtml(item.user_name || "—")}</strong>
                    </td>

                    <td>
                      <span class="badge badge-info">
                        ${escapeHtml(ACTION_LABELS[item.action] || item.action || "—")}
                      </span>
                    </td>

                    <td>${escapeHtml(detailFor(item))}</td>
                  </tr>
                `,
              )
              .join("") ||
            `
              <tr>
                <td colspan="4" class="${empty}">
                  Belum ada aktivitas audit.
                </td>
              </tr>
            `
          }
        </tbody>
      </table>
    </div>
  `;
}

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("audit.html");

  if (!hasPermission("audit.view")) {
    document.getElementById("audit-table").innerHTML = `
      <div class="${empty}">
        Anda tidak memiliki akses untuk melihat audit log.
      </div>
    `;
    return;
  }

  try {
    const { data } = await api("/audit-logs", {
      query: {
        limit: 100,
      },
    });

    render(Array.isArray(data) ? data : []);
  } catch (error) {
    document.getElementById("audit-table").innerHTML = `
      <div class="${empty}">
        Gagal memuat audit log.
      </div>
    `;
    toast(error.message || "Gagal memuat audit log.", "error");
  }
}

main().catch((error) => {
  console.error("Audit page error:", error);
  toast(error.message || "Gagal memuat halaman audit.", "error");
});
