import { requireAuth, api } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml } from "../utils/format.js";

import {
  btn,
  btnSecondary,
  section,
  sectionHeader,
  sectionBody,
  empty,
  alert as alertClass,
} from "../ui.js";

import { SignaturePad } from "../signature.js";

let rooms = [];
let definitions = [];
let selectedRoom = null;

let signaturePad = null;
let signaturePayload = null;

const draftDays = new Map();

let selectedDate = "";
let monthKey = "";

// =========================================================
// UTILITIES
// =========================================================

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

function countCompleted(items) {
  return items.filter((item) => Boolean(item.status)).length;
}

// =========================================================
// PAGE
// =========================================================

function renderPage() {
  const root = document.getElementById("detail-root");

  root.innerHTML = `
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

    <div id="bulk-create-form" hidden>
      <section class="${section}" style="margin-top:12px">
        <div class="${sectionHeader}">
          Pemeriksaan Harian
        </div>

        <div class="${sectionBody}">
          <div class="inspection-selected-room">
            <span>Ruangan</span>
            <strong id="selected-room-name">-</strong>
            <div id="selected-room-code"></div>
          </div>

          <p class="page-meta">
            Pilih tanggal pada kalender untuk mengisi checklist.
            Semua perubahan akan dikirim bersama saat membuat
            pemeriksaan.
          </p>

          <div id="create-calendar"></div>
        </div>

        <div class="${sectionBody}">
          <h3 id="selected-date-title"></h3>
          <p
            id="selected-date-progress"
            class="page-meta"
            aria-live="polite"
          ></p>
        </div>

        <div id="create-daily-checklist"></div>
      </section>

      <section class="${section}" style="margin-top:12px">
        <div class="${sectionHeader}">
          Catatan
        </div>

        <div class="${sectionBody}">
          <div class="inspection-form-group">
            <label for="insp-notes">
              Catatan Pemeriksaan Bulanan
            </label>

            <textarea
              id="insp-notes"
              rows="4"
              placeholder="Masukkan catatan umum pemeriksaan bulanan..."
            ></textarea>
          </div>
        </div>
      </section>

      <section class="${section}" style="margin-top:12px">
        <div class="${sectionHeader}">
          Tanda Tangan
        </div>

        <div class="${sectionBody}">
          <div class="inspection-form-group">
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
    </div>
  `;

  // Remove an old modal if this page is rendered again.
  document.getElementById("signature-modal")?.remove();

  // Keep the modal directly under body so the overlay is
  // independent of the page layout.
  document.body.insertAdjacentHTML(
    "beforeend",
    `
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
    `,
  );

  document
    .getElementById("btn-cancel-create")
    .addEventListener("click", () => {
      window.location.href = "latest.html";
    });
}

// =========================================================
// LOAD ROOMS
// =========================================================

async function loadRooms() {
  const response = await api("/rooms");
  rooms = unwrapArray(response);

  const select = document.getElementById("sel-room");

  select.innerHTML = `
    <option value="">Pilih ruangan</option>

    ${rooms
      .map(
        (room) => `
          <option value="${escapeHtml(String(room.id))}">
            ${escapeHtml(roomName(room))}
            ${
              roomCode(room)
                ? `(${escapeHtml(roomCode(room))})`
                : ""
            }
          </option>
        `,
      )
      .join("")}
  `;

  if (!rooms.length) {
    select.innerHTML = `
      <option value="">Tidak ada ruangan tersedia</option>
    `;
  }
}

// =========================================================
// LOAD CHECKLIST DEFINITIONS
// =========================================================

async function loadChecklistForRoom() {
  const roomID = Number(
    document.getElementById("sel-room").value,
  );

  const month =
    document.getElementById("inspection-month").value;

  if (!roomID) {
    toast("Pilih ruangan terlebih dahulu.", "error");
    return;
  }

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    toast("Pilih bulan pemeriksaan yang valid.", "error");
    return;
  }

  const room = rooms.find(
    (item) => Number(item.id) === roomID,
  );

  if (!room) {
    toast("Ruangan tidak ditemukan.", "error");
    return;
  }

  const response = await api("/checklist-items", {
    query: {
      room_type: room.room_type || undefined,
    },
  });

  const loadedDefinitions = unwrapArray(response);

  if (!loadedDefinitions.length) {
    toast("Tidak ada checklist untuk ruangan ini.", "error");
    return;
  }

  selectedRoom = room;
  definitions = loadedDefinitions;
  monthKey = month;

  // Discard drafts when the user starts a new room/month session.
  draftDays.clear();
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

  document
    .getElementById("bulk-create-form")
    .scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
}

