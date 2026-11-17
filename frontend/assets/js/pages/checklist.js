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
    currentUser?.role ?? currentUser?.role_name ?? currentUser?.roleName ?? "",
  )
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  // Super Admin can manage checklist items.
  const canManageChecklist =
    roleId === 1 || roleName === "SUPER_ADMIN" || hasPermission("checklist.manage");

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
    const selectedType = item.room_type || "ALL";

    return `
      <div class="create-form">
        <div class="create-form__intro">
          <div class="create-form__intro-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="3" width="14" height="18" rx="2" />
              <path d="M9 3.5h6M9 9h6M9 13h6M9 17h3" />
            </svg>
          </div>

          <div>
            <p class="create-form__eyebrow">Item baru</p>
            <h4>Tambah item checklist</h4>
            <p>Buat butir pemeriksaan yang akan muncul pada form inspeksi ruangan.</p>
          </div>
        </div>

        <div class="create-form__layout">
          <div class="create-form__main">
            <section class="cu-panel">
              <div class="cu-panel__head">
                <span class="cu-step">01</span>
                <div>
                  <h5>Informasi item</h5>
                  <p>Tulis butir pemeriksaan secara jelas dan singkat.</p>
                </div>
              </div>

              <div class="${formGroup}">
                <label for="checklist-name">Nama checklist <span class="cu-required">*</span></label>
                <input
                  id="checklist-name"
                  name="name"
                  required
                  autocomplete="off"
                  placeholder="cth. Mengisi bundle HAIS setiap pasien"
                  value="${escapeHtml(item.name || "")}"
                />
              </div>

              <div class="${formGroup}">
                <label for="checklist-description">Deskripsi</label>
                <textarea
                  id="checklist-description"
                  name="description"
                  rows="3"
                  placeholder="Keterangan tambahan untuk petugas..."
                >${escapeHtml(item.description || "")}</textarea>
              </div>
            </section>

            <section class="cu-panel">
              <div class="cu-panel__head">
                <span class="cu-step">02</span>
                <div>
                  <h5>Pengaturan tampilan</h5>
                  <p>Tentukan ruangan dan urutan item ini.</p>
                </div>
              </div>

              <div class="cu-grid-2">
                <div class="${formGroup}">
                  <label for="checklist-room-type">Tipe ruangan <span class="cu-required">*</span></label>
                  <select id="checklist-room-type" name="room_type" required>
                    ${Object.entries(roomTypes)
                      .map(
                        ([value, label]) => `
                          <option value="${value}" ${selectedType === value ? "selected" : ""}>
                            ${label}
                          </option>
                        `,
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
                    class="cu-order-input"
                    value="${item.order_number ?? 99}"
                    required
                  />
                  <p class="cu-help">Angka lebih kecil tampil lebih awal.</p>
                </div>
              </div>
            </section>
          </div>

          <aside class="create-form__aside">
            <section class="cu-panel cu-panel--soft">
              <div class="cu-panel__head">
                <span class="cu-step">03</span>
                <div>
                  <h5>Aturan penilaian</h5>
                  <p>Tentukan apakah item ini wajib dinilai.</p>
                </div>
              </div>

              <label class="cu-switch">
                <input
                  type="checkbox"
                  name="is_required"
                  ${item.is_required !== false ? "checked" : ""}
                />
                <span class="cu-switch__track" aria-hidden="true"></span>
                <span class="cu-switch__copy">
                  <strong>Wajib diisi</strong>
                  <small>Petugas harus menilai item ini sebelum menyimpan pemeriksaan.</small>
                </span>
              </label>

              <div class="cu-info" style="margin-top: 14px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" />
                </svg>
                <span>Item akan muncul pada pemeriksaan baru sesuai tipe ruangan yang dipilih.</span>
              </div>
            </section>
          </aside>
        </div>
      </div>
    `;
  }

  // Update the add button.
  if (addButton) {
    if (canManageChecklist) {
      addButton.classList.remove("hidden");

      addButton.addEventListener("click", () => {
        const modal = openModal({
          title: "Tambah Item Checklist",
          submitLabel: "Buat Item",
          bodyHtml: formFields(),

          onSubmit: async (data, form) => {
            const name = String(data.name || "").trim();

            if (!name) {
              throw new Error("Nama checklist wajib diisi.");
            }

            await api("/checklist-items", {
              method: "POST",
              body: {
                name,
                room_type: String(data.room_type || "ALL"),
                description: String(data.description || "").trim(),
                order_number: Number(data.order_number) || 99,
                is_required: Boolean(form.querySelector('[name="is_required"]')?.checked),
              },
            });

            toast("Item checklist berhasil ditambahkan", "success");
            await load();
          },
        });

        modal
          .querySelector(".modal")
          ?.classList.add("create-form-modal", "create-form-modal--compact");
      });
    } else {
      addButton.classList.add("hidden");
    }
  }

  // Load checklist items independently of the add permission.
  async function load() {
    const { data } = await api("/checklist-items");

    const items = (Array.isArray(data) ? data : [])
      .slice()
      .sort((a, b) => (a.order_number ?? 0) - (b.order_number ?? 0));

    table.innerHTML = `
      <div class="${tableWrap}">
        <table class="data" style="border:none">
          <thead>
            <tr>
              <th style="width: 56px">No.</th>
              <th>Nama Checklist</th>
              <th class="hide-sm">Deskripsi</th>
              <th class="hide-sm">Tipe Ruangan</th>
              <th>Wajib</th>
              <th class="hide-sm">Urutan</th>
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
                              ${escapeHtml(item.name || "—")}
                          </td>

                          <td class="hide-sm">
                            ${escapeHtml(item.description || "—")}
                          </td>

                          <td class="hide-sm">
                            ${escapeHtml(
                              roomTypes[item.room_type] || item.room_type || "Semua Ruangan",
                            )}
                          </td>

                          <td>
                            ${item.is_required ? "Ya" : "Tidak"}
                          </td>

                          <td class="hide-sm">
                            ${item.order_number ?? "—"}
                          </td>
                        </tr>
                      `,
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
