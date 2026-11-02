import { requireAuth, api } from "../api.js";
import { mountShell, toast } from "../components/shell.js";
import { escapeHtml, formatMonth } from "../utils/format.js";
import { btn, btnSecondary, btnSm, tableWrap, empty, statCard, badge } from "../ui.js";

const STAT_ICONS = {
  rooms:
    '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/>',
  inspections:
    '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/><path d="m9 15 2 2 3.5-3.5"/>',
  open: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  submitted:
    '<path d="M4 5h16v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M4 6h16l-7 6a2 2 0 0 1-2 0z"/><path d="M9 22h6"/>',
  approved: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
};

function statIcon(path) {
  return `<span class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg></span>`;
}

function inspectionStatusBadge(status) {
  const map = {
    OPEN: {
      kind: "warn",
      label: "Open",
    },
    SUBMITTED: {
      kind: "info",
      label: "Menunggu Review",
    },
    APPROVED: {
      kind: "good",
      label: "Disetujui",
    },
    REJECTED: {
      kind: "danger",
      label: "Ditolak",
    },
  };

  const item = map[status] || {
    kind: "muted",
    label: status || "—",
  };

  return `<span class="${badge(item.kind)}">${escapeHtml(item.label)}</span>`;
}

async function main() {
  const user = await requireAuth();

  if (!user) return;

  await mountShell("dashboard.html", {
    breadcrumb: `<a href="dashboard.html">Beranda</a><span>/</span>Dashboard`,
  });

  try {
    const { data } = await api("/dashboard");

    const totals = data.totals || {};
    const isAnggota = user.role === "ANGGOTA";

    // Subtitle
    const today = new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());

    const monthLabel = new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
    }).format(new Date());

    document.getElementById("dash-subtitle").textContent = isAnggota
      ? `${today} — ringkasan ruangan dan pemeriksaan yang menjadi tanggung jawab Anda.`
      : `${today} — monitoring ruangan dan pemeriksaan unit PPI.`;

    // Statistics
    const cards = [
      {
        label: "Total Ruangan",
        value: totals.rooms,
        tone: "accent",
        icon: STAT_ICONS.rooms,
        hint: "Ruangan terdaftar",
      },
      {
        label: "Pemeriksaan",
        value: totals.inspections_month,
        tone: "",
        icon: STAT_ICONS.inspections,
        hint: monthLabel,
      },
      {
        label: "Open",
        value: totals.open,
        tone: "warning",
        icon: STAT_ICONS.open,
        hint: "Belum selesai",
      },
      {
        label: "Menunggu Review",
        value: totals.submitted,
        tone: "info",
        icon: STAT_ICONS.submitted,
        hint: "Perlu validasi kepala",
      },
      {
        label: "Disetujui",
        value: totals.approved,
        tone: "success",
        icon: STAT_ICONS.approved,
        hint: "Selesai diverifikasi",
      },
    ];

    document.getElementById("stats").innerHTML = cards
      .map(
        (s) => `
          <div class="${statCard}"${s.tone ? ` data-tone="${s.tone}"` : ""}>
            ${statIcon(s.icon)}
            <div class="stat-copy">
              <div class="label">${escapeHtml(s.label)}</div>
              <div class="value">${s.value ?? 0}</div>
              <div class="stat-hint">${escapeHtml(s.hint)}</div>
            </div>
          </div>
        `,
      )
      .join("");

    // Anggota action
    document.getElementById("inspector-actions").innerHTML = isAnggota
      ? `
        <a class="${btn} ${btnSm}" href="inspection.html">
          Mulai Pemeriksaan
        </a>
      `
      : "";

    // Recent inspections
    document.getElementById("list-title").textContent = "Pemeriksaan Terbaru";
    const rows = data.recent_inspections || [];
    document.getElementById("critical-list").innerHTML = `
      <div class="${tableWrap}">
        <table class="data" style="border:none">
          <thead>
            <tr>
              <th class="hide-sm">Bulan</th>
              <th>Ruangan</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            ${
              rows
                .map(
                  (i) => `
                    <tr>
                      <td class="hide-sm">
                        ${formatMonth(i.inspection_month)}
                      </td>

                      <td>
                        <span class="cell-title">${escapeHtml(i.room?.name || "-")}</span>
                        <small class="cell-sub">${formatMonth(i.inspection_month)}</small>
                      </td>

                      <td>
                        ${inspectionStatusBadge(i.status)}
                      </td>

                      <td class="row-actions">
                        <a
                          class="${btnSecondary} ${btnSm}"
                          href="inspection-detail?id=${i.id}"
                        >
                          Lihat
                        </a>
                      </td>
                    </tr>
                  `,
                )
                .join("") ||
              `
                <tr>
                  <td colspan="4" class="${empty}">
                    Belum ada pemeriksaan
                  </td>
                </tr>
              `
            }
          </tbody>
        </table>
      </div>
    `;

    // Inspection status summary
    const statusSummary = [
      {
        key: "open",
        label: "Open",
        color: "warn",
      },
      {
        key: "submitted",
        label: "Menunggu Review",
        color: "info",
      },
      {
        key: "approved",
        label: "Disetujui",
        color: "good",
      },
    ];

    const totalInspections =
      (totals.open || 0) +
      (totals.submitted || 0) +
      (totals.approved || 0) +
      (totals.rejected || 0);

    document.getElementById("status-bars").innerHTML = statusSummary
      .map((item) => {
        const value = totals[item.key] || 0;

        const percentage = totalInspections > 0 ? Math.round((value / totalInspections) * 100) : 0;

        return `
          <div class="bar-row">
            <span>${escapeHtml(item.label)}</span>

            <div class="bar-track">
              <div
                class="bar-fill ${item.color}"
                style="width:${percentage}%"
              ></div>
            </div>

            <strong>
              ${value} (${percentage}%)
            </strong>
          </div>
        `;
      })
      .join("");
  } catch (e) {
    console.error("Dashboard error:", e);
    toast(e.message || "Gagal memuat dashboard", "error");
  }
}

main();
