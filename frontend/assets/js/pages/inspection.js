import { requireAuth, api } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml } from "../utils/format.js";
import {
  btn,
  btnSecondary,
  section,
  sectionHeader,
  sectionBody,
  alert as alertClass,
} from "../ui.js";
import { SignaturePad } from "../signature.js";

let rooms = [];
let definitions = [];
let selectedRoom = null;

let signaturePad = null;
let signaturePayload = null;

// Key: YYYY-MM-DD
// Value: { answer_date, items: [{ checklist_item_id, status, notes }] }
const draftDays = new Map();

let selectedDate = "";
let monthKey = "";

function currentMonthValue() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;
}

function unwrapArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

function roomName(room) {
  return room.name || room.room_name || `Ruangan #${room.id}`;
}

function roomCode(room) {
  return room.code || room.room_code || "";
}

function showPageError(message) {
  const root = document.getElementById("detail-root");

  if (!root) return;

  root.innerHTML = `
    <div class="${alertClass("error")}">
      ${escapeHtml(message)}
    </div>
  `;
}

// =========================================================
// PAGE
// =========================================================

function renderPage() {
  document.getElementById("detail-root").innerHTML = `
    <h1 class="inspection-page-title">Buat Pemeriksaan</h1>

    <p class="inspection-page-description">
      Isi checklist pada tanggal yang diperlukan. Semua tanggal
      akan disimpan sekaligus saat membuat pemeriksaan.
    </p>

    <section class="${section}">
      <div class="${sectionHeader}">
        Ruangan dan Periode
      </div>

      <div class="${sectionBody}">
        <div class="inspection-form-grid">
          <div class="inspection-form-group">
            <label for="sel-room">Ruangan *</label>

            <select id="sel-room" required>
              <option value="">Memuat ruangan...</option>
            </select>
          </div>

          <div class="inspection-form-group">
            <label for="inspection-month">
              Bulan Pemeriksaan *
            </label>

            <input
              type="month"
              id="inspection-month"
              value="${currentMonthValue()}"
              required
            />
          </div>
        </div>

        <div class="inspection-form-actions">
          <button
            type="button"
            class="${btn}"
            id="btn-load-checklist"
          >
            Muat Checklist
          </button>
        </div>
      </div>
    </section>

    <section
      class="${section}"
      id="bulk-create-form"
      style="margin-top:20px"
      hidden
    >
      <div class="${sectionHeader}">
        Checklist Bulanan
      </div>

      <div class="${sectionBody}">
        <div class="inspection-selected-room">
          <span>Ruangan</span>
          <strong id="selected-room-name">-</strong>
          <div id="selected-room-code"></div>
        </div>

        <p class="page-meta">
          Pilih tanggal, isi penilaian yang diperlukan, kemudian
          pilih tanggal berikutnya. Perubahan disimpan sementara
          di browser sampai tombol Buat Pemeriksaan ditekan.
        </p>

        <div id="create-calendar"></div>

        <div style="margin-top:20px">
          <h3 id="selected-date-title"></h3>
          <p id="selected-date-progress" class="page-meta"></p>

          <div id="create-daily-checklist"></div>
        </div>
      </div>

      <div class="${sectionHeader}">
        Informasi dan Tanda Tangan
      </div>

      <div class="${sectionBody}">
        <div class="inspection-form-group">
          <label for="insp-notes">Catatan Pemeriksaan</label>

          <textarea
            id="insp-notes"
            rows="4"
            placeholder="Catatan umum pemeriksaan..."
          ></textarea>
        </div>

        <div class="inspection-form-group" style="margin-top:20px">
          <label>Tanda Tangan Petugas</label>

          <div class="signature-action">
            <button
              type="button"
              class="${btnSecondary}"
              id="btn-open-signature"
            >
              Tambah Tanda Tangan
            </button>

            <span id="signature-status" aria-live="polite">
              Belum ada tanda tangan
            </span>
          </div>
        </div>

        <div class="inspection-form-actions">
          <button
            type="button"
            class="${btnSecondary}"
            id="btn-cancel-create"
          >
            Batal
          </button>

          <button
            type="button"
            class="${btn}"
            id="btn-create-inspection"
          >
            Buat Pemeriksaan
          </button>
        </div>
      </div>
    </section>

    <!-- Anggota signature modal -->
    <div
      class="kepala-sign-modal"
      id="signature-modal"
      aria-hidden="true"
    >
      <div
        class="kepala-sign-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-modal-title"
      >
        <div class="kepala-sign-modal-header">
          <div>
            <h2 id="signature-modal-title">
              Tanda Tangan Petugas
            </h2>

            <p>Bubuhkan tanda tangan pada area berikut.</p>
          </div>

          <button
            type="button"
            class="kepala-sign-modal-close"
            id="btn-close-signature"
            aria-label="Tutup modal"
          >
            &times;
          </button>
        </div>

        <div class="kepala-sign-modal-body">
          <div id="sig-root"></div>

          <p class="signature-hint">
            Gunakan mouse atau sentuhan layar untuk membuat tanda tangan.
          </p>
        </div>

        <div class="kepala-sign-modal-footer">
          <button
            type="button"
            class="${btnSecondary}"
            id="btn-clear-signature"
          >
            Hapus
          </button>

          <button
            type="button"
            class="${btnSecondary}"
            id="btn-cancel-signature"
          >
            Batal
          </button>

          <button
            type="button"
            class="${btn}"
            id="btn-save-signature"
          >
            Simpan Tanda Tangan
          </button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-cancel-create")
    .addEventListener("click", () => {
      window.location.href = "latest.html";
    });
}

// =========================================================
// LOAD DATA
// =========================================================

async function loadRooms() {
  const response = await api("/rooms");
  rooms = unwrapArray(response);

  const select = document.getElementById("sel-room");

  select.innerHTML = `
    <option value="">Pilih ruangan</option>

    ${rooms.map((room) => `
      <option value="${escapeHtml(String(room.id))}">
        ${escapeHtml(roomName(room))}
        ${roomCode(room) ? `(${escapeHtml(roomCode(room))})` : ""}
      </option>
    `).join("")}
  `;

  if (!rooms.length) {
    select.innerHTML = `
      <option value="">Tidak ada ruangan tersedia</option>
    `;
  }
}

async function loadChecklistForRoom() {
  const roomID = Number(
    document.getElementById("sel-room").value,
  );

  const month = document.getElementById("inspection-month").value;

  if (!roomID) {
    toast("Pilih ruangan terlebih dahulu.", "error");
    return;
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    toast("Pilih bulan pemeriksaan yang valid.", "error");
    return;
  }

  selectedRoom = rooms.find(
    (room) => Number(room.id) === roomID,
  );

  if (!selectedRoom) {
    toast("Ruangan tidak ditemukan.", "error");
    return;
  }

  monthKey = month;

  const response = await api("/checklist-items", {
    query: {
      room_type: selectedRoom.room_type || undefined,
    },
  });

  definitions = unwrapArray(response);

  if (!definitions.length) {
    toast("Tidak ada checklist untuk ruangan ini.", "error");
    return;
  }

  // Reset only when starting a new creation session for a room/month.
  draftDays.clear();

  const [year, monthNumber] = monthKey.split("-").map(Number);
  selectedDate = `${monthKey}-01`;

  document.getElementById("selected-room-name").textContent =
    roomName(selectedRoom);

  document.getElementById("selected-room-code").textContent =
    roomCode(selectedRoom)
      ? `Kode: ${roomCode(selectedRoom)}`
      : "";

  document.getElementById("bulk-create-form").hidden = false;

  renderCreateCalendar();
  renderCreateDay();

  document.getElementById("bulk-create-form").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// =========================================================
// LOCAL DRAFTS
// =========================================================

function getDaysInMonth() {
  const [year, month] = monthKey.split("-").map(Number);

  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateKey(day) {
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function currentDayItems() {
  const rows = [
    ...document.querySelectorAll(
      "#create-daily-checklist tr[data-item-id]",
    ),
  ];

  return rows.map((row) => ({
    checklist_item_id: Number(row.dataset.itemId),
    status: row.querySelector("[data-status]")?.value || null,
    notes: row.querySelector("[data-notes]")?.value.trim() || "",
  }));
}

function captureCurrentDay(force = false) {
  if (!selectedDate || !definitions.length) return;

  const items = currentDayItems();

  const hasExistingDraft = draftDays.has(selectedDate);

  const hasContent = items.some(
    (item) => item.status || item.notes,
  );

  if (force || hasExistingDraft || hasContent) {
    draftDays.set(selectedDate, {
      answer_date: selectedDate,
      items,
    });
  }
}

function countCompleted(items) {
  return items.filter((item) => Boolean(item.status)).length;
}

function getDraftItems(date) {
  const saved = draftDays.get(date);

  if (saved) {
    return saved.items;
  }

  return definitions.map((item) => ({
    checklist_item_id: Number(item.id),
    status: null,
    notes: "",
  }));
}

function updateDateTile(date) {
  const tile = document.querySelector(
    `[data-create-date="${date}"]`,
  );

  if (!tile) return;

  const draft = draftDays.get(date);
  const items = draft?.items || [];
  const completed = countCompleted(items);
  const isSelected = date === selectedDate;

  tile.classList.toggle("is-selected", isSelected);
  tile.classList.toggle("is-dirty", Boolean(draft));

  const label = tile.querySelector(
    ".inspection-calendar__day-status-text",
  );

  const dot = tile.querySelector(
    ".inspection-calendar__dot",
  );

  if (label) {
    label.textContent = draft
      ? `${completed}/${definitions.length} · Draft`
      : "—";
  }

  if (dot) {
    dot.classList.toggle(
      "inspection-calendar__dot--pending",
      Boolean(draft),
    );

    dot.classList.toggle(
      "inspection-calendar__dot--complete",
      definitions.length > 0 &&
        completed === definitions.length,
    );
  }
}

// =========================================================
// CALENDAR
// =========================================================

function renderCreateCalendar() {
  const [year, month] = monthKey.split("-").map(Number);
  const totalDays = getDaysInMonth();

  const firstWeekday = new Date(
    Date.UTC(year, month - 1, 1),
  ).getUTCDay();

  const monthTitle = new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  const weekdays = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const blanks = Array.from(
    { length: firstWeekday },
    () => `
      <div
        class="inspection-calendar__blank"
        aria-hidden="true"
      ></div>
    `,
  ).join("");

  const days = Array.from(
    { length: totalDays },
    (_, index) => {
      const day = index + 1;
      const date = dateKey(day);
      const draft = draftDays.get(date);
      const completed = countCompleted(draft?.items || []);
      const selected = date === selectedDate;

      return `
        <button
          type="button"
          class="inspection-calendar__day${selected ? " is-selected" : ""}${draft ? " is-dirty" : ""}"
          data-create-date="${date}"
          aria-pressed="${selected}"
        >
          <span class="inspection-calendar__day-number">
            ${day}
          </span>

          <span class="inspection-calendar__day-status">
            <span class="inspection-calendar__dot${draft ? " inspection-calendar__dot--pending" : ""}"></span>

            <span class="inspection-calendar__day-status-text">
              ${draft ? `${completed}/${definitions.length} · Draft` : "—"}
            </span>
          </span>
        </button>
      `;
    },
  ).join("");

  document.getElementById("create-calendar").innerHTML = `
    <section class="inspection-calendar">
      <header class="inspection-calendar__header">
        <div>
          <p class="inspection-calendar__eyebrow">
            Kalender pemeriksaan
          </p>

          <h3 class="inspection-calendar__title">
            ${escapeHtml(monthTitle)}
          </h3>

          <p class="inspection-calendar__subtitle">
            Pilih tanggal untuk mengisi checklist.
          </p>
        </div>

        <div class="inspection-calendar__summary">
          <strong>${draftDays.size}</strong>
          <span>tanggal draft</span>
        </div>
      </header>

      <div class="inspection-calendar__weekdays">
        ${weekdays.map((day) => `
          <div class="inspection-calendar__weekday">${day}</div>
        `).join("")}
      </div>

      <div class="inspection-calendar__grid">
        ${blanks}
        ${days}
      </div>

      <div class="inspection-calendar__legend">
        <span class="inspection-calendar__legend-item">
          <span class="inspection-calendar__dot inspection-calendar__dot--pending"></span>
          Ada draft
        </span>

        <span class="inspection-calendar__legend-item">
          <span class="inspection-calendar__dot"></span>
          Belum diisi
        </span>
      </div>
    </section>
  `;

  document.querySelectorAll("[data-create-date]").forEach((button) => {
    button.addEventListener("click", () => {
      captureCurrentDay();

      selectedDate = button.dataset.createDate;

      renderCreateCalendar();
      renderCreateDay();
    });
  });
}

// =========================================================
// DAILY CHECKLIST
// =========================================================

function renderCreateDay() {
  const items = getDraftItems(selectedDate);

  const itemMap = new Map(
    items.map((item) => [
      Number(item.checklist_item_id),
      item,
    ]),
  );

  document.getElementById("selected-date-title").textContent =
    `Checklist tanggal ${selectedDate}`;

  document.getElementById("selected-date-progress").textContent =
    `${countCompleted(items)} dari ${definitions.length} item dinilai.`;

  document.getElementById("create-daily-checklist").innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>Item</th>
            <th>Penilaian</th>
            <th>Catatan</th>
          </tr>
        </thead>

        <tbody>
          ${definitions.map((definition) => {
            const answer = itemMap.get(Number(definition.id));
            const currentStatus = answer?.status || "";

            return `
              <tr data-item-id="${Number(definition.id)}">
                <td>
                  <strong>
                    ${escapeHtml(definition.name || "—")}
                  </strong>

                  ${
                    definition.description
                      ? `
                        <br />
                        <small>
                          ${escapeHtml(definition.description)}
                        </small>
                      `
                      : ""
                  }
                </td>

                <td>
                  <select data-status>
                    <option
                      value=""
                      ${!currentStatus ? "selected" : ""}
                    >
                      Belum dinilai
                    </option>

                    <option
                      value="GOOD"
                      ${currentStatus === "GOOD" ? "selected" : ""}
                    >
                      Baik
                    </option>
                  </select>
                </td>

                <td>
                  <textarea
                    data-notes
                    rows="2"
                    placeholder="Catatan temuan..."
                  >${escapeHtml(answer?.notes || "")}</textarea>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  const checklist = document.getElementById("create-daily-checklist");

  checklist.oninput = (event) => {
    if (
      !event.target.matches("[data-status]") &&
      !event.target.matches("[data-notes]")
    ) {
      return;
    }

    captureCurrentDay(true);

    updateDateTile(selectedDate);

    document.getElementById("selected-date-progress").textContent =
      `${countCompleted(draftDays.get(selectedDate)?.items || [])} dari ${definitions.length} item dinilai.`;

    const summary = document.querySelector(
      ".inspection-calendar__summary strong",
    );

    if (summary) {
      summary.textContent = String(draftDays.size);
    }
  };

  checklist.onchange = checklist.oninput;
}

