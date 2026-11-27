import {
  requireAuth,
  api,
  hasPermission,
  downloadInspectionPdf,
} from "../api.js";

import { confirmDialog, mountShell, toast } from "../components/shell.js";

import {
  escapeHtml,
  formatDate,
  formatMonth,
  isAdminRole,
  isAnggotaRole,
  isKepalaRole,
  normalizeRole,
  notesHtml,
  qs,
  signatureByRole,
  statusBadge,
} from "../utils/format.js";

import {
  btn,
  btnSecondary,
  empty,
  formGroup,
  section,
  sectionHeader,
  sectionBody,
  alert as alertClass,
} from "../ui.js";

import { SignaturePad } from "../signature.js";

const STEP_CHECK_ICON = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
`;

// SIGNATURE DISPLAY

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
    typeof sig.image_data_url === "string" && sig.image_data_url.length > 80
      ? sig.image_data_url
      : "";

  return `
    <div class="sig-card is-signed">
      <div class="sig-state">Ditandatangani</div>
      <div class="sig-label">${escapeHtml(title)}</div>

      ${
        src
          ? `
            <img
              class="sig-image"
              src="${escapeHtml(src)}"
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

// REUSABLE SIGNATURE MODAL

function mountSignatureModal({
  prefix,
  buttonId,
  title,
  endpoint,
  successMessage,
  errorMessage,
  inspectionId,
}) {
  const openButton = document.getElementById(buttonId);

  if (!openButton) return;

  const modalId = `${prefix}-sign-modal`;
  const titleId = `${prefix}-sign-title`;
  const rootId = `${prefix}-signature-root`;
  const closeId = `btn-close-${prefix}-sign`;
  const cancelId = `btn-cancel-${prefix}-sign`;
  const saveId = `btn-save-${prefix}-sign`;

  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div
        id="${modalId}"
        class="kepala-sign-modal"
        aria-hidden="true"
      >
        <div
          class="kepala-sign-modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="${titleId}"
        >
          <div class="kepala-sign-modal-header">
            <div>
              <h2 id="${titleId}">
                ${escapeHtml(title)}
              </h2>

              <p class="page-meta mt-1">
                Pemeriksaan #${escapeHtml(String(inspectionId))}
              </p>
            </div>

            <button
              type="button"
              id="${closeId}"
              class="kepala-sign-modal-close"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>

          <div class="kepala-sign-modal-body">
            <div id="${rootId}"></div>
          </div>

          <div class="kepala-sign-modal-footer">
            <button
              type="button"
              class="${btnSecondary}"
              id="${cancelId}"
            >
              Batal
            </button>

            <button
              type="button"
              class="${btn}"
              id="${saveId}"
            >
              Simpan Tanda Tangan
            </button>
          </div>
        </div>
      </div>
    `,
  );

  const modal = document.getElementById(modalId);
  const closeButton = document.getElementById(closeId);
  const cancelButton = document.getElementById(cancelId);
  const saveButton = document.getElementById(saveId);
  const signatureRoot = document.getElementById(rootId);

  const signaturePad = new SignaturePad(signatureRoot);

  function openModal() {
    signaturePad.clear();

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");

    signaturePad.clear();
  }

  openButton.addEventListener("click", openModal);

  closeButton?.addEventListener("click", closeModal);
  cancelButton?.addEventListener("click", closeModal);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });

  saveButton?.addEventListener("click", async () => {
    if (signaturePad.isEmpty()) {
      toast("Tanda tangan wajib diisi", "error");
      return;
    }

    const payload = await signaturePad.getPayload();

    if (!payload || !payload.image_data_url) {
      toast("Tanda tangan tidak valid", "error");
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Menyimpan...";

    try {
      await api(endpoint, {
        method: "POST",
        body: payload,
      });

      toast(successMessage, "success");

      closeModal();

      // Reload the page.
      window.location.reload();
    } catch (error) {
      toast(error.message || errorMessage, "error");
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Simpan Tanda Tangan";
    }
  });
}

// Error.

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

// DAILY CHECKLIST AND MONTHLY CALENDAR

