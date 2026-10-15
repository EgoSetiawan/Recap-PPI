import { requireAuth, api, hasPermission } from "../api.js";
import { mountShell, toast, openModal } from "../components/shell.js";
import { escapeHtml } from "../utils/format.js";
import { formGroup, tableWrap, empty } from "../ui.js";

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("checklist.html");

  const table = document.getElementById("table");
  const addButton = document.getElementById("btn-add");

  if (!table) {
    toast("Elemen tabel checklist tidak ditemukan.", "error");
    return;
  }

  // Support either a direct user object or { data: user }.
  const currentUser = user?.data ?? user;

  const roleId = Number(currentUser?.role_id);

  const roleName = String(
    currentUser?.role ??
    currentUser?.role_name ??
    currentUser?.roleName ??
    ""
  )
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  // Super Admin can manage checklist items.
  const canManageChecklist =
    roleId === 1 ||
    roleName === "SUPER_ADMIN" ||
    hasPermission("checklist.manage");

  const roomTypes = {
    ALL: "Semua Ruangan",
    INPATIENT: "Rawat Inap",
    ICU: "ICU",
    ICCU: "ICCU",
    OPERATING_ROOM: "Kamar Operasi (IBS)",
    EMERGENCY: "Instalasi Gawat Darurat (IGD)",
    CHEMOTHERAPY: "Kemoterapi",
    HEMODIALYSIS: "Hemodialisa",
  };

  // Form for creating a checklist item.
  function formFields(item = {}) {
    return `
      <div class="${formGroup}">
        <label for="checklist-name">Nama Checklist</label>
        <input
          id="checklist-name"
          name="name"
          required
          value="${escapeHtml(item.name || "")}"
        />
      </div>

      <div class="${formGroup}">
        <label for="checklist-description">Deskripsi</label>
        <textarea
          id="checklist-description"
          name="description"
          rows="3"
        >${escapeHtml(item.description || "")}</textarea>
      </div>

      <div class="${formGroup}">
        <label for="checklist-room-type">Tipe Ruangan</label>
        <select
          id="checklist-room-type"
          name="room_type"
          required
        >
          ${Object.entries(roomTypes)
            .map(
              ([value, label]) => `
                <option
                  value="${value}"
                  ${(item.room_type || "ALL") === value ? "selected" : ""}
                >
                  ${label}
                </option>
              `
            )
            .join("")}
        </select>
      </div>

      <div class="${formGroup}">
        <label for="checklist-order">Urutan</label>
        <input
          id="checklist-order"
          name="order_number"
          type="number"
          min="1"
          value="${item.order_number ?? 99}"
          required
        />
      </div>

      <div class="${formGroup}">
        <label>
          <input
            type="checkbox"
            name="is_required"
            ${item.is_required !== false ? "checked" : ""}
          />
          Wajib diisi
        </label>
      </div>
    `;
  }

  // Only hide or show the add button.
  // Do not block the entire checklist page.
  if (addButton) {
    if (canManageChecklist) {
      addButton.classList.remove("hidden");

      addButton.addEventListener("click", () => {
        openModal({
          title: "Tambah Item Checklist",
          submitLabel: "Simpan",
          bodyHtml: formFields(),

          onSubmit: async (form, el) => {
            try {
              const name = String(form.name || "").trim();

              if (!name) {
                toast("Nama checklist wajib diisi.", "error");
                return;
              }

              await api("/checklist-items", {
                method: "POST",
                body: {
                  name,
                  room_type: form.room_type || "ALL",
                  description: String(form.description || "").trim(),
                  order_number: Number(form.order_number),
                  is_required: el.querySelector(
                    '[name="is_required"]'
                  ).checked,
                },
              });

              toast("Item checklist berhasil ditambahkan", "success");

              await load();
            } catch (error) {
              toast(error.message, "error");
            }
          },
        });
      });
    } else {
      addButton.classList.add("hidden");
    }
  }

  // Load checklist items independently of the add permission.
  async function load() {
    const { data } = await api("/checklist-items");

    const items = (Array.isArray(data) ? data : []).slice().sort(
      (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0)
    );

    table.innerHTML = `
      <div class="${tableWrap}">
        <table class="data" style="border:none">
          <thead>
            <tr>
              <th style="width:60px">No.</th>
              <th>Nama Checklist</th>
              <th>Deskripsi</th>
              <th>Tipe Ruangan</th>
              <th>Wajib</th>
              <th>Urutan</th>
            </tr>
          </thead>

          <tbody>
            ${
              items.length
                ? items
                    .map(
                      (item, index) => `
                        <tr>
                          <td>${index + 1}</td>

                          <td>
                            <strong>
                              ${escapeHtml(item.name || "—")}
                            </strong>
                          </td>

                          <td>
                            ${escapeHtml(item.description || "—")}
                          </td>

                          <td>
                            ${escapeHtml(
                              roomTypes[item.room_type] ||
                              item.room_type ||
                              "Semua Ruangan"
                            )}
                          </td>

                          <td>
                            ${item.is_required ? "Ya" : "Tidak"}
                          </td>

                          <td>
                            ${item.order_number ?? "—"}
                          </td>
                        </tr>
                      `
                    )
                    .join("")
                : `
                    <tr>
                      <td colspan="6" class="${empty}">
                        Belum ada item checklist.
                      </td>
                    </tr>
                  `
            }
          </tbody>
        </table>
      </div>
    `;
  }

  try {
    await load();
  } catch (error) {
    toast(error.message, "error");
  }
}

main().catch((error) => {
  console.error("Checklist page error:", error);
  toast(error.message || "Gagal memuat halaman checklist.", "error");
});