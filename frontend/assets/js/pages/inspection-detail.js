import {
  requireAuth,
  api,
  hasPermission,
  downloadInspectionPdf,
} from "../api.js";

import { mountShell, toast } from "../components/shell.js";

import {
  qs,
  escapeHtml,
  formatDate,
  statusBadge,
} from "../utils/format.js";

import {
  btn,
  btnSecondary,
  empty,
  textarea,
  section,
  sectionHeader,
  sectionBody,
  alert as alertClass,
} from "../ui.js";

import { SignaturePad } from "../signature.js";

// ==================================================
// HELPERS
// ==================================================

function sigBlock(title, sig) {
  if (!sig) {
    return `
      <div class="sig-card">
        <div class="sig-label">${escapeHtml(title)}</div>
        <p class="page-meta">Belum ada tanda tangan</p>
      </div>
    `;
  }

  const src =
    typeof sig.image_data_url === "string" &&
    sig.image_data_url.length > 80
      ? sig.image_data_url
      : "";

  return `
    <div class="sig-card">
      <div class="sig-label">${escapeHtml(title)}</div>

      ${
        src
          ? `
            <img
              class="sig-image"
              src="${src}"
              alt="Tanda tangan ${escapeHtml(title)}"
            />
          `
          : `
            <p class="page-meta">
              Gambar tanda tangan tidak tersedia
            </p>
          `
      }

      <strong>${escapeHtml(sig.signer_name || "")}</strong>

      <div class="page-meta">
        ${escapeHtml(sig.signer_title || "")}
        · ${formatDate(sig.signed_at)}
      </div>
    </div>
  `;
}

function showError(message) {
  const actions = document.getElementById("header-actions");
  const root = document.getElementById("detail-root");

  if (actions) actions.innerHTML = "";

  if (root) {
    root.innerHTML = `
      <div class="${alertClass("error")}">
        ${escapeHtml(message)}
      </div>

      <p class="page-meta" style="margin-top:12px">
        <a href="latest.html">
          Kembali ke daftar pemeriksaan
        </a>
      </p>
    `;
  }
}

// ==================================================
// DAILY CHECKLIST AND MONTHLY CALENDAR
// ==================================================

