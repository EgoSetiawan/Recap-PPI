import { requireAuth, api } from '../api.js';
import { mountShell, toast } from '../components/shell.js';
import {
  escapeHtml,
  formatDate,
  statusBadge,
} from '../utils/format.js';
import {
  btn,
  btnSecondary,
  btnSm,
  tableWrap,
  empty,
  statCard,
} from '../ui.js';

async function main() {
  const user = await requireAuth();
  if (!user) return;

  await mountShell('dashboard.html', {
    breadcrumb: `<a href="dashboard.html">Beranda</a><span>/</span>Dashboard`,
  });

  try {
    const { data } = await api('/dashboard');

    const totals = data.totals || {};
    const isAnggota = user.role === 'ANGGOTA';

    // Subtitle
    document.getElementById('dash-subtitle').textContent =
      isAnggota
        ? 'Ringkasan ruangan dan pemeriksaan yang menjadi tanggung jawab Anda.'
        : 'Monitoring ruangan dan pemeriksaan.';

    // Statistics
    const cards = [
      {
        label: 'Total Ruangan',
        value: totals.rooms,
      },
      {
        label: 'Pemeriksaan Bulan Ini',
        value: totals.inspections_month,
      },
      {
        label: 'Open',
        value: totals.open,
      },
      {
        label: 'Menunggu Review',
        value: totals.submitted,
      },
      {
        label: 'Disetujui',
        value: totals.approved,
      },
    ];

    document.getElementById('stats').innerHTML = cards
      .map(
        (s) => `
          <div class="${statCard}">
            <div class="label">${s.label}</div>
            <div class="value">${s.value ?? 0}</div>
          </div>
        `
      )
      .join('');

    // Anggota action
    document.getElementById('inspector-actions').innerHTML =
      isAnggota
        ? `<a class="${btn} ${btnSm}" href="inspection.html">
             Mulai Pemeriksaan
           </a>`
        : '';

    // Recent inspections
    document.getElementById('list-title').textContent =
      'Pemeriksaan Terbaru';

    const rows = data.recent_inspections || [];

    document.getElementById('critical-list').innerHTML = `
      <div class="${tableWrap}">
        <table class="data" style="border:none">
          <thead>
            <tr>
              <th>Bulan</th>
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
                      <td>
                        ${formatDate(i.inspection_month)}
                      </td>

                      <td>
                        ${escapeHtml(i.room?.name || '-')}
                      </td>

                      <td>
                        ${statusBadge(i.status)}
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
                  `
                )
                .join('') ||
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
        key: 'open',
        label: 'Open',
      },
      {
        key: 'submitted',
        label: 'Menunggu Review',
      },
      {
        key: 'approved',
        label: 'Disetujui',
      },
    ];

    const totalInspections = totals.inspections_month || 0;

    document.getElementById('status-bars').innerHTML =
      statusSummary
        .map((item) => {
          const value = totals[item.key] || 0;

          const percentage =
            totalInspections > 0
              ? Math.round(
                  (value / totalInspections) * 100
                )
              : 0;

          return `
            <div class="bar-row">
              <span>${item.label}</span>

              <div class="bar-track">
                <div
                  class="bar-fill"
                  style="width:${percentage}%"
                ></div>
              </div>

              <strong>
                ${value} (${percentage}%)
              </strong>
            </div>
          `;
        })
        .join('');
  } catch (e) {
    toast(e.message, 'error');
  }
}

main();