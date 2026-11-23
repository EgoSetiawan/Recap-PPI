import { requireAuth, api, hasPermission } from "../api.js";
import { mountShell, toast, openModal } from "../components/shell.js";
import { escapeHtml } from "../utils/format.js";
import {
  badge,
  btnSecondary,
  btnSm,
  formGroup,
  tableWrap,
  empty,
} from "../ui.js";
import { paginate, renderPagination } from "../components/pagination.js";

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
let page = 1;
let pageSize = 10;

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
  const assigned = Array.isArray(user.assigned_room_ids)
    ? user.assigned_room_ids
    : [];

  if (!assigned.length) return [];

  const byID = new Map(rooms.map((room) => [Number(room.id), room]));

  return assigned.map((roomID) => {
    const room = byID.get(Number(roomID));

    return room ? roomLabel(room) : `Ruangan #${roomID}`;
  });
}

function renderTable() {
  const table = document.getElementById("users-table");
  const pagination = document.getElementById("users-pagination");
  const result = paginate(users, page, pageSize);
  page = result.page;
  const canManage = hasPermission("users.manage");

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
            result.items
              .map((user) => {
                const normalizedRole = normalizeRole(user.role);
                const isAnggota = normalizedRole === "ANGGOTA";
                const assigned = assignedRooms(user);

                const roomText = isAnggota
                  ? assigned.length
                    ? assigned.map((name) => escapeHtml(name)).join("<br />")
                    : '<span class="muted-text">Belum ditugaskan</span>'
                  : '<span class="muted-text">Semua ruangan</span>';

                const actions = [
                  canManage
                    ? `<button
                        type="button"
                        class="${btnSecondary} ${btnSm}"
                        data-edit-user="${escapeHtml(String(user.id))}"
                      >
                        Edit
                      </button>`
                    : "",
                  isAnggota
                    ? `<button
                        type="button"
                        class="${btnSecondary} ${btnSm}"
                        data-assign-user="${escapeHtml(String(user.id))}"
                      >
                        Ubah Ruangan
                      </button>`
                    : "",
                ]
                  .filter(Boolean)
                  .join("");

                return `
                  <tr>
                    <td>
                      <strong>${escapeHtml(user.name || "—")}</strong>
                      ${user.email ? `<div class="page-meta">${escapeHtml(user.email)}</div>` : ""}
                    </td>

                    <td class="hide-sm">${isAnggota ? "—" : escapeHtml(user.nip || "—")}</td>

                    <td>
                      <span class="${badge(ROLE_BADGES[normalizedRole] || "muted")}">
                        ${escapeHtml(roleLabel(user.role))}
                      </span>
                    </td>

                    <td>${roomText}</td>

                    <td>
                      ${
                        actions
                          ? `<div style="display:flex;gap:6px;flex-wrap:wrap">${actions}</div>`
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

  renderPagination(pagination, {
    page,
    pageSize,
    total: users.length,
    onPageChange: (next) => {
      page = next;
      renderTable();
    },
    onPageSizeChange: (size) => {
      pageSize = size;
      page = 1;
      renderTable();
    },
  });
}

function openRoomAssignment(user) {
  const assigned = new Set(
    (Array.isArray(user.assigned_room_ids) ? user.assigned_room_ids : []).map(
      Number,
    ),
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
      const roomIDs = [
        ...form.querySelectorAll('input[name="room_ids"]:checked'),
      ].map((input) => Number(input.value));

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

function openUserForm(user = null) {
  const isEdit = Boolean(user);

  const eyeIcon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  `;

  const eyeOffIcon = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m3 3 18 18" />
      <path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.8 17.8 0 0 1-3.2 4.2" />
      <path d="M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 4.3-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  `;

  const roleOptions = [
    {
      value: "ANGGOTA",
      label: "Anggota PPI",
      description: "Mengisi pemeriksaan ruangan.",
      icon: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
        </svg>
      `,
    },
    {
      value: "KEPALA",
      label: "Kepala PPI",
      description: "Meninjau dan menandatangani.",
      icon: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      `,
    },
    {
      value: "SUPER_ADMIN",
      label: "Super Admin",
      description: "Mengelola pengguna dan sistem.",
      icon: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      `,
    },
  ];

  const initialRole = isEdit ? normalizeRole(user.role) : "ANGGOTA";

  const roleCards = roleOptions
    .map(
      (role, index) => `
        <label class="cu-role">
          <input
            type="radio"
            name="role"
            value="${role.value}"
            ${initialRole === role.value || (!initialRole && index === 0) ? "checked" : ""}
          />

          <span class="cu-role__top">
            <span class="cu-role__icon">${role.icon}</span>
            <span class="cu-role__dot" aria-hidden="true"></span>
          </span>

          <strong>${role.label}</strong>
          <small>${role.description}</small>
        </label>
      `,
    )
    .join("");

  const roomItems = rooms.length
    ? rooms
        .map((room) => {
          const name = room.name || `Ruangan #${room.id}`;
          const code = room.code || "";
          const search = `${name} ${code}`.toLowerCase();

          return `
            <label class="cu-room" data-room-search="${escapeHtml(search)}">
              <input type="checkbox" name="room_ids" value="${escapeHtml(String(room.id))}" />
              <span>${escapeHtml(name)}</span>
              ${code ? `<code>${escapeHtml(code)}</code>` : ""}
            </label>
          `;
        })
        .join("")
    : '<div class="cu-empty">Belum ada ruangan. Tambahkan ruangan terlebih dahulu.</div>';

  const modal = openModal({
    title: isEdit ? "Edit Pengguna" : "Tambah Pengguna",
    submitLabel: isEdit ? "Simpan Perubahan" : "Buat Pengguna",

    bodyHtml: `
      <div class="create-form">
        <div class="create-form__intro">
          <div class="create-form__intro-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <path d="M19 8v6M22 11h-6" />
            </svg>
          </div>

          <div>
            <p class="create-form__eyebrow">${isEdit ? "Perbarui akses" : "Akses baru"}</p>
            <h4>${isEdit ? "Edit akun pengguna" : "Buat akun pengguna"}</h4>
            <p>${
              isEdit
                ? "Perbarui identitas, peran, dan ruangan pengguna. Kosongkan password jika tidak ingin menggantinya."
                : "Tambahkan pengguna, tentukan perannya, lalu pilih ruangan yang menjadi tanggung jawabnya."
            }</p>
          </div>
        </div>

        <div class="create-form__layout">
          <div class="create-form__main">
            <section class="cu-panel">
              <div class="cu-panel__head">
                <span class="cu-step">01</span>
                <div>
                  <h5>Identitas pengguna</h5>
                  <p>Data ini akan tampil pada daftar pengguna dan laporan.</p>
                </div>
              </div>

              <div class="cu-grid-2">
                <div class="${formGroup}">
                  <label for="user-name">Nama lengkap <span class="cu-required">*</span></label>
                  <input
                    id="user-name"
                    name="name"
                    required
                    autocomplete="name"
                    placeholder="cth. Andi Setiawan"
                  />
                </div>

                <div class="${formGroup}">
                  <label for="user-email">Email <span class="cu-required">*</span></label>
                  <input
                    id="user-email"
                    name="email"
                    type="email"
                    required
                    autocomplete="email"
                    placeholder="nama@ppi.local"
                  />
                  <p class="cu-help">Digunakan untuk masuk ke aplikasi.</p>
                </div>

                <div class="${formGroup}">
                  <label for="user-title">Jabatan</label>
                  <input
                    id="user-title"
                    name="title"
                    autocomplete="organization-title"
                    placeholder="cth. Kepala PPI atau Anggota PPI"
                  />
                </div>

                <div class="${formGroup}" id="user-nip-group">
                  <label for="user-nip">NIP</label>
                  <input
                    id="user-nip"
                    name="nip"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="cth. 198812152020011001"
                  />
                  <p class="cu-help">Dicetak pada laporan untuk Kepala PPI.</p>
                </div>
              </div>
            </section>

            <section class="cu-panel">
              <div class="cu-panel__head">
                <span class="cu-step">02</span>
                <div>
                  <h5>Peran dan akses</h5>
                  <p>Peran menentukan fitur yang dapat digunakan.</p>
                </div>
              </div>

              <div class="cu-roles" role="radiogroup" aria-label="Peran pengguna">
                ${roleCards}
              </div>
            </section>

            <section class="cu-panel" id="user-rooms-group">
              <div class="cu-panel__head">
                <span class="cu-step">03</span>
                <div>
                  <h5>Akses ruangan</h5>
                  <p>Pilih ruangan yang dapat diperiksa oleh Anggota.</p>
                </div>
              </div>

              <div class="cu-room-toolbar">
                <div class="cu-room-search">
                  <input
                    type="search"
                    id="user-room-search"
                    placeholder="Cari nama atau kode ruangan..."
                    aria-label="Cari ruangan"
                  />
                </div>

                <button type="button" class="cu-room-button" data-room-action="all">Pilih semua</button>
                <button type="button" class="cu-room-button" data-room-action="none">Kosongkan</button>
                <span class="cu-room-count" id="user-room-count">Belum ada ruangan dipilih</span>
              </div>

              <div class="cu-rooms" id="user-rooms">
                ${roomItems}
              </div>

              <div class="cu-room-note">
                Peran ini otomatis memiliki akses ke semua ruangan.
              </div>
            </section>
          </div>

          <aside class="create-form__aside">
            <section class="cu-panel">
              <div class="cu-panel__head">
                <span class="cu-step">04</span>
                <div>
                  <h5>Keamanan akun</h5>
                  <p>Buat password awal untuk pengguna.</p>
                </div>
              </div>

              <div class="${formGroup}">
                <label for="user-password">${
                  isEdit
                    ? "Password baru (opsional)"
                    : 'Password <span class="cu-required">*</span>'
                }</label>
                <div class="cu-password">
                  <input
                    id="user-password"
                    name="password"
                    type="password"
                    minlength="6"
                    ${isEdit ? "" : "required"}
                    autocomplete="new-password"
                    placeholder="${isEdit ? "Kosongkan jika tidak diganti" : "Minimal 6 karakter"}"
                  />
                  <button
                    type="button"
                    class="cu-password__toggle"
                    data-password-toggle="user-password"
                    aria-label="Tampilkan password"
                  >
                    ${eyeIcon}
                  </button>
                </div>
              </div>

              <div class="${formGroup}">
                <label for="user-password-confirm">${
                  isEdit
                    ? "Konfirmasi password baru"
                    : 'Konfirmasi password <span class="cu-required">*</span>'
                }</label>
                <div class="cu-password">
                  <input
                    id="user-password-confirm"
                    name="password_confirm"
                    type="password"
                    minlength="6"
                    ${isEdit ? "" : "required"}
                    autocomplete="new-password"
                    placeholder="Ulangi password"
                  />
                  <button
                    type="button"
                    class="cu-password__toggle"
                    data-password-toggle="user-password-confirm"
                    aria-label="Tampilkan konfirmasi password"
                  >
                    ${eyeIcon}
                  </button>
                </div>
                <p class="cu-help">${
                  isEdit
                    ? "Biarkan kosong jika tidak ingin mengganti password."
                    : "Gunakan minimal 6 karakter."
                }</p>
              </div>
            </section>

            <section class="cu-panel cu-panel--soft">
              <div class="cu-panel__head">
                <span class="cu-step">05</span>
                <div>
                  <h5>Status akun</h5>
                  <p>Tentukan apakah akun langsung dapat digunakan.</p>
                </div>
              </div>

              <div class="cu-status">
                <label for="user-status">Status</label>
                <select id="user-status" name="status">
                  <option value="ACTIVE" selected>Aktif — dapat langsung masuk</option>
                  <option value="INACTIVE">Nonaktif — akses ditangguhkan</option>
                </select>
              </div>

              <div class="cu-info" style="margin-top: 12px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v5M12 8h.01" />
                </svg>
                <span>Pengguna dapat mengganti password setelah masuk pertama kali.</span>
              </div>
            </section>
          </aside>
        </div>
      </div>
    `,

    onSubmit: async (data, form) => {
      const name = String(data.name || "").trim();
      const email = String(data.email || "").trim();
      const title = String(data.title || "").trim();
      const nip = String(data.nip || "").trim();
      const password = String(data.password || "");
      const passwordConfirm = String(data.password_confirm || "");
      const role = String(data.role || "ANGGOTA");
      const status = String(data.status || "ACTIVE");

      if (!name || !email) {
        throw new Error("Nama dan email wajib diisi.");
      }

      if (!isEdit && !password) {
        throw new Error("Password wajib diisi.");
      }

      if (password) {
        if (password.length < 6) {
          throw new Error("Password minimal 6 karakter.");
        }

        if (password !== passwordConfirm) {
          throw new Error("Konfirmasi password tidak sama.");
        }
      }

      const roomIDs =
        role === "ANGGOTA"
          ? [...form.querySelectorAll('input[name="room_ids"]:checked')].map(
              (input) => Number(input.value),
            )
          : [];

      const payload = {
        name,
        email,
        title,
        nip,
        role,
        status,
        assigned_room_ids: roomIDs,
      };

      if (password) {
        payload.password = password;
      }

      if (isEdit) {
        await api(`/users/${user.id}`, {
          method: "PUT",
          body: payload,
        });

        toast("Pengguna berhasil diperbarui", "success");
      } else {
        await api("/users", {
          method: "POST",
          body: payload,
        });

        toast("Pengguna berhasil dibuat", "success");
        page = 1;
      }

      await load();
    },
  });

  modal.querySelector(".modal")?.classList.add("create-form-modal");

  const form = modal.querySelector(".modal-form");

  if (!form) return;

  const roleInputs = [...form.querySelectorAll('input[name="role"]')];
  const roomSection = form.querySelector("#user-rooms-group");
  const roomToolbar = roomSection?.querySelector(".cu-room-toolbar");
  const roomList = roomSection?.querySelector(".cu-rooms");
  const roomNote = roomSection?.querySelector(".cu-room-note");
  const roomChecks = [...form.querySelectorAll('input[name="room_ids"]')];
  const roomCount = form.querySelector("#user-room-count");
  const roomSearch = form.querySelector("#user-room-search");

  const checkedRooms = () =>
    roomChecks.filter((input) => input.checked && !input.disabled).length;

  const updateRoomCount = () => {
    if (!roomCount) return;

    const count = checkedRooms();
    roomCount.textContent = count
      ? `${count} ruangan dipilih`
      : "Belum ada ruangan dipilih";
  };

  const updateRoomState = () => {
    const role = form.querySelector('input[name="role"]:checked')?.value;
    const isAnggota = role === "ANGGOTA";

    if (roomToolbar) roomToolbar.style.display = isAnggota ? "" : "none";
    if (roomList) roomList.style.display = isAnggota ? "" : "none";
    roomNote?.classList.toggle("is-visible", !isAnggota);

    const nipGroup = form.querySelector("#user-nip-group");
    if (nipGroup) nipGroup.style.display = isAnggota ? "none" : "";

    roomChecks.forEach((input) => {
      input.disabled = !isAnggota;
    });

    updateRoomCount();
  };

  roleInputs.forEach((input) => {
    input.addEventListener("change", updateRoomState);
  });

  roomChecks.forEach((input) => {
    input.addEventListener("change", updateRoomCount);
  });

  roomSearch?.addEventListener("input", () => {
    const query = roomSearch.value.trim().toLowerCase();

    form.querySelectorAll(".cu-room").forEach((room) => {
      room.classList.toggle(
        "is-hidden",
        Boolean(query) && !room.dataset.roomSearch.includes(query),
      );
    });
  });

  form.querySelectorAll("[data-room-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const shouldCheck = button.dataset.roomAction === "all";

      form
        .querySelectorAll(".cu-room:not(.is-hidden) input[name='room_ids']")
        .forEach((input) => {
          if (!input.disabled) input.checked = shouldCheck;
        });

      updateRoomCount();
    });
  });

  form.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = form.querySelector(`#${button.dataset.passwordToggle}`);

      if (!input) return;

      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.innerHTML = show ? eyeOffIcon : eyeIcon;
      button.setAttribute(
        "aria-label",
        show ? "Sembunyikan password" : "Tampilkan password",
      );
    });
  });

  if (isEdit) {
    const setValue = (selector, value) => {
      const input = form.querySelector(selector);
      if (input) input.value = value;
    };

    setValue("#user-name", user.name || "");
    setValue("#user-email", user.email || "");
    setValue("#user-title", user.title || "");
    setValue("#user-nip", user.nip || "");

    const roleValue = normalizeRole(user.role);
    const roleInput = form.querySelector(
      `input[name="role"][value="${roleValue}"]`,
    );
    if (roleInput) roleInput.checked = true;

    const statusInput = form.querySelector("#user-status");
    if (statusInput) {
      statusInput.value =
        String(user.status || "ACTIVE").toUpperCase() === "INACTIVE"
          ? "INACTIVE"
          : "ACTIVE";
    }

    const assigned = new Set(
      (Array.isArray(user.assigned_room_ids) ? user.assigned_room_ids : []).map(
        Number,
      ),
    );

    roomChecks.forEach((input) => {
      input.checked = assigned.has(Number(input.value));
    });
  }

  updateRoomState();
}

async function load() {
  const [usersResponse, roomsResponse] = await Promise.all([
    api("/users"),
    api("/rooms"),
  ]);

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

  const addUserButton = document.getElementById("add-user");

  if (addUserButton && hasPermission("users.manage")) {
    addUserButton.classList.remove("hidden");
    addUserButton.addEventListener("click", () => openUserForm());
  }

  document.getElementById("users-table").addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-user]");
    if (editButton) {
      const userID = Number(editButton.getAttribute("data-edit-user"));
      const target = users.find((item) => Number(item.id) === userID);

      if (target) openUserForm(target);
      return;
    }

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