async function setupDailyChecklist(inspection) {
  const dateInput = document.getElementById("answer-date");
  const dateList = document.getElementById("daily-date-list");
  const checklistContainer =
    document.getElementById("daily-checklist");
  const progress = document.getElementById("day-progress");
  const saveButton = document.getElementById("btn-save-day");

  const isEditable =
    String(inspection.status || "").trim().toUpperCase() === "OPEN";

  if (
    !dateInput ||
    !dateList ||
    !checklistContainer ||
    !progress ||
    !saveButton
  ) {
    throw new Error("Elemen pemeriksaan harian tidak ditemukan.");
  }

  saveButton.hidden = !isEditable;

  const monthKey = String(
    inspection.inspection_month || "",
  ).slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("Bulan pemeriksaan tidak valid.");
  }

  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  dateInput.min = `${monthKey}-01`;
  dateInput.max =
    `${monthKey}-${String(lastDay).padStart(2, "0")}`;

  // Load checklist definitions.
  const { data: definitionData } = await api("/checklist-items", {
    query: {
      room_type: inspection.room?.room_type || undefined,
    },
  });

  const definitions = Array.isArray(definitionData)
    ? definitionData
    : [];

  // Existing answers for the inspection.
  let answers =
    Array.isArray(inspection.checklist_detail) &&
    inspection.checklist_detail.length
      ? inspection.checklist_detail
      : Array.isArray(inspection.checklist)
        ? inspection.checklist
        : [];

  const getAnswerDate = (answer) =>
    String(answer.answer_date || "").slice(0, 10);

  const savedDates = [
    ...new Set(
      answers
        .map(getAnswerDate)
        .filter((date) => date.startsWith(`${monthKey}-`)),
    ),
  ].sort();

  dateInput.value = savedDates[0] || `${monthKey}-01`;

  function getAnswersForDate(date) {
    return answers.filter(
      (answer) => getAnswerDate(answer) === date,
    );
  }

  function getProgress(date) {
    const dayAnswers = getAnswersForDate(date);

    const answeredIDs = new Set(
      dayAnswers
        .filter((answer) => Boolean(answer.status))
        .map((answer) => Number(answer.checklist_item_id)),
    );

    const total = definitions.length;
    const completed = answeredIDs.size;

    if (total === 0 || completed === 0) {
      return {
        completed,
        total,
        label: "Belum diisi",
      };
    }

    if (completed >= total) {
      return {
        completed,
        total,
        label: "Lengkap",
      };
    }

    return {
      completed,
      total,
      label: `Sebagian (${completed}/${total})`,
    };
  }

  // --------------------------------------------------
  // RENDER CALENDAR
  // --------------------------------------------------

  function renderDateList() {
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

    const datesWithAnswers = Array.from(
      { length: lastDay },
      (_, index) => {
        const date =
          `${monthKey}-${String(index + 1).padStart(2, "0")}`;

        return getAnswersForDate(date).length > 0
          ? date
          : null;
      },
    ).filter(Boolean);

    const blanks = Array.from(
      { length: firstWeekday },
      () => `
        <div
          class="inspection-calendar__blank"
          aria-hidden="true"
        ></div>
      `,
    ).join("");

    const dayCells = Array.from(
      { length: lastDay },
      (_, index) => {
        const day = index + 1;

        const date =
          `${monthKey}-${String(day).padStart(2, "0")}`;

        const dayProgress = getProgress(date);
        const selected = date === dateInput.value;

        const hasAnswers =
          dayProgress.completed > 0 ||
          getAnswersForDate(date).length > 0;

        const complete =
          dayProgress.total > 0 &&
          dayProgress.completed >= dayProgress.total;

        const stateText = complete
          ? "Lengkap"
          : dayProgress.completed > 0
            ? `${dayProgress.completed}/${dayProgress.total}`
            : "—";

        return `
          <button
            type="button"
            class="inspection-calendar__day${
              selected ? " is-selected" : ""
            }"
            data-edit-date="${date}"
            aria-pressed="${selected}"
            aria-label="Tanggal ${day}, ${monthTitle}. ${escapeHtml(
              dayProgress.label,
            )}"
            title="${escapeHtml(dayProgress.label)}"
          >
            <span class="inspection-calendar__day-number">
              ${day}
            </span>

            <span class="inspection-calendar__day-status">
              <span
                class="inspection-calendar__dot${
                  hasAnswers
                    ? " inspection-calendar__dot--saved"
                    : ""
                }${
                  complete
                    ? " inspection-calendar__dot--complete"
                    : ""
                }"
              ></span>

              <span class="inspection-calendar__day-status-text">
                ${escapeHtml(stateText)}
              </span>
            </span>
          </button>
        `;
      },
    ).join("");

    dateList.innerHTML = `
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
              Pilih tanggal untuk melihat atau mengubah checklist.
            </p>
          </div>

          <div
            class="inspection-calendar__summary"
            aria-label="Jumlah tanggal yang memiliki jawaban"
          >
            <strong>${datesWithAnswers.length}</strong>
            <span>hari tersimpan</span>
          </div>
        </header>

        <div
          class="inspection-calendar__weekdays"
          aria-hidden="true"
        >
          ${weekdays
            .map(
              (day, index) => `
                <div
                  class="inspection-calendar__weekday${
                    index === 0 ? " is-sunday" : ""
                  }"
                >
                  ${day}
                </div>
              `,
            )
            .join("")}
        </div>

        <div class="inspection-calendar__grid">
          ${blanks}
          ${dayCells}
        </div>

        <div class="inspection-calendar__legend">
          <span class="inspection-calendar__legend-item">
            <span
              class="inspection-calendar__dot inspection-calendar__dot--saved"
            ></span>
            Ada jawaban
          </span>

          <span class="inspection-calendar__legend-item">
            <span class="inspection-calendar__dot"></span>
            Belum diisi
          </span>

          <span class="inspection-calendar__legend-item">
            <span
              class="inspection-calendar__legend-selected"
            ></span>
            Tanggal dipilih
          </span>
        </div>
      </section>
    `;

    // Select a calendar date.
    dateList.querySelectorAll("[data-edit-date]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          dateInput.value = button.dataset.editDate;

          renderDateList();
          renderDay();

          checklistContainer.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      },
    );
  }

  // --------------------------------------------------
  // RENDER CHECKLIST FOR SELECTED DAY
  // --------------------------------------------------

  function renderDay() {
    const selectedDate = dateInput.value;
    const dayAnswers = getAnswersForDate(selectedDate);

    const answerMap = new Map(
      dayAnswers.map((answer) => [
        Number(answer.checklist_item_id),
        answer,
      ]),
    );

    const items = [...definitions].sort(
      (a, b) =>
        (a.order_number ?? 999) - (b.order_number ?? 999),
    );

    const dayProgress = getProgress(selectedDate);

    progress.textContent =
      `${dayProgress.completed} dari ` +
      `${dayProgress.total} item dinilai untuk ` +
      `${selectedDate}.`;

    checklistContainer.innerHTML = `
      <div class="${sectionBody}" style="padding:0">
        <div class="table-wrap">
          <table class="data" style="border:none">
            <tbody>
              ${
                items.length
                  ? items
                      .map((item) => {
                        const answer = answerMap.get(Number(item.id));
                        const currentStatus = answer?.status || "";

                        const statusControl = isEditable
                          ? `
                            <select
                              data-status
                              aria-label="Penilaian ${escapeHtml(
                                item.name || "",
                              )}"
                            >
                              <option
                                value=""
                                ${
                                  !currentStatus ? "selected" : ""
                                }
                              >
                                Belum dinilai
                              </option>

                              <option
                                value="GOOD"
                                ${
                                  currentStatus === "GOOD"
                                    ? "selected"
                                    : ""
                                }
                              >
                                Baik
                              </option>
                            </select>
                          `
                          : `
                            <span>
                              ${
                                currentStatus === "GOOD"
                                  ? "Baik"
                                  : "Belum dinilai"
                              }
                            </span>
                          `;

                        return `
                          <tr data-item-id="${item.id}">
                            <td>
                              <strong>
                                ${escapeHtml(item.name || "—")}
                              </strong>

                              ${
                                item.description
                                  ? `
                                    <br />
                                    <small>
                                      ${escapeHtml(item.description)}
                                    </small>
                                  `
                                  : ""
                              }
                            </td>

                            <td>${statusControl}</td>
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

    saveButton.disabled = items.length === 0;
    saveButton.textContent = "Simpan Tanggal Ini";
  }

  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;

    renderDateList();
    renderDay();
  });

  // --------------------------------------------------
  // SAVE CHECKLIST FOR SELECTED DATE
  // --------------------------------------------------

  saveButton.addEventListener("click", async () => {
    const selectedDate = dateInput.value;

    if (!isEditable) {
      toast(
        "Pemeriksaan yang sudah dikirim tidak dapat diedit.",
        "error",
      );
      return;
    }

    if (!selectedDate) {
      toast(
        "Pilih tanggal pemeriksaan terlebih dahulu.",
        "error",
      );
      return;
    }

    const rows = [
      ...checklistContainer.querySelectorAll("tr[data-item-id]"),
    ];

    const previousAnswers = new Map(
      getAnswersForDate(selectedDate).map((answer) => [
        Number(answer.checklist_item_id),
        answer,
      ]),
    );

    // Null answers are allowed.
    const items = rows.map((row) => {
      const itemID = Number(row.dataset.itemId);
      const statusSelect = row.querySelector("[data-status]");
      const previousAnswer = previousAnswers.get(itemID);

      return {
        checklist_item_id: itemID,
        status: statusSelect?.value || null,
        notes: previousAnswer?.notes || "",
      };
    });

    saveButton.disabled = true;
    saveButton.textContent = "Menyimpan...";

    try {
      await api(`/edit-checklist/${inspection.id}`, {
        method: "PUT",
        body: {
          answer_date: selectedDate,
          items,
        },
      });

      const { data: refreshed } = await api(
        `/inspections/${inspection.id}`,
      );

      answers =
        Array.isArray(refreshed.checklist_detail) &&
        refreshed.checklist_detail.length
          ? refreshed.checklist_detail
          : Array.isArray(refreshed.checklist)
            ? refreshed.checklist
            : [];

      renderDateList();
      renderDay();

      toast(
        `Pemeriksaan tanggal ${selectedDate} berhasil disimpan.`,
        "success",
      );
    } catch (error) {
      toast(
        error.message || "Gagal menyimpan pemeriksaan.",
        "error",
      );
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Simpan Tanggal Ini";
    }
  });

  renderDateList();
  renderDay();
}