// =========================================================
// DATES AND DRAFTS
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
  }));
}

function captureCurrentDay(force = false) {
  if (!selectedDate || !definitions.length) return;

  const items = currentDayItems();

  const alreadyExists = draftDays.has(selectedDate);
  const hasContent = items.some((item) => item.status);

  if (force || alreadyExists || hasContent) {
    draftDays.set(selectedDate, {
      answer_date: selectedDate,
      items,
    });
  }
}

function getDraftItems(date) {
  const saved = draftDays.get(date);

  if (saved) {
    return saved.items;
  }

  return definitions.map((item) => ({
    checklist_item_id: Number(item.id),
    status: null,
  }));
}

// =========================================================
// MONTHLY CALENDAR
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

  const weekdays = [
    "Min",
    "Sen",
    "Sel",
    "Rab",
    "Kam",
    "Jum",
    "Sab",
  ];

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
      const complete =
        definitions.length > 0 &&
        completed === definitions.length;

      let statusText = "—";

      if (draft) {
        statusText = complete
          ? "Belum disimpan · Lengkap"
          : `${completed}/${definitions.length} · Belum disimpan`;
      }

      return `
        <button
          type="button"
          class="inspection-calendar__day${selected ? " is-selected" : ""}${draft ? " is-dirty" : ""}"
          data-create-date="${date}"
          aria-pressed="${selected}"
          aria-label="Tanggal ${day}, ${escapeHtml(monthTitle)}"
          title="${draft ? "Perubahan belum disimpan" : "Belum diisi"}"
        >
          <span class="inspection-calendar__day-number">
            ${day}
          </span>

          <span class="inspection-calendar__day-status">
            <span
              class="inspection-calendar__dot${draft ? " inspection-calendar__dot--pending" : ""}${complete ? " inspection-calendar__dot--complete" : ""}"
            ></span>

            <span class="inspection-calendar__day-status-text">
              ${escapeHtml(statusText)}
            </span>
          </span>
        </button>
      `;
    },
  ).join("");

  document.getElementById("create-calendar").innerHTML = `
    <section
      class="inspection-calendar"
      aria-label="Kalender pemeriksaan bulanan"
    >
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

      <div class="inspection-calendar__weekdays" aria-hidden="true">
        ${weekdays
          .map(
            (day, index) => `
              <div
                class="inspection-calendar__weekday${index === 0 ? " is-sunday" : ""}"
              >
                ${day}
              </div>
            `,
          )
          .join("")}
      </div>

      <div class="inspection-calendar__grid">
        ${blanks}
        ${days}
      </div>

      <div class="inspection-calendar__legend">
        <span class="inspection-calendar__legend-item">
          <span
            class="inspection-calendar__dot inspection-calendar__dot--pending"
          ></span>
          Belum disimpan
        </span>

        <span class="inspection-calendar__legend-item">
          <span class="inspection-calendar__dot"></span>
          Belum diisi
        </span>

        <span class="inspection-calendar__legend-item">
          <span class="inspection-calendar__legend-selected"></span>
          Tanggal dipilih
        </span>
      </div>

      ${
        draftDays.size
          ? `
            <p class="inspection-calendar__pending-note">
              ${draftDays.size} tanggal memiliki draft yang akan
              disimpan saat pemeriksaan dibuat.
            </p>
          `
          : ""
      }
    </section>
  `;

  document
    .querySelectorAll("[data-create-date]")
    .forEach((button) => {
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

  const sortedDefinitions = [...definitions].sort(
    (a, b) =>
      (a.order_number ?? 999) -
      (b.order_number ?? 999),
  );

  document.getElementById("selected-date-title").textContent =
    `Checklist tanggal ${selectedDate}`;

  document.getElementById("selected-date-progress").textContent =
    `${countCompleted(items)} dari ${definitions.length} item dinilai untuk ${selectedDate}.`;

  document.getElementById("create-daily-checklist").innerHTML = `
    <div class="${sectionBody}" style="padding:0">
      <div class="table-wrap">
        <table class="data" style="border:none">
          <thead>
            <tr>
              <th>Item</th>
              <th>Penilaian</th>
            </tr>
          </thead>

          <tbody>
            ${
              sortedDefinitions.length
                ? sortedDefinitions
                    .map((definition) => {
                      const answer = itemMap.get(
                        Number(definition.id),
                      );

                      const currentStatus =
                        answer?.status || "";

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
                            <select
                              data-status
                              aria-label="Penilaian ${escapeHtml(definition.name || "item checklist")}"
                            >
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
                        </tr>
                      `;
                    })
                    .join("")
                : `
                  <tr>
                    <td colspan="2" class="${empty}">
                      Tidak ada item checklist.
                    </td>
                  </tr>
                `
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  const checklist = document.getElementById(
    "create-daily-checklist",
  );

  checklist.oninput = (event) => {
    if (!event.target.matches("[data-status]")) return;

    captureCurrentDay(true);

    document.getElementById(
      "selected-date-progress",
    ).textContent =
      `${countCompleted(draftDays.get(selectedDate)?.items || [])} dari ${definitions.length} item dinilai untuk ${selectedDate}.`;

    // Re-render only the calendar; do not replace the active checklist.
    renderCreateCalendar();
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

    if (signaturePad) {
      signaturePad.clear();
    }
  }

  document
    .getElementById("btn-open-signature")
    .addEventListener("click", openModal);

  document
    .getElementById("btn-close-signature")
    .addEventListener("click", closeModal);

  document
    .getElementById("btn-cancel-signature")
    .addEventListener("click", closeModal);

  document
    .getElementById("btn-clear-signature")
    .addEventListener("click", () => {
      if (signaturePad) {
        signaturePad.clear();
      }
    });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      modal.classList.contains("is-open")
    ) {
      closeModal();
    }
  });

  document
    .getElementById("btn-save-signature")
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

        document.getElementById(
          "signature-status",
        ).textContent = "Tanda tangan sudah disimpan";

        document.getElementById(
          "btn-open-signature",
        ).textContent = "Ubah Tanda Tangan";

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
// CREATE INSPECTION
// =========================================================