// =========================================================
// SIGNATURE MODAL
// =========================================================

function setupSignatureModal() {
  const modal = document.getElementById("signature-modal");

  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");

    if (!signaturePad) {
      signaturePad = new SignaturePad(
        document.getElementById("sig-root"),
      );
    } else {
      signaturePad.clear();
    }
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");

    if (signaturePad) signaturePad.clear();
  }

  document.getElementById("btn-open-signature")
    .addEventListener("click", openModal);

  document.getElementById("btn-close-signature")
    .addEventListener("click", closeModal);

  document.getElementById("btn-cancel-signature")
    .addEventListener("click", closeModal);

  document.getElementById("btn-clear-signature")
    .addEventListener("click", () => {
      if (signaturePad) signaturePad.clear();
    });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      modal.classList.contains("is-open")
    ) {
      closeModal();
    }
  });

  document.getElementById("btn-save-signature")
    .addEventListener("click", async (event) => {
      const button = event.currentTarget;

      if (!signaturePad || signaturePad.isEmpty()) {
        toast("Tanda tangan wajib diisi.", "error");
        return;
      }

      button.disabled = true;

      try {
        const payload = await signaturePad.getPayload();

        if (
          !payload ||
          typeof payload.image_data_url !== "string" ||
          !payload.image_data_url.startsWith("data:image/") ||
          payload.image_data_url.length < 80
        ) {
          toast("Tanda tangan tidak valid.", "error");
          return;
        }

        signaturePayload = payload;

        document.getElementById("signature-status").textContent =
          "Tanda tangan sudah disimpan";

        document.getElementById("btn-open-signature").textContent =
          "Ubah Tanda Tangan";

        closeModal();

        toast("Tanda tangan berhasil disimpan.", "success");
      } catch (error) {
        toast(
          error.message || "Gagal menyimpan tanda tangan.",
          "error",
        );
      } finally {
        button.disabled = false;
      }
    });
}

