import { requireAuth, api, hasPermission } from "../api.js";
import { mountShell, toast, openModal } from "../components/shell.js";
import { escapeHtml, qs } from "../utils/format.js";
import { formGroup, tableWrap, empty } from "../ui.js";

const ROOM_TYPES = {
  INPATIENT: "Rawat Inap",
  ICU: "ICU",
  ICCU: "ICCU",
  OPERATING_ROOM: "IBS",
  EMERGENCY: "IGD",
  CHEMOTHERAPY: "Kemoterapi",
  HEMODIALYSIS: "Hemodialisa",
};

function roomTypeLabel(type) {
  return ROOM_TYPES[type] || type || "—";
}

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("rooms.html");

  const filterQ = document.getElementById("filter-q");
  const roomsTable = document.getElementById("rooms-table");

  const preQ = qs("q");
  if (preQ) filterQ.value = preQ;

  // Add room
  if (hasPermission("rooms.manage")) {
    const addBtn = document.getElementById("btn-add-room");

    if (addBtn) {
      addBtn.classList.remove("hidden");

      addBtn.addEventListener("click", () => {
        const modal = openModal({
          title: "Tambah Ruangan",
          submitLabel: "Buat Ruangan",

          bodyHtml: `
            <div class="create-form">
              <div class="create-form__intro">
                <div class="create-form__intro-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 21h18" />
                    <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
                    <path d="M9 21v-4h6v4M9 8h.01M15 8h.01M9 12h.01M15 12h.01" />
                  </svg>
                </div>

                <div>
                  <p class="create-form__eyebrow">Fasilitas baru</p>
                  <h4>Tambah ruangan</h4>
                  <p>Daftarkan ruangan agar dapat dipilih saat membuat pemeriksaan dan menugaskan Anggota PPI.</p>
                </div>
              </div>

              <div class="create-form__layout">
                <div class="create-form__main">
                  <section class="cu-panel">
                    <div class="cu-panel__head">
                      <span class="cu-step">01</span>
                      <div>
                        <h5>Identitas ruangan</h5>
                        <p>Gunakan nama dan kode yang mudah dikenali.</p>
                      </div>
                    </div>

                    <div class="cu-grid-2">
                      <div class="${formGroup}">
                        <label for="room-name">Nama ruangan <span class="cu-required">*</span></label>
                        <input
                          id="room-name"
                          name="name"
                          required
                          autocomplete="off"
                          placeholder="cth. Pav. Krisan"
                        />
                      </div>

                      <div class="${formGroup}">
                        <label for="room-code">Kode ruangan <span class="cu-required">*</span></label>
                        <input
                          id="room-code"
                          name="code"
                          required
                          autocomplete="off"
                          placeholder="cth. A-KRISAN"
                        />
                        <p class="cu-help">Kode unik untuk laporan dan pencarian.</p>
                      </div>

                      <div class="${formGroup} cu-field-full">
                        <label for="room-type">Tipe ruangan <span class="cu-required">*</span></label>
                        <select id="room-type" name="room_type" required>
                          <option value="INPATIENT">Rawat Inap</option>
                          <option value="ICU">ICU</option>
                          <option value="ICCU">ICCU</option>
                          <option value="OPERATING_ROOM">IBS</option>
                          <option value="EMERGENCY">IGD</option>
                          <option value="CHEMOTHERAPY">Kemoterapi</option>
                          <option value="HEMODIALYSIS">Hemodialisa</option>
                          <option value="Poliklinik">Poliklinik</option>
                        </select>
                      </div>
                    </div>
                  </section>

                  <section class="cu-panel">
                    <div class="cu-panel__head">
                      <span class="cu-step">02</span>
                      <div>
                        <h5>Deskripsi</h5>
                        <p>Tambahkan keterangan lokasi atau fungsi ruangan.</p>
                      </div>
                    </div>

                    <div class="${formGroup}">
                      <label for="room-description">Deskripsi ruangan</label>
                      <textarea
                        id="room-description"
                        name="description"
                        rows="4"
                        placeholder="cth. Ruangan rawat inap lantai 2..."
                      ></textarea>
                    </div>
                  </section>
                </div>

                <aside class="create-form__aside">
                  <section class="cu-panel cu-panel--soft">
                    <div class="cu-panel__head">
                      <span class="cu-step">03</span>
                      <div>
                        <h5>Ringkasan</h5>
                        <p>Pratinjau data ruangan yang akan dibuat.</p>
                      </div>
                    </div>

                    <div class="cu-summary">
                      <div class="cu-summary__label">Pratinjau ruangan</div>

                      <div class="cu-summary__row">
                        <span>Nama</span>
                        <strong data-room-preview="name" class="cu-summary__empty">—</strong>
                      </div>

                      <div class="cu-summary__row">
                        <span>Kode</span>
                        <strong data-room-preview="code" class="cu-summary__empty">—</strong>
                      </div>

                      <div class="cu-summary__row">
                        <span>Tipe</span>
                        <strong data-room-preview="type">Rawat Inap</strong>
                      </div>
                    </div>

                    <div class="cu-info" style="margin-top: 14px">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 11v5M12 8h.01" />
                      </svg>
                      <span>Ruangan baru langsung tersedia untuk pembuatan pemeriksaan.</span>
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          `,

          onSubmit: async (data) => {
            const name = String(data.name || "").trim();
            const code = String(data.code || "").trim();

            if (!name || !code) {
              throw new Error("Nama dan kode ruangan wajib diisi.");
            }

            await api("/rooms", {
              method: "POST",
              body: {
                name,
                code,
                room_type: String(data.room_type || "INPATIENT"),
                description: String(data.description || "").trim(),
              },
            });

            toast("Ruangan berhasil ditambahkan", "success");
            await load();
          },
        });

        modal
          .querySelector(".modal")
          ?.classList.add("create-form-modal", "create-form-modal--compact");

        const form = modal.querySelector(".modal-form");
        const nameInput = form?.querySelector("#room-name");
        const codeInput = form?.querySelector("#room-code");
        const typeInput = form?.querySelector("#room-type");

        const updatePreview = () => {
          const nameValue = nameInput?.value.trim() || "—";
          const codeValue = codeInput?.value.trim() || "—";
          const typeValue = roomTypeLabel(typeInput?.value);

          const nameTarget = form?.querySelector('[data-room-preview="name"]');
          const codeTarget = form?.querySelector('[data-room-preview="code"]');
          const typeTarget = form?.querySelector('[data-room-preview="type"]');

          if (nameTarget) {
            nameTarget.textContent = nameValue;
            nameTarget.classList.toggle("cu-summary__empty", nameValue === "—");
          }

          if (codeTarget) {
            codeTarget.textContent = codeValue;
            codeTarget.classList.toggle("cu-summary__empty", codeValue === "—");
          }

          if (typeTarget) typeTarget.textContent = typeValue;
        };

        [nameInput, codeInput].forEach((input) => {
          input?.addEventListener("input", () => {
            if (input === codeInput) input.value = input.value.toUpperCase();
            updatePreview();
          });
        });

        typeInput?.addEventListener("change", updatePreview);
        updatePreview();
      });
    }
  }

  // Load rooms from ListRoomsWithActors
  async function load() {
    const query = {
      q: filterQ.value.trim() || undefined,
    };

    const { data } = await api("/rooms", { query });

    roomsTable.innerHTML = `
    <div class="${tableWrap}">
      <table class="data" style="border:none">
        <thead>
          <tr>
            <th>Kode</th>
            <th>Nama Ruangan</th>
            <th class="hide-sm">Tipe</th>
            <th class="hide-sm">Anggota PPI</th>
          </tr>
        </thead>

        <tbody>
          ${
            data
              .map((r) => {
                const actors = r.assigned_actors || [];

                const initials = (name) =>
                  String(name || "?")
                    .split(/\s+/)
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();

                const actorNames = actors.length
                  ? `
                    <div class="actor-list">
                      ${actors
                        .map(
                          (actor) => `
                            <div class="actor">
                              <span class="actor-avatar">
                                ${escapeHtml(initials(actor.name))}
                              </span>

                              <span class="actor-copy">
                                <strong>${escapeHtml(actor.name || "—")}</strong>
                              </span>
                            </div>
                          `,
                        )
                        .join("")}
                    </div>
                  `
                  : '<span class="muted-text">Belum ditugaskan</span>';

                return `
                  <tr>
                    <td>${escapeHtml(r.code || "—")}</td>

                    <td>${escapeHtml(r.name || "—")}</td>

                    <td class="hide-sm">
                      ${escapeHtml(roomTypeLabel(r.room_type))}
                    </td>

                    <td class="hide-sm">
                      ${actorNames}
                    </td>
                  </tr>
                `;
              })
              .join("") ||
            `
              <tr>
                <td colspan="4" class="${empty}">
                  Tidak ada data ruangan
                </td>
              </tr>
            `
          }
        </tbody>
      </table>
    </div>
  `;
  }

  // Search by room name or roomap code
  filterQ.addEventListener("input", () => {
    clearTimeout(window.__roomT);

    window.__roomT = setTimeout(async () => {
      try {
        await load();
      } catch (e) {
        toast(e.message, "error");
      }
    }, 250);
  });

  try {
    await load();
  } catch (e) {
    toast(e.message, "error");
  }
}

main();
