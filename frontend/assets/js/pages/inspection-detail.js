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
  section,
  sectionHeader,
  sectionBody,
  alert as alertClass,
} from "../ui.js";

import { SignaturePad } from "../signature.js";

// ==================================================
// SIGNATURE DISPLAY
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

// ==================================================
// ERROR
// ==================================================

function showError(message) {
  const actions = document.getElementById("header-actions");
  const root = document.getElementById("detail-root");

  if (actions) {
    actions.innerHTML = "";
  }

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
  const checklistContainer = document.getElementById("daily-checklist");
  const progress = document.getElementById("day-progress");
  const saveButton = document.getElementById("btn-save-day");

  const isEditable =
    String(inspection.status || "").trim().toUpperCase() === "OPEN";

  if (!dateInput || !dateList || !checklistContainer || !progress) {
    throw new Error("Elemen pemeriksaan harian tidak ditemukan.");
  }

  if (isEditable && !saveButton) {
    throw new Error("Tombol simpan perubahan tidak ditemukan.");
  }

  const monthKey = String(
    inspection.inspection_month || "",
  ).slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("Bulan pemeriksaan tidak valid.");
  }

  const [year, month] = monthKey.split("-").map(Number);

  const lastDay = new Date(
    Date.UTC(year, month, 0),
  ).getUTCDate();

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

  // Existing checklist answers.
  let answers =
    Array.isArray(inspection.checklist_detail) &&
    inspection.checklist_detail.length
      ? inspection.checklist_detail
      : Array.isArray(inspection.checklist)
        ? inspection.checklist
        : [];

  /*
   * TEMPORARY DRAFTS
   *
   * Map key: YYYY-MM-DD
   *
   * Value:
   * {
   *   answer_date: "2026-10-02",
   *   items: [
   *     {
   *       checklist_item_id: 1,
   *       status: "GOOD",
   *       notes: "..."
   *     }
   *   ]
   * }
   *
   * Drafts only stay in memory until saved or the page is closed.
   */
  const draftDays = new Map();

  const getAnswerDate = (answer) =>
    String(answer.answer_date || "").slice(0, 10);

  const savedDates = [
    ...new Set(
      answers
        .map(getAnswerDate)
        .filter(
          (date) =>
            /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            date.startsWith(`${monthKey}-`),
        ),
    ),
  ].sort();

  dateInput.value = savedDates[0] || `${monthKey}-01`;

  // Return drafts first, otherwise load saved answers.
  function getAnswersForDate(date) {
    const draft = draftDays.get(date);

    if (draft) {
      return draft.items.map((item) => ({
        ...item,
        answer_date: date,
      }));
    }

    return answers.filter(
      (answer) => getAnswerDate(answer) === date,
    );
  }

  function hasMeaningfulData(date) {
    return getAnswersForDate(date).some(
      (item) =>
        Boolean(item.status) ||
        String(item.notes || "").trim() !== "",
    );
  }

  // Calculate daily checklist progress.
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

  /*
   * Capture what is currently visible.
   *
   * This updates an existing draft before changing dates.
   * It does not create a draft for an untouched date.
   */
  function captureVisibleDraft() {
    if (!isEditable) return;

    const date = dateInput.value;

    if (!date || !draftDays.has(date)) return;

    const rows = [
      ...checklistContainer.querySelectorAll("tr[data-item-id]"),
    ];

    const items = rows.map((row) => ({
      checklist_item_id: Number(row.dataset.itemId),
      status: row.querySelector("[data-status]")?.value || null,
      notes:
        row.querySelector("[data-notes]")?.value.trim() || "",
    }));

    draftDays.set(date, {
      answer_date: date,
      items,
    });
  }

  // Save the visible day's current form values to the draft Map.
  function markVisibleDateDirty() {
    if (!isEditable || !dateInput.value) return;

    const date = dateInput.value;

    const rows = [
      ...checklistContainer.querySelectorAll("tr[data-item-id]"),
    ];

    if (!rows.length) return;

    const items = rows.map((row) => ({
      checklist_item_id: Number(row.dataset.itemId),
      status: row.querySelector("[data-status]")?.value || null,
      notes:
        row.querySelector("[data-notes]")?.value.trim() || "",
    }));

    draftDays.set(date, {
      answer_date: date,
      items,
    });
  }

  // --------------------------------------------------
  // RENDER THE CALENDAR
  // --------------------------------------------------

  function renderDateList() {
    const firstWeekday = new Date(
      Date.UTC(year, month - 1, 1),
    ).getUTCDay();

    const monthTitle = new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(
      new Date(Date.UTC(year, month - 1, 1)),
    );

    const weekdays = [
      "Min",
      "Sen",
      "Sel",
      "Rab",
      "Kam",
      "Jum",
      "Sab",
    ];

    const daysWithData = Array.from(
      { length: lastDay },
      (_, index) => {
        const date =
          `${monthKey}-${String(index + 1).padStart(2, "0")}`;

        return hasMeaningfulData(date) ? date : null;
      },
    ).filter(Boolean);

    const pendingDates = [...draftDays.keys()].sort();

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

        const p = getProgress(date);
        const selected = date === dateInput.value;
        const dirty = draftDays.has(date);
        const hasData = hasMeaningfulData(date);

        const complete =
          p.total > 0 && p.completed >= p.total;

        const stateText = dirty
          ? "Belum disimpan"
          : complete
            ? "Lengkap"
            : p.completed > 0
              ? `${p.completed}/${p.total}`
              : "—";

        return `
          <button
            type="button"
            class="inspection-calendar__day${selected ? " is-selected" : ""}${dirty ? " is-dirty" : ""}"
            data-edit-date="${date}"
            aria-pressed="${selected}"
            aria-label="Tanggal ${day}, ${monthTitle}. ${escapeHtml(p.label)}${dirty ? ". Ada perubahan belum disimpan" : ""}"
            title="${escapeHtml(dirty ? "Perubahan belum disimpan" : p.label)}"
          >
            <span class="inspection-calendar__day-number">
              ${day}
            </span>

            <span class="inspection-calendar__day-status">
              <span
                class="inspection-calendar__dot${hasData ? " inspection-calendar__dot--saved" : ""}${complete ? " inspection-calendar__dot--complete" : ""}${dirty ? " inspection-calendar__dot--pending" : ""}"
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
            <strong>${daysWithData.length}</strong>
            <span>hari terisi</span>
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
                  class="inspection-calendar__weekday${index === 0 ? " is-sunday" : ""}"
                >
                  ${day}
                </div>
              `,
            )
            .join("")}
        </div>

        <div class="inspection-calendar__grid">
          ${blanks}${dayCells}
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
              class="inspection-calendar__dot inspection-calendar__dot--pending"
            ></span>
            Belum disimpan
          </span>

          <span class="inspection-calendar__legend-item">
            <span class="inspection-calendar__legend-selected"></span>
            Tanggal dipilih
          </span>
        </div>

        ${
          pendingDates.length && isEditable
            ? `
              <p class="inspection-calendar__pending-note">
                ${pendingDates.length}
                tanggal memiliki perubahan lokal yang belum disimpan.
              </p>
            `
            : ""
        }
      </section>
    `;

    dateList
      .querySelectorAll("[data-edit-date]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          // Preserve current edits before switching days.
          captureVisibleDraft();

          dateInput.value = button.dataset.editDate;

          renderDateList();
          renderDay();

          checklistContainer.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      });
  }

  // --------------------------------------------------
  // RENDER CHECKLIST FOR THE SELECTED DAY
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
        (a.order_number ?? 999) -
        (b.order_number ?? 999),
    );

    const p = getProgress(selectedDate);

    progress.textContent =
      `${p.completed} dari ${p.total} item dinilai untuk ` +
      `${selectedDate}.`;

    checklistContainer.innerHTML = `
      <div class="${sectionBody}" style="padding:0">
        <div class="table-wrap">
          <table class="data" style="border:none">
            <thead>
              <tr>
                <th>Item</th>
                <th>Penilaian</th>
                <th>Catatan</th>
              </tr>
            </thead>

            <tbody>
              ${
                items.length
                  ? items
                      .map((item) => {
                        const answer =
                          answerMap.get(Number(item.id));

                        const currentStatus =
                          answer?.status || "";

                        return `
                          <tr data-item-id="${Number(item.id)}">
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

                            <td>
                              ${
                                isEditable
                                  ? `
                                    <select
                                      data-status
                                      aria-label="Penilaian ${escapeHtml(item.name || "")}"
                                      style="min-width:140px"
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
                                  `
                                  : `
                                    <span>
                                      ${
                                        currentStatus === "GOOD"
                                          ? "Baik"
                                          : "Belum dinilai"
                                      }
                                    </span>
                                  `
                              }
                            </td>

                            <td>
                              ${
                                isEditable
                                  ? `
                                    <textarea
                                      data-notes
                                      rows="2"
                                      aria-label="Catatan ${escapeHtml(item.name || "")}"
                                      placeholder="Catatan temuan..."
                                    >${escapeHtml(answer?.notes || "")}</textarea>
                                  `
                                  : `
                                    <span>
                                      ${escapeHtml(answer?.notes || "—")}
                                    </span>
                                  `
                              }
                            </td>
                          </tr>
                        `;
                      })
                      .join("")
                  : `
                    <tr>
                      <td colspan="3" class="${empty}">
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

    if (saveButton) {
      saveButton.hidden = !isEditable;

      saveButton.disabled =
        !isEditable || definitions.length === 0;

      saveButton.textContent = draftDays.size
        ? `Simpan Semua Perubahan (${draftDays.size})`
        : "Simpan Semua Perubahan";
    }
  }

  // --------------------------------------------------
  // TRACK LOCAL CHANGES
  // --------------------------------------------------

  if (isEditable) {
    checklistContainer.addEventListener("change", (event) => {
      if (!event.target.matches("[data-status]")) return;

      markVisibleDateDirty();
      renderDateList();
      renderDayProgressOnly();
    });

    checklistContainer.addEventListener("input", (event) => {
      if (!event.target.matches("[data-notes]")) return;

      markVisibleDateDirty();
      renderDateList();
      renderDayProgressOnly();
    });
  }

  function renderDayProgressOnly() {
    const p = getProgress(dateInput.value);

    progress.textContent =
      `${p.completed} dari ${p.total} item dinilai untuk ` +
      `${dateInput.value}.`;

    if (saveButton) {
      saveButton.textContent = draftDays.size
        ? `Simpan Semua Perubahan (${draftDays.size})`
        : "Simpan Semua Perubahan";
    }
  }

  dateInput.addEventListener("change", () => {
    if (!dateInput.value) return;

    captureVisibleDraft();

    renderDateList();
    renderDay();
  });

  // --------------------------------------------------
  // SAVE ALL DRAFTS IN ONE API REQUEST
  // --------------------------------------------------

  async function saveAllDrafts() {
    captureVisibleDraft();

    const days = [...draftDays.values()].sort((a, b) =>
      a.answer_date.localeCompare(b.answer_date),
    );

    if (days.length === 0) {
      toast("Belum ada perubahan untuk disimpan.", "error");
      return false;
    }

    if (!isEditable) {
      toast(
        "Hanya pemeriksaan berstatus OPEN yang dapat diedit.",
        "error",
      );

      return false;
    }

    // Validate all drafts before calling the backend.
    for (const day of days) {
      if (!day.answer_date.startsWith(`${monthKey}-`)) {
        toast(
          `Tanggal ${day.answer_date} berada di luar bulan pemeriksaan.`,
          "error",
        );

        return false;
      }

      for (const item of day.items) {
        if (
          !Number.isInteger(item.checklist_item_id) ||
          item.checklist_item_id <= 0
        ) {
          toast(
            `Item checklist pada ${day.answer_date} tidak valid.`,
            "error",
          );

          return false;
        }

        if (
          item.status !== null &&
          item.status !== "GOOD"
        ) {
          toast(
            `Status checklist pada ${day.answer_date} tidak valid.`,
            "error",
          );

          return false;
        }
      }
    }

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = "Menyimpan semua perubahan...";
    }

    try {
      await api(
        `/inspections/${inspection.id}/checklist/bulk`,
        {
          method: "PUT",
          body: { days },
        },
      );

      const refreshedResponse = await api(
        `/inspections/${inspection.id}`,
      );

      const refreshed =
        refreshedResponse?.data ?? refreshedResponse;

      answers =
        Array.isArray(refreshed.checklist_detail) &&
        refreshed.checklist_detail.length
          ? refreshed.checklist_detail
          : Array.isArray(refreshed.checklist)
            ? refreshed.checklist
            : [];

      // Clear temporary drafts only after the save succeeded.
      draftDays.clear();

      renderDateList();
      renderDay();

      toast(
        "Semua perubahan checklist berhasil disimpan.",
        "success",
      );

      return true;
    } catch (error) {
      // Keep the drafts if saving fails so the user can retry.
      toast(
        error.message || "Gagal menyimpan semua perubahan.",
        "error",
      );

      return false;
    } finally {
      if (saveButton) {
        saveButton.disabled = definitions.length === 0;

        saveButton.textContent = draftDays.size
          ? `Simpan Semua Perubahan (${draftDays.size})`
          : "Simpan Semua Perubahan";
      }
    }
  }

  if (saveButton && isEditable) {
    saveButton.hidden = false;
    saveButton.textContent = "Simpan Semua Perubahan";

    saveButton.addEventListener("click", async () => {
      await saveAllDrafts();
    });
  } else if (saveButton) {
    saveButton.hidden = true;
  }

  renderDateList();
  renderDay();

  return {
    saveAllDrafts,
    hasPendingChanges: () => draftDays.size > 0,
  };
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

  const room = insp.room || {};
  const failed = insp.result === "FAILED";

  const canManageInspection =
    hasPermission("inspections.manage");

  const canSignAsKepalaRuangan =
    user.role === "KEPALA_RUANGAN" &&
    hasPermission("inspections.sign") &&
    !!insp.inspector_signature &&
    !insp.kepala_ruangan_signature;

  // Header buttons.
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
          ${
            String(insp.status || "").toUpperCase() === "OPEN"
              ? "Pilih tanggal, edit checklist, kemudian simpan semua perubahan."
              : "Pemeriksaan ini hanya dapat dilihat karena statusnya bukan OPEN."
          }
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
        >
          Simpan Semua Perubahan
        </button>
      </div>
    </div>

    <div class="${section}" style="margin-top:12px">
      <div class="${sectionHeader}">
        Catatan
      </div>

      <div class="${sectionBody}">
        ${escapeHtml(insp.notes || "—")}
      </div>
    </div>

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

  // Initialize calendar and daily checklist.
  await setupDailyChecklist(insp);

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
                <h2 id="kepala-sign-title">
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

    const modal = document.getElementById("kepala-sign-modal");
    const openBtn = document.getElementById("btn-sign-kepala");
    const closeBtn = document.getElementById("btn-close-kepala-sign");
    const cancelBtn = document.getElementById("btn-cancel-kepala-sign");
    const saveBtn = document.getElementById("btn-save-kepala-sign");
    const signatureRoot = document.getElementById("kepala-signature-root");

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

    openBtn?.addEventListener("click", openKepalaSignModal);
    closeBtn?.addEventListener("click", closeKepalaSignModal);
    cancelBtn?.addEventListener("click", closeKepalaSignModal);

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