// =========================================================
// CREATE INSPECTION WITH ALL DRAFT DATES
// =========================================================

function setupCreateInspection() {
  document.getElementById("btn-create-inspection")
    .addEventListener("click", async (event) => {
      const button = event.currentTarget;

      // Preserve the currently displayed date.
      captureCurrentDay();

      if (!selectedRoom) {
        toast("Pilih ruangan dan muat checklist terlebih dahulu.", "error");
        return;
      }

      if (!signaturePayload) {
        toast("Tanda tangan petugas wajib diisi.", "error");
        return;
      }

      const days = [...draftDays.values()].sort((a, b) =>
        a.answer_date.localeCompare(b.answer_date),
      );

      if (!days.length) {
        toast(
          "Isi checklist pada minimal satu tanggal sebelum membuat pemeriksaan.",
          "error",
        );
        return;
      }

      const hasAnyAnswer = days.some((day) =>
        day.items.some((item) => item.status || item.notes),
      );

      if (!hasAnyAnswer) {
        toast(
          "Isi minimal satu penilaian atau catatan checklist.",
          "error",
        );
        return;
      }

      const payload = {
        room_id: Number(selectedRoom.id),
        inspection_month: `${monthKey}-01T00:00:00Z`,
        notes: document.getElementById("insp-notes").value.trim(),
        signature: signaturePayload,
        days,
      };

      button.disabled = true;
      button.textContent = "Membuat pemeriksaan...";

      try {
        const response = await api("/inspections", {
          method: "POST",
          body: payload,
        });

        const inspection =
          response?.data?.inspection ??
          response?.data ??
          response?.inspection ??
          response;

        if (!inspection?.id) {
          throw new Error(
            "Server tidak mengembalikan ID pemeriksaan.",
          );
        }

        toast("Pemeriksaan dan checklist berhasil dibuat.", "success");

        window.location.href =
          `inspection-detail.html?id=${encodeURIComponent(inspection.id)}`;
      } catch (error) {
        console.error("Create inspection error:", error);

        toast(
          error.message || "Gagal membuat pemeriksaan.",
          "error",
        );
      } finally {
        button.disabled = false;
        button.textContent = "Buat Pemeriksaan";
      }
    });
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("latest.html", {
    breadcrumb: `
      <a href="latest.html">Pemeriksaan</a>
      <span>/</span>
      Buat Pemeriksaan
    `,
    mobileBack: {
      href: "latest.html",
      label: "Kembali",
    },
  });

  renderPage();

  try {
    await loadRooms();
  } catch (error) {
    showPageError(error.message || "Gagal memuat daftar ruangan.");
    return;
  }

  document.getElementById("btn-load-checklist")
    .addEventListener("click", async (event) => {
      const button = event.currentTarget;

      button.disabled = true;
      button.textContent = "Memuat...";

      try {
        await loadChecklistForRoom();
      } catch (error) {
        toast(error.message || "Gagal memuat checklist.", "error");
      } finally {
        button.disabled = false;
        button.textContent = "Muat Checklist";
      }
    });

  setupSignatureModal();
  setupCreateInspection();
}

main().catch((error) => {
  console.error(error);

  showPageError(
    error.message || "Gagal memuat halaman pemeriksaan.",
  );
});