async function setupDailyChecklist(inspection, options = {}) {
  const dateInput = document.getElementById("answer-date");
  const dateList = document.getElementById("daily-date-list");
  const checklistContainer = document.getElementById("daily-checklist");
  const progress = document.getElementById("day-progress");
  const saveButton = document.getElementById("btn-save-day");

  const isDraft =
    String(inspection.status || "")
      .trim()
      .toUpperCase() === "DRAFT";

  // Only the assigned inspector or Admin can edit a DRAFT inspection.
  const isEditable = isDraft && options.canEdit === true;

  if (!dateInput || !dateList || !checklistContainer || !progress) {
    throw new Error("Elemen pemeriksaan harian tidak ditemukan.");
  }

  if (isEditable && !saveButton) {
    throw new Error("Tombol simpan perubahan tidak ditemukan.");
  }

  const monthKey = String(inspection.inspection_month || "").slice(0, 7);

  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error("Bulan pemeriksaan tidak valid.");
  }

  const [year, month] = monthKey.split("-").map(Number);

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  dateInput.min = `${monthKey}-01`;
  dateInput.max = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

  // Load checklist definitions.
  const { data: definitionData } = await api("/checklist-items", {
    query: {
      room_type: inspection.room?.room_type || undefined,
    },
  });

  const definitions = Array.isArray(definitionData) ? definitionData : [];

  // Existing checklist answers.
  let answers =
    Array.isArray(inspection.checklist_detail) &&
    inspection.checklist_detail.length
      ? inspection.checklist_detail
      : Array.isArray(inspection.checklist)
        ? inspection.checklist
        : [];

  // Drafts keyed by YYYY-MM-DD, kept in memory until saved.
  const draftDays = new Map();

  const getAnswerDate = (answer) =>
    String(answer.answer_date || "").slice(0, 10);

  const savedDates = [
    ...new Set(
      answers
        .map(getAnswerDate)
        .filter(
          (date) =>
            /^\d{4}-\d{2}-\d{2}$/.test(date) && date.startsWith(`${monthKey}-`),
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

    return answers.filter((answer) => getAnswerDate(answer) === date);
  }

  function hasMeaningfulData(date) {
    return getAnswersForDate(date).some(
      (item) => Boolean(item.status) || String(item.notes || "").trim() !== "",
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

  // Capture visible values into the current draft before changing dates.
  function statusFieldValue(row) {
    const field = row.querySelector("[data-status]");

    if (!field) return null;
    if (field.type === "checkbox") return field.checked ? "GOOD" : null;

    return field.value || null;
  }

  function captureVisibleDraft() {
    if (!isEditable) return;

    const date = dateInput.value;

    if (!date || !draftDays.has(date)) return;

    const rows = [...checklistContainer.querySelectorAll("tr[data-item-id]")];

    const items = rows.map((row) => ({
      checklist_item_id: Number(row.dataset.itemId),
      status: statusFieldValue(row),
      notes: row.querySelector("[data-notes]")?.value.trim() || "",
    }));

    draftDays.set(date, {
      answer_date: date,
      items,
    });
  }

  // Save the visible day to drafts.
  function markVisibleDateDirty() {
    if (!isEditable || !dateInput.value) return;

    const date = dateInput.value;

    const rows = [...checklistContainer.querySelectorAll("tr[data-item-id]")];

    if (!rows.length) return;

    const items = rows.map((row) => ({
      checklist_item_id: Number(row.dataset.itemId),
      status: statusFieldValue(row),
      notes: row.querySelector("[data-notes]")?.value.trim() || "",
    }));

    draftDays.set(date, {
      answer_date: date,
      items,
    });
  }

  // Render the calendar.

  function renderDateList() {
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

    const monthTitle = new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, 1)));

    const weekdays = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

    const daysWithData = Array.from({ length: lastDay }, (_, index) => {
      const date = `${monthKey}-${String(index + 1).padStart(2, "0")}`;

      return hasMeaningfulData(date) ? date : null;
    }).filter(Boolean);

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

    const dayCells = Array.from({ length: lastDay }, (_, index) => {
      const day = index + 1;

      const date = `${monthKey}-${String(day).padStart(2, "0")}`;

      const p = getProgress(date);
      const selected = date === dateInput.value;
      const dirty = draftDays.has(date);
      const hasData = hasMeaningfulData(date);
      const isSunday = (firstWeekday + index) % 7 === 0;

      const complete = p.total > 0 && p.completed >= p.total;

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
            class="inspection-calendar__day${selected ? " is-selected" : ""}${dirty ? " is-dirty" : ""}${isSunday ? " is-sunday" : ""}"
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
    }).join("");

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

    dateList.querySelectorAll("[data-edit-date]").forEach((button) => {
      button.addEventListener("click", () => {
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

  // Render checklist for the selected day.

  function renderDay() {
    const selectedDate = dateInput.value;
    const dayAnswers = getAnswersForDate(selectedDate);

    const answerMap = new Map(
      dayAnswers.map((answer) => [Number(answer.checklist_item_id), answer]),
    );

    const items = [...definitions].sort(
      (a, b) => (a.order_number ?? 999) - (b.order_number ?? 999),
    );

    const p = getProgress(selectedDate);

    progress.textContent = `${p.completed} dari ${p.total} item dinilai untuk ${selectedDate}.`;

    checklistContainer.innerHTML = `
      <div class="${sectionBody}" style="padding:0">
        <div class="table-wrap">
          <table class="data checklist-table" style="border:none">
            <colgroup>
              <col style="width:70%">
              <col style="width:30%">
            </colgroup>

            <thead>
              <tr>
                <th>Item</th>
                <th>Penilaian</th>
              </tr>
            </thead>

            <tbody>
              ${
                items.length
                  ? items
                      .map((item) => {
                        const answer = answerMap.get(Number(item.id));
                        const currentStatus = answer?.status || "";

                        return `
                          <tr data-item-id="${Number(item.id)}">
                            <td>
                              <strong>
                                ${escapeHtml(item.name || "—")}
                              </strong>

                              ${
                                item.description
                                  ? `
                                    <br>
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
                                    <label class="checklist-check">
                                      <input
                                        type="checkbox"
                                        data-status
                                        aria-label="Baik untuk ${escapeHtml(item.name || "item checklist")}"
                                        ${currentStatus === "GOOD" ? "checked" : ""}
                                      />
                                      <span>Baik</span>
                                    </label>
                                  `
                                  : `
                                    <span>
                                      ${currentStatus === "GOOD" ? "Baik" : "Belum dinilai"}
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

    if (saveButton) {
      saveButton.hidden = !isEditable;

      saveButton.disabled = !isEditable || definitions.length === 0;

      saveButton.textContent = draftDays.size
        ? `Simpan Semua Perubahan (${draftDays.size})`
        : "Simpan Semua Perubahan";
    }
  }

  // Track local changes.

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

    progress.textContent = `${p.completed} dari ${p.total} item dinilai untuk ${dateInput.value}.`;

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

  // Save all drafts in one API request.

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
      toast("Hanya pemeriksaan berstatus DRAFT yang dapat diedit.", "error");

      return false;
    }

    // Validate drafts before saving.
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
          toast(`Item checklist pada ${day.answer_date} tidak valid.`, "error");

          return false;
        }

        if (item.status !== null && item.status !== "GOOD") {
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
      await api(`/inspections/${inspection.id}/checklist/bulk`, {
        method: "PUT",
        body: { days },
      });

      const refreshedResponse = await api(`/inspections/${inspection.id}`);

      const refreshed = refreshedResponse?.data ?? refreshedResponse;

      answers =
        Array.isArray(refreshed.checklist_detail) &&
        refreshed.checklist_detail.length
          ? refreshed.checklist_detail
          : Array.isArray(refreshed.checklist)
            ? refreshed.checklist
            : [];

      draftDays.clear();

      renderDateList();
      renderDay();

      toast("Semua perubahan checklist berhasil disimpan.", "success");

      return true;
    } catch (error) {
      toast(error.message || "Gagal menyimpan semua perubahan.", "error");

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

// MAIN INSPECTION DETAIL PAGE

async function main() {
  const user = await requireAuth();

  if (!user) return;

  await mountShell("open-inspection.html", {
    breadcrumb: `
      <a href="open-inspection.html">Pemeriksaan</a>
      <span>/</span>
      Detail
    `,
    mobileBack: {
      href: "open-inspection.html",
      label: "Kembali",
    },
  });

  const id = qs("id");

  if (!id || !/^[1-9]\d*$/.test(id)) {
    showError("Parameter ID pemeriksaan tidak valid atau tidak ditemukan.");

    return;
  }

  const { data: insp } = await api(`/inspections/${id}`);

  const room = insp.room || {};
  const failed = insp.result === "FAILED";

  // Human friendly subtitle in the page header.
  const subtitleParts = [
    room.name,
    room.code ? `(${room.code})` : "",
    formatMonth(insp.inspection_month),
  ].filter(Boolean);

  const subtitle = document.getElementById("detail-sub");

  if (subtitle && subtitleParts.length) {
    subtitle.textContent = subtitleParts.join(" · ");
  }

  const canManageInspection = hasPermission("inspections.manage");

  // Role and signature checks.

  const currentRole = normalizeRole(user.role);

  const inspectionStatus = String(insp.status || "")
    .trim()
    .toUpperCase();

  const isKepala = isKepalaRole(currentRole);

  const isAdmin = isAdminRole(currentRole);

  const isDraftInspection = inspectionStatus === "DRAFT";

  const isSubmittedInspection = inspectionStatus === "SUBMITTED";

  const isApprovedInspection = inspectionStatus === "APPROVED";

  const isRejectedInspection = inspectionStatus === "REJECTED";

  // Approved inspections cannot be deleted.
  const canDeleteInspection = canManageInspection && !isApprovedInspection;

  // Highlight the nav entry that matches the current inspection state.
  const navTarget = isDraftInspection ? "open-inspection.html" : "latest.html";

  document.querySelectorAll(".sidebar a.nav-link").forEach((link) => {
    const active = link.getAttribute("href") === navTarget;

    link.classList.toggle("active", active);

    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  // Read signatures from the API or legacy fields.
  const signatures = Array.isArray(insp.signatures) ? insp.signatures : [];

  const anggotaSignature =
    signatureByRole(signatures, "ANGGOTA") || insp.inspector_signature || null;

  const kepalaSignature =
    signatureByRole(signatures, "KEPALA") ||
    insp.kepala_ruangan_signature ||
    null;

  const hasAnggotaSignature = Boolean(anggotaSignature);

  const hasKepalaSignature = Boolean(kepalaSignature);

  const isAssignedInspector =
    Number(user.id) > 0 && Number(insp.inspector_id) === Number(user.id);

  // Anggota signs the petugas slot.
  const canSignAsAnggota =
    (isDraftInspection || isSubmittedInspection) &&
    isAnggotaRole(currentRole) &&
    !hasAnggotaSignature;

  // Only the assigned inspector can submit.
  const canSubmitForReview =
    isDraftInspection && isAssignedInspector && hasAnggotaSignature;

  // Kepala signs once after submit.
  const canSignAsKepalaRuangan =
    isKepala &&
    isSubmittedInspection &&
    hasAnggotaSignature &&
    !hasKepalaSignature;

  // Kepala or Admin approves after both signatures.
  const canApproveInspection =
    (isKepala || isAdmin) &&
    isSubmittedInspection &&
    hasAnggotaSignature &&
    hasKepalaSignature;

  const canEditChecklist =
    isDraftInspection && (isAssignedInspector || isAdmin || isKepala);

  // Workflow narrative shown next to the action buttons.
  let workflowNote = "";

  if (isRejectedInspection) {
    workflowNote =
      "Pemeriksaan ini ditolak. Hubungi kepala PPI untuk tindak lanjut.";
  } else if (isApprovedInspection) {
    workflowNote = "Pemeriksaan sudah disetujui dan menjadi arsip final.";
  } else if (isDraftInspection && !hasAnggotaSignature) {
    workflowNote = isAssignedInspector
      ? "Tanda tangani pemeriksaan sebagai petugas pemeriksa, lalu kirim untuk direview Kepala Komite IPCLN."
      : "Menunggu tanda tangan petugas pemeriksa sebelum dapat dikirim.";
  } else if (isDraftInspection) {
    workflowNote = isAssignedInspector
      ? "Tanda tangan petugas sudah tersimpan. Kirim pemeriksaan agar Kepala Komite IPCLN dapat menandatangani dan menyetujui."
      : "Petugas sudah menandatangani. Menunggu pemeriksaan dikirim untuk review.";
  } else if (isSubmittedInspection && !hasAnggotaSignature) {
    workflowNote = isAssignedInspector
      ? "Pemeriksaan sudah dikirim tanpa tanda tangan petugas. Lengkapi tanda tangan Anda agar Kepala Komite IPCLN dapat menandatangani."
      : "Pemeriksaan sudah dikirim tanpa tanda tangan petugas. Menunggu petugas melengkapi tanda tangan.";
  } else if (isSubmittedInspection && !hasKepalaSignature) {
    workflowNote = isKepala
      ? "Tanda tangani sebagai Kepala Komite IPCLN, lalu setujui pemeriksaan ini."
      : "Menunggu tanda tangan Kepala Komite IPCLN.";
  } else if (isSubmittedInspection) {
    workflowNote =
      isKepala || isAdmin
        ? "Kedua tanda tangan lengkap. Setujui pemeriksaan untuk menyelesaikan proses."
        : "Kedua tanda tangan lengkap. Menunggu persetujuan kepala PPI.";
  }

  // Five-step progress: dibuat -> petugas -> dikirim -> Kepala Komite -> disetujui.
  const workflowSteps = [
    { label: "Dibuat", done: true },
    { label: "Petugas", done: hasAnggotaSignature },
    {
      label: "Dikirim",
      done: isSubmittedInspection || isApprovedInspection,
    },
    { label: "Kepala", done: hasKepalaSignature },
    { label: "Disetujui", done: isApprovedInspection },
  ];

  const currentStepIndex = workflowSteps.findIndex((step) => !step.done);

  const workflowBadge = isRejectedInspection
    ? `<span class="badge badge-danger">Ditolak</span>`
    : isApprovedInspection
      ? `<span class="badge badge-good">Disetujui</span>`
      : isSubmittedInspection
        ? `<span class="badge badge-info">Menunggu Review</span>`
        : `<span class="badge badge-warn">Draft</span>`;

  // Header buttons.

  // Drafts cannot be exported; they get the in-app report preview instead.
  const reportAction = isDraftInspection
    ? `<a
        class="${btnSecondary}"
        id="btn-preview"
        href="./inspection-preview.html?id=${insp.id}"
      >
        Pratinjau Laporan
      </a>`
    : `<button
        type="button"
        class="${btnSecondary}"
        id="btn-pdf"
      >
        Cetak PDF
      </button>`;

  document.getElementById("header-actions").innerHTML = `
    ${reportAction}

    ${
      canDeleteInspection
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

  document.getElementById("btn-pdf")?.addEventListener("click", async () => {
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
      const confirmed = await confirmDialog(
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

        toast(error.message || "Gagal menghapus pemeriksaan", "error");
      }
    });
  }

  // Month name.

  const monthName = formatMonth(insp.inspection_month);

  // Inspection detail HTML.

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
            isDraftInspection
              ? "Pilih tanggal, edit checklist, kemudian simpan semua perubahan."
              : "Pemeriksaan ini hanya dapat dilihat karena statusnya bukan DRAFT."
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
        ${
          canEditChecklist
            ? `
              <div class="${formGroup}">
                <label for="inspection-notes">Catatan Pemeriksaan</label>
                <textarea
                  id="inspection-notes"
                  rows="4"
                  placeholder="Masukkan catatan umum pemeriksaan..."
                >${escapeHtml(insp.notes || "")}</textarea>
              </div>

              <div class="inspection-form-actions" style="margin-top:8px">
                <button
                  type="button"
                  class="${btn}"
                  id="btn-save-notes"
                >
                  Simpan Catatan
                </button>
              </div>
            `
            : `<p class="page-meta">${notesHtml(insp.notes, "—")}</p>`
        }
      </div>
    </div>

    <div class="${section}" style="margin-top:12px">
      <div class="${sectionHeader}">
        <span class="section-title">Tanda Tangan &amp; Persetujuan</span>
        ${workflowBadge}
      </div>

      <div class="${sectionBody}">
        <ol class="approval-steps">
          ${workflowSteps
            .map(
              (step, index) => `
                <li
                  class="approval-step${
                    step.done
                      ? " is-done"
                      : index === currentStepIndex
                        ? " is-current"
                        : ""
                  }"
                >
                  <span class="approval-step-dot">
                    ${step.done ? STEP_CHECK_ICON : index + 1}
                  </span>
                  <span class="approval-step-label">${escapeHtml(step.label)}</span>
                </li>
              `,
            )
            .join("")}
        </ol>

        <div class="sig-row">
          ${sigBlock("Kepala Komite IPCLN", kepalaSignature)}
          ${sigBlock("IPCLN Ruangan", anggotaSignature)}
        </div>

        ${workflowNote ? `<p class="approval-note">${escapeHtml(workflowNote)}</p>` : ""}

        ${
          canSignAsAnggota ||
          canSubmitForReview ||
          canSignAsKepalaRuangan ||
          canApproveInspection
            ? `
              <div class="approval-actions">
                ${
                  canSignAsAnggota
                    ? `
                      <button type="button" class="${btn}" id="btn-sign-anggota">
                        Tanda Tangan Petugas
                      </button>
                    `
                    : ""
                }

                ${
                  canSubmitForReview
                    ? `
                      <button type="button" class="${btn}" id="btn-submit-review">
                        Kirim untuk Review
                      </button>
                    `
                    : ""
                }

                ${
                  canSignAsKepalaRuangan
                    ? `
                      <button type="button" class="${btn}" id="btn-sign-kepala">
                        Tanda Tangan Kepala Komite IPCLN
                      </button>
                    `
                    : ""
                }

                ${
                  canApproveInspection
                    ? `
                      <button type="button" class="${btn}" id="btn-approve">
                        Setujui Pemeriksaan
                      </button>
                    `
                    : ""
                }
              </div>
            `
            : ""
        }
      </div>
    </div>
  `;

  // Initialize daily checklist.

  await setupDailyChecklist(insp, { canEdit: canEditChecklist });

  // Edit monthly notes.

  const notesInput = document.getElementById("inspection-notes");
  const saveNotesButton = document.getElementById("btn-save-notes");

  if (notesInput && saveNotesButton) {
    saveNotesButton.addEventListener("click", async () => {
      saveNotesButton.disabled = true;
      saveNotesButton.textContent = "Menyimpan...";

      try {
        await api(`/inspections/${insp.id}/notes`, {
          method: "PUT",
          body: {
            notes: notesInput.value.trim(),
          },
        });

        // The catatan is kept exactly as typed; commas become line breaks only
        // when the report is rendered.
        toast("Catatan pemeriksaan berhasil disimpan", "success");
        saveNotesButton.textContent = "Simpan Catatan";
      } catch (error) {
        toast(error.message || "Gagal menyimpan catatan", "error");
        saveNotesButton.textContent = "Simpan Catatan";
      } finally {
        saveNotesButton.disabled = false;
      }
    });
  }

  // ANGGOTA SIGNATURE MODAL

  if (canSignAsAnggota) {
    mountSignatureModal({
      prefix: "anggota",
      buttonId: "btn-sign-anggota",
      title: "Tanda Tangan Petugas Pemeriksa",
      endpoint: `/inspections/${insp.id}/signatures/anggota`,
      successMessage: "Tanda tangan petugas berhasil disimpan",
      errorMessage: "Gagal menyimpan tanda tangan petugas",
      inspectionId: insp.id,
    });
  }

  // KEPALA KOMITE IPCLN SIGNATURE MODAL

  if (canSignAsKepalaRuangan) {
    mountSignatureModal({
      prefix: "kepala",
      buttonId: "btn-sign-kepala",
      title: "Tanda Tangan Kepala Komite IPCLN",
      endpoint: `/inspections/${insp.id}/signature/kepala-ruangan`,
      successMessage: "Tanda tangan Kepala Komite IPCLN berhasil disimpan",
      errorMessage: "Gagal menyimpan tanda tangan Kepala Komite IPCLN",
      inspectionId: insp.id,
    });
  }

  // Submit for review (petugas).

  const submitButton = document.getElementById("btn-submit-review");

  submitButton?.addEventListener("click", async () => {
    const confirmed = await confirmDialog(
      "Kirim pemeriksaan ini untuk direview Kepala Komite IPCLN? Checklist tidak dapat diubah setelah dikirim.",
    );

    if (!confirmed) return;

    submitButton.disabled = true;
    submitButton.textContent = "Mengirim...";

    try {
      await api(`/inspections/${insp.id}/submit-approval`, { method: "POST" });

      toast("Pemeriksaan berhasil dikirim untuk review", "success");
      window.location.reload();
    } catch (error) {
      toast(error.message || "Gagal mengirim pemeriksaan", "error");
      submitButton.disabled = false;
      submitButton.textContent = "Kirim untuk Review";
    }
  });

  // Approve (Kepala Komite IPCLN / admin).

  const approveButton = document.getElementById("btn-approve");

  approveButton?.addEventListener("click", async () => {
    const confirmed = await confirmDialog(
      "Setujui pemeriksaan ini? Setelah disetujui, pemeriksaan menjadi arsip final dan tidak dapat diubah lagi.",
    );

    if (!confirmed) return;

    approveButton.disabled = true;
    approveButton.textContent = "Menyetujui...";

    try {
      await api(`/inspections/${insp.id}/approve`, { method: "POST" });

      toast("Pemeriksaan berhasil disetujui", "success");
      window.location.reload();
    } catch (error) {
      toast(error.message || "Gagal menyetujui pemeriksaan", "error");
      approveButton.disabled = false;
      approveButton.textContent = "Setujui Pemeriksaan";
    }
  });
}

// START

main().catch((error) => {
  console.error("Inspection detail error:", error);

  showError(error.message || "Gagal memuat detail pemeriksaan.");

  toast(error.message || "Gagal memuat detail pemeriksaan.", "error");
});
