import { requireAuth, api, hasPermission } from "../api.js";
import { mountShell, toast, openModal } from "../components/shell.js";
import { escapeHtml, statusBadge, qs, conditionBadge } from "../utils/format.js";
import { btnSecondary, btnSm, formGroup, tableWrap, empty } from "../ui.js";

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
        openModal({
          title: "Tambah Ruangan",
          submitLabel: "Simpan",

          bodyHtml: `
            <div class="${formGroup}">
              <label>Nama Ruangan</label>
              <input name="name" required />
            </div>

            <div class="${formGroup}">
              <label>Kode Ruangan</label>
              <input name="code" required />
            </div>

            <div class="${formGroup}">
              <label>Tipe Ruangan</label>
              <select name="room_type" required>
                <option value="INPATIENT">Rawat Inap</option>
                <option value="ICU">ICU</option>
                <option value="ICCU">ICCU</option>
                <option value="OPERATING_ROOM">IBS</option>
                <option value="EMERGENCY">IGD</option>
                <option value="CHEMOTHERAPY">Kemoterapi</option>
                <option value="HEMODIALYSIS">Hemodialisa</option>
              </select>
            </div>

            <div class="${formGroup}">
              <label>Deskripsi</label>
              <textarea name="description" rows="2"></textarea>
            </div>
          `,

          onSubmit: async (data) => {
            data.floor = Number(data.floor);

            await api("/rooms", {
              method: "POST",
              body: data,
            });

            toast("Ruangan berhasil ditambahkan", "success");
            await load();
          },
        });
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
            <th>Tipe</th>
            <th>Anggota PPI</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${
            data
              .map((r) => {
                const actors = r.assigned_actors || [];

                const actorNames = actors.length
                  ? actors
                      .map(
                        (actor) => `
                          <div>
                            <strong>${escapeHtml(actor.name || "—")}</strong>
                            ${actor.nip ? `<br><small>${escapeHtml(actor.nip)}</small>` : ""}
                          </div>
                        `,
                      )
                      .join("")
                  : "Belum ditugaskan";

                return `
                  <tr>
                    <td>
                      <a href="room-detail?id=${r.id}">
                        ${escapeHtml(r.code)}
                      </a>
                    </td>

                    <td>${escapeHtml(r.name)}</td>

                    <td>
                      ${escapeHtml(r.room_type || "—")}
                    </td>

                    <td>${actorNames}</td>

                    <td class="row-actions">
                      <a
                        class="${btnSecondary} ${btnSm}"
                        href="room-detail?id=${r.id}"
                      >
                        Lihat
                      </a>
                    </td>
                  </tr>
                `;
              })
              .join("") ||
            `
              <tr>
                <td colspan="6" class="${empty}">
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

  // Search by room name or room code
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
