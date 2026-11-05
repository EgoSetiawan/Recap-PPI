import { requireAuth, api, hasPermission } from "../api.js";
import { mountShell, toast, openModal } from "../components/shell.js";
import { escapeHtml } from "../utils/format.js";
import { badge, btnSecondary, btnSm, formGroup, tableWrap, empty } from "../ui.js";

const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  KEPALA: "Kepala PPI",
  ANGGOTA: "Anggota PPI",
};

const ROLE_BADGES = {
  SUPER_ADMIN: "info",
  KEPALA: "good",
  ANGGOTA: "muted",
};

let users = [];
let rooms = [];

function unwrapArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.items)) return response.items;

  return [];
}

function normalizeRole(role) {
  const value = String(role || "")
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");

  if (value === "ATASAN_PPI" || value === "KEPALA_PPI") return "KEPALA";
  if (value === "ANGGOTA_PPI") return "ANGGOTA";

  return value;
}

function roleLabel(role) {
  const normalized = normalizeRole(role);

  return ROLE_LABELS[normalized] || role || "—";
}

function roomLabel(room) {
  const name = room.name || `Ruangan #${room.id}`;

  return room.code ? `${name} (${room.code})` : name;
}

function assignedRooms(user) {
  const assigned = Array.isArray(user.assigned_room_ids) ? user.assigned_room_ids : [];

  if (!assigned.length) return [];

  const byID = new Map(rooms.map((room) => [Number(room.id), room]));

  return assigned.map((roomID) => {
    const room = byID.get(Number(roomID));

    return room ? roomLabel(room) : `Ruangan #${roomID}`;
  });
}

function renderTable() {
  const table = document.getElementById("users-table");

  table.innerHTML = `
    <div class="${tableWrap}">
      <table class="data" style="border:none">
        <thead>
          <tr>
            <th>Nama</th>
            <th class="hide-sm">NIP</th>
            <th>Peran</th>
            <th>Ruangan Ditugaskan</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${
            users
              .map((user) => {
                const normalizedRole = normalizeRole(user.role);
                const isAnggota = normalizedRole === "ANGGOTA";
                const assigned = assignedRooms(user);

                const roomText = isAnggota
                  ? assigned.length
                    ? assigned.map((name) => escapeHtml(name)).join("<br />")
                    : '<span class="muted-text">Belum ditugaskan</span>'
                  : '<span class="muted-text">Semua ruangan</span>';

                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(user.name || "—")}</strong>
                      ${user.email ? `<div class="page-meta">${escapeHtml(user.email)}</div>` : ""}
                    </td>

                    <td class="hide-sm">${escapeHtml(user.nip || "—")}</td>

                    <td>
                      <span class="${badge(ROLE_BADGES[normalizedRole] || "muted")}">
                        ${escapeHtml(roleLabel(user.role))}
                      </span>
                    </td>

                    <td>${roomText}</td>

                    <td>
                      ${
                        isAnggota
                          ? `
                            <button
                              type="button"
                              class="${btnSecondary} ${btnSm}"
                              data-assign-user="${escapeHtml(String(user.id))}"
                            >
                              Ubah Ruangan
                            </button>
                          `
                          : '<span class="muted-text">—</span>'
                      }
                    </td>
                  </tr>
                `;
              })
              .join("") ||
            `
              <tr>
                <td colspan="5" class="${empty}">
                  Tidak ada pengguna
                </td>
              </tr>
            `
          }
        </tbody>
      </table>
    </div>
  `;
}

function openRoomAssignment(user) {
  const assigned = new Set(
    (Array.isArray(user.assigned_room_ids) ? user.assigned_room_ids : []).map(Number),
  );

  openModal({
    title: `Ruangan untuk ${user.name}`,
    submitLabel: "Simpan Penugasan",

    bodyHtml: `
      <div class="${formGroup}">
        <label>Pilih ruangan</label>

        <div style="display:grid;gap:8px;max-height:320px;overflow:auto;padding:4px 0">
          ${
            rooms.length
              ? rooms
                  .map(
                    (room) => `
                      <label style="display:flex;align-items:center;gap:8px">
                        <input
                          type="checkbox"
                          name="room_ids"
                          value="${escapeHtml(String(room.id))}"
                          ${assigned.has(Number(room.id)) ? "checked" : ""}
                        />
                        <span>${escapeHtml(roomLabel(room))}</span>
                      </label>
                    `,
                  )
                  .join("")
              : '<span class="muted-text">Belum ada ruangan.</span>'
          }
        </div>
      </div>
    `,

    onSubmit: async (_data, form) => {
      const roomIDs = [...form.querySelectorAll('input[name="room_ids"]:checked')].map((input) =>
        Number(input.value),
      );

      await api(`/users/${user.id}/rooms`, {
        method: "PUT",
        body: {
          room_ids: roomIDs,
        },
      });

      toast("Penugasan ruangan berhasil disimpan", "success");
      await load();
    },
  });
}

async function load() {
  const [usersResponse, roomsResponse] = await Promise.all([api("/users"), api("/rooms")]);

  users = unwrapArray(usersResponse);
  rooms = unwrapArray(roomsResponse);

  renderTable();
}

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("users.html");

  if (!hasPermission("users.assign_rooms")) {
    document.getElementById("users-table").innerHTML = `
      <div class="${empty}">
        Anda tidak memiliki akses untuk mengelola penugasan ruangan.
      </div>
    `;
    return;
  }

  document.getElementById("users-table").addEventListener("click", (event) => {
    const button = event.target.closest("[data-assign-user]");
    if (!button) return;

    const userID = Number(button.getAttribute("data-assign-user"));
    const target = users.find((item) => Number(item.id) === userID);

    if (target) openRoomAssignment(target);
  });

  try {
    await load();
  } catch (error) {
    toast(error.message || "Gagal memuat daftar pengguna.", "error");
  }
}

main().catch((error) => {
  console.error("Users page error:", error);
  toast(error.message || "Gagal memuat halaman pengguna.", "error");
});