// ==================================================
// MAIN INSPECTION DETAIL PAGE
// ==================================================

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell("latest.html", {
    breadcrumb: `
      <a href="latest.html">Pemeriksaan</a>
      <span>/</span>
      Detail
    `,
    mobileBack: {
      href: "latest.html",
      label: "Kembali",
    },
  });

  const id = qs("id");

  if (!id || !/^[1-9]\d*$/.test(id)) {
    showError(
      "Parameter ID pemeriksaan tidak valid atau tidak ditemukan.",
    );
    return;
  }

  const { data: insp } = await api(`/inspections/${id}`);

  const isEditable =
    String(insp.status || "").trim().toUpperCase() === "OPEN";

  const room = insp.room || {};
  const failed = insp.result === "FAILED";

  const canManageInspection =
    hasPermission("inspections.manage");

  const canSignAsKepalaRuangan =
    user.role === "KEPALA_RUANGAN" &&
    hasPermission("inspections.sign") &&
    !!insp.inspector_signature &&
    !insp.kepala_ruangan_signature;

  // Header actions.
  document.getElementById("header-actions").innerHTML = `
    <button
      type="button"
      class="${btnSecondary}"
      id="btn-pdf"
    >
      Cetak PDF
    </button>

    ${
      canManageInspection
        ? `
          <button
            type="button"
            class="${btnSecondary}"
            id="btn-delete"
          >
            Hapus Pemeriksaan
          </button>
        `
        : ""
    }
  `;

  document
    .getElementById("btn-pdf")
    .addEventListener("click", async () => {
      try {
        await downloadInspectionPdf(insp.id);
      } catch (error) {
        toast(error.message, "error");
      }
    });

  // Delete inspection.
  const btnDelete = document.getElementById("btn-delete");

  if (btnDelete) {
    btnDelete.addEventListener("click", async () => {
      const confirmed = window.confirm(
        "Apakah Anda yakin ingin menghapus pemeriksaan ini? Data akan dihapus secara soft delete.",
      );

      if (!confirmed) return;

      btnDelete.disabled = true;
      btnDelete.textContent = "Menghapus...";

      try {
        await api(`/inspections/${insp.id}`, {
          method: "DELETE",
        });

        toast("Pemeriksaan berhasil dihapus", "success");

        setTimeout(() => {
          window.location.href = "latest.html";
        }, 700);
      } catch (error) {
        btnDelete.disabled = false;
        btnDelete.textContent = "Hapus Pemeriksaan";

        toast(
          error.message || "Gagal menghapus pemeriksaan",
          "error",
        );
      }
    });
  }

  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const monthNumber =
    insp.inspection_month?.match(/^\d{4}-(\d{2})-/)?.[1];

  const monthName = monthNumber
    ? monthNames[Number(monthNumber) - 1] || "—"
    : "—";

  document.getElementById("detail-root").innerHTML = `
    ${
      failed
        ? `
          <div class="${alertClass("failed")}">
            Temuan kritis PPI (Tidak Sesuai) — perlu perhatian segera.
          </div>
        `
        : ""
    }

    <div class="${section}">
      <div class="${sectionHeader}">
        Informasi
      </div>

      <div class="${sectionBody}">
        <div class="info-grid">
          <div>
            <span>Nomor</span>
            <strong>
              ${escapeHtml(String(insp.document_number || insp.id))}
            </strong>
          </div>

          <div>
            <span>Ruangan</span>
            <strong>${escapeHtml(room.name || "")}</strong>
          </div>

          <div>
            <span>Kode</span>
            <strong>${escapeHtml(room.code || "")}</strong>
          </div>

          <div>
            <span>Bulan</span>
            <strong>${escapeHtml(monthName)}</strong>
          </div>

          <div>
            <span>Hasil</span>
            <strong>${statusBadge(insp.result)}</strong>
          </div>

          <div>
            <span>Status</span>
            <strong>${statusBadge(insp.status)}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="${section}" style="margin-top:12px">
      <div class="${sectionHeader}">
        Pemeriksaan Harian
      </div>

      <div class="${sectionBody}">
        <p class="page-meta">
          Pilih tanggal untuk melihat atau mengedit checklist.
        </p>

        <input
          type="date"
          id="answer-date"
          hidden
          aria-hidden="true"
          tabindex="-1"
        />
      </div>

      <div id="daily-date-list"></div>

      <div class="${sectionBody}">
        <p id="day-progress" class="page-meta"></p>
      </div>

      <div id="daily-checklist"></div>

      <div class="${sectionBody}">
        <button
          type="button"
          class="${btn}"
          id="btn-save-day"
          ${!isEditable ? "hidden" : ""}
        >
          Simpan Tanggal Ini
        </button>
      </div>
    </div>

    <!-- CATATAN -->
    <div class="${section}" style="margin-top:12px">
      <div class="${sectionHeader}">
        Catatan
      </div>

      <div class="${sectionBody}">
        <div id="notes-view">
          <p id="notes-text">
            ${escapeHtml(insp.notes || "—")}
          </p>

          ${
            isEditable
              ? `
                <button
                  type="button"
                  class="${btnSecondary}"
                  id="btn-edit-notes"
                  style="margin-top:12px"
                >
                  Ubah Catatan
                </button>
              `
              : ""
          }
        </div>

        ${
          isEditable
            ? `
              <div id="notes-editor" hidden>

                <textarea
                  id="inspection-notes"
                  rows="4"
                  class="${textarea}"
                  placeholder="Tambahkan catatan pemeriksaan..."
                  style="display:block; width:100%; margin-bottom:12px;"
                >${escapeHtml(insp.notes || "")}</textarea>

                <div
                  class="flex gap-2"
                  style="margin-top:12px; padding-bottom:12px;"
                >
                  <button
                    type="button"
                    class="${btn}"
                    id="btn-save-notes"
                  >
                    Simpan Catatan
                  </button>

                  <button
                    type="button"
                    class="${btnSecondary}"
                    id="btn-cancel-notes"
                  >
                    Batal
                  </button>
                </div>
              </div>
            `
            : ""
        }
      </div>
    </div>

    <!-- SIGNATURES -->
    <div class="${section}" style="margin-top:12px">
      <div class="${sectionHeader}">
        Tanda Tangan
      </div>

      <div class="${sectionBody}">
        <div class="sig-row">
          ${sigBlock("Pemeriksa", insp.inspector_signature)}
          ${sigBlock("Kepala Ruangan", insp.kepala_ruangan_signature)}
        </div>

        ${
          canSignAsKepalaRuangan
            ? `
              <div style="margin-top:16px">
                <button
                  type="button"
                  class="${btn}"
                  id="btn-sign-kepala"
                >
                  Tanda Tangan sebagai Kepala Ruangan
                </button>
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;

  // Initialize the daily checklist.
  await setupDailyChecklist(insp);

  // ==================================================
  // EDIT INSPECTION NOTES (OPEN STATUS ONLY)
  // ==================================================

  if (isEditable) {
    const notesView = document.getElementById("notes-view");
    const notesText = document.getElementById("notes-text");
    const notesEditor = document.getElementById("notes-editor");
    const notesInput = document.getElementById("inspection-notes");

    const editNotesButton =
      document.getElementById("btn-edit-notes");

    const saveNotesButton =
      document.getElementById("btn-save-notes");

    const cancelNotesButton =
      document.getElementById("btn-cancel-notes");

    editNotesButton?.addEventListener("click", () => {
      notesInput.value = insp.notes || "";

      notesView.hidden = true;
      notesEditor.hidden = false;

      notesInput.focus();
    });

    cancelNotesButton?.addEventListener("click", () => {
      notesInput.value = insp.notes || "";

      notesEditor.hidden = true;
      notesView.hidden = false;
    });

    saveNotesButton?.addEventListener("click", async () => {
      if (
        String(insp.status || "").trim().toUpperCase() !== "OPEN"
      ) {
        toast(
          "Catatan hanya dapat diubah saat status pemeriksaan OPEN.",
          "error",
        );
        return;
      }

      saveNotesButton.disabled = true;
      saveNotesButton.textContent = "Menyimpan...";

      try {
        const updatedNotes = notesInput.value;

        await api(`/inspections/${insp.id}`, {
          method: "PATCH",
          body: {
            notes: updatedNotes,
          },
        });

        insp.notes = updatedNotes;

        notesText.textContent =
          updatedNotes.trim() || "—";

        notesEditor.hidden = true;
        notesView.hidden = false;

        toast("Catatan berhasil disimpan.", "success");
      } catch (error) {
        toast(
          error.message || "Gagal menyimpan catatan.",
          "error",
        );
      } finally {
        saveNotesButton.disabled = false;
        saveNotesButton.textContent = "Simpan Catatan";
      }
    });
  }

  // ==================================================
  // KEPALA RUANGAN SIGNATURE MODAL
  // ==================================================

  if (canSignAsKepalaRuangan) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <div
          id="kepala-sign-modal"
          class="kepala-sign-modal"
          aria-hidden="true"
        >
          <div
            class="kepala-sign-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kepala-sign-title"
          >
            <div class="kepala-sign-modal-header">
              <div>
                <h2
                  id="kepala-sign-title"
                  class="text-lg font-semibold text-gray-900"
                >
                  Tanda Tangan Kepala Ruangan
                </h2>

                <p class="page-meta mt-1">
                  Pemeriksaan #${escapeHtml(String(insp.id))}
                </p>
              </div>

              <button
                type="button"
                id="btn-close-kepala-sign"
                class="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <div class="kepala-signature-modal-body">
              <div id="kepala-signature-root"></div>
            </div>

            <div class="flex justify-end gap-2 border-t px-6 py-4">
              <button
                type="button"
                class="${btnSecondary}"
                id="btn-cancel-kepala-sign"
              >
                Batal
              </button>

              <button
                type="button"
                class="${btn}"
                id="btn-save-kepala-sign"
              >
                Simpan Tanda Tangan
              </button>
            </div>
          </div>
        </div>
      `,
    );

    const modal =
      document.getElementById("kepala-sign-modal");

    const openBtn =
      document.getElementById("btn-sign-kepala");

    const closeBtn =
      document.getElementById("btn-close-kepala-sign");

    const cancelBtn =
      document.getElementById("btn-cancel-kepala-sign");

    const saveBtn =
      document.getElementById("btn-save-kepala-sign");

    const signatureRoot =
      document.getElementById("kepala-signature-root");

    const kepalaSigPad = new SignaturePad(signatureRoot);

    function openKepalaSignModal() {
      kepalaSigPad.clear();
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
    }

    function closeKepalaSignModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      kepalaSigPad.clear();
    }

    openBtn?.addEventListener(
      "click",
      openKepalaSignModal,
    );

    closeBtn?.addEventListener(
      "click",
      closeKepalaSignModal,
    );

    cancelBtn?.addEventListener(
      "click",
      closeKepalaSignModal,
    );

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeKepalaSignModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        modal.classList.contains("is-open")
      ) {
        closeKepalaSignModal();
      }
    });

    saveBtn?.addEventListener("click", async () => {
      if (kepalaSigPad.isEmpty()) {
        toast("Tanda tangan wajib diisi", "error");
        return;
      }

      const payload = await kepalaSigPad.getPayload();

      if (!payload) {
        toast("Tanda tangan tidak valid", "error");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Menyimpan...";

      try {
        await api(
          `/inspections/${insp.id}/signature/kepala-ruangan`,
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );

        toast(
          "Tanda tangan Kepala Ruangan berhasil disimpan",
          "success",
        );

        closeKepalaSignModal();
        window.location.reload();
      } catch (error) {
        toast(
          error.message || "Gagal menyimpan tanda tangan",
          "error",
        );
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Simpan Tanda Tangan";
      }
    });
  }
}

main().catch((error) => {
  console.error("Inspection detail error:", error);

  showError(
    error.message || "Gagal memuat detail pemeriksaan.",
  );

  toast(
    error.message || "Gagal memuat detail pemeriksaan.",
    "error",
  );
});