function setupCreateInspection() {
  document
    .getElementById("btn-create-inspection")
    .addEventListener("click", async (event) => {
      const button = event.currentTarget;

      captureCurrentDay();

      if (!selectedRoom) {
        toast(
          "Pilih ruangan dan muat checklist terlebih dahulu.",
          "error",
        );
        return;
      }

      if (!signaturePayload) {
        toast("Tanda tangan petugas wajib diisi.", "error");
        return;
      }

      const days = [...draftDays.values()].sort(
        (a, b) =>
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
        day.items.some((item) => Boolean(item.status)),
      );

      if (!hasAnyAnswer) {
        toast(
          "Isi minimal satu penilaian sebelum membuat pemeriksaan.",
          "error",
        );
        return;
      }

      const payload = {
        room_id: Number(selectedRoom.id),
        inspection_month: `${monthKey}-01T00:00:00Z`,
        notes: document
          .getElementById("insp-notes")
          .value.trim(),
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

        toast(
          "Pemeriksaan dan checklist berhasil dibuat.",
          "success",
        );

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
    showPageError(
      error.message || "Gagal memuat daftar ruangan.",
    );
    return;
  }

  document
    .getElementById("btn-load-checklist")
    .addEventListener("click", async (event) => {
      const button = event.currentTarget;

      button.disabled = true;
      button.textContent = "Memuat...";

      try {
        await loadChecklistForRoom();
      } catch (error) {
        toast(
          error.message || "Gagal memuat checklist.",
          "error",
        );
      } finally {
        button.disabled = false;
        button.textContent = "Muat Checklist";
      }
    });

  setupSignatureModal();
  setupCreateInspection();
}

main().catch((error) => {
  console.error("Create inspection error:", error);

  showPageError(
    error.message || "Gagal memuat halaman pemeriksaan.",
  );
});