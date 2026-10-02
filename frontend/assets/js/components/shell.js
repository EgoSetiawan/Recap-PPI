import { logout, getStoredUser, api } from '../api.js';
import { escapeHtml, roleLabel } from '../utils/format.js';
import {
  btn,
  btnSecondary,
  btnSm,
  iconBtn,
  modalBackdrop,
  modal,
  modalHeader,
  modalBody,
  modalFooter,
  toastContainer,
  toastClass,
  card,
  empty,
} from '../ui.js';

const NAV_SECTIONS = [
  {
    title: null,
    items: [
      {
        href: 'dashboard.html',
        label: 'Dashboard',
        roles: ['SUPER_ADMIN', 'KEPALA', 'ANGGOTA'],
      },
    ],
  },

  {
    title: 'Master Data',
    items: [
      {
        href: 'rooms.html',
        label: 'Ruangan',
        roles: ['SUPER_ADMIN'],
      },
      {
        href: 'checklist.html',
        label: 'Item Pemeriksaan',
        roles: ['SUPER_ADMIN'],
      },
    ],
  },

  {
    title: 'Operasi',
    items: [
      {
        href: 'inspection.html',
        label: 'Pemeriksaan',
        roles: ['ANGGOTA'],
      },
    ],
  },

  {
    title: 'Review',
    items: [
      {
        href: 'latest.html',
        label: 'Pemeriksaan Terbaru',
        roles: ['KEPALA'],
      },
      {
        href: 'history.html',
        label: 'Riwayat Pemeriksaan',
        roles: ['SUPER_ADMIN', 'KEPALA'],
      },
    ],
  },

  {
    title: 'Sistem',
    items: [
      {
        href: 'users.html',
        label: 'Pengguna',
        roles: ['SUPER_ADMIN'],
      },
      {
        href: 'audit.html',
        label: 'Audit Log',
        roles: ['SUPER_ADMIN'],
      },
      {
        href: 'settings.html',
        label: 'Pengaturan',
        roles: ['SUPER_ADMIN'],
      },
    ],
  },
];

/*
 * Toast
 */
export function toast(message, type = 'info') {
  let box = document.querySelector('.toast-container');

  if (!box) {
    box = document.createElement('div');
    box.className = toastContainer;
    document.body.appendChild(box);
  }

  const el = document.createElement('div');

  el.className = toastClass(type);
  el.textContent = message;

  box.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 3500);
}

/*
 * Confirmation dialog
 */
export function confirmDialog(message) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');

    backdrop.className = modalBackdrop;

    backdrop.innerHTML = `
      <div
        class="${modal}"
        role="dialog"
        aria-modal="true"
      >
        <div class="${modalHeader}">
          <h3>Konfirmasi</h3>
        </div>

        <div class="${modalBody}">
          <p>${escapeHtml(message)}</p>
        </div>

        <div class="${modalFooter}">
          <button
            type="button"
            class="${btnSecondary}"
            data-act="cancel"
          >
            Batal
          </button>

          <button
            type="button"
            class="${btn}"
            data-act="ok"
          >
            Ya, lanjutkan
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => {
      const act = e.target.getAttribute('data-act');

      if (act === 'ok') {
        backdrop.remove();
        resolve(true);
      } else if (
        act === 'cancel' ||
        e.target === backdrop
      ) {
        backdrop.remove();
        resolve(false);
      }
    });
  });
}

/*
 * Generic modal
 */
export function openModal({
  title,
  bodyHtml,
  onSubmit,
  submitLabel = 'Simpan',
}) {
  const backdrop = document.createElement('div');

  backdrop.className = modalBackdrop;

  backdrop.innerHTML = `
    <div
      class="${modal}"
      role="dialog"
      aria-modal="true"
    >
      <div class="${modalHeader}">
        <h3>${escapeHtml(title)}</h3>

        <button
          type="button"
          class="${iconBtn} modal-close"
          data-act="close"
          aria-label="Tutup"
        >
          ✕
        </button>
      </div>

      <form class="modal-form">
        <div class="${modalBody}">
          ${bodyHtml}
        </div>

        <div class="${modalFooter}">
          <button
            type="button"
            class="${btnSecondary}"
            data-act="close"
          >
            Batal
          </button>

          <button
            type="submit"
            class="${btn}"
          >
            ${escapeHtml(submitLabel)}
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  document.body.classList.add('modal-open');

  const close = () => {
    backdrop.remove();
    document.body.classList.remove('modal-open');
  };

  backdrop.addEventListener('click', (e) => {
    if (
      e.target === backdrop ||
      e.target.getAttribute('data-act') === 'close'
    ) {
      close();
    }
  });

  backdrop
    .querySelector('form')
    .addEventListener('submit', async (e) => {
      e.preventDefault();

      const form = e.target;

      const data = Object.fromEntries(
        new FormData(form).entries()
      );

      try {
        await onSubmit(data, form);
        close();
      } catch (err) {
        toast(
          err.message || 'Gagal menyimpan',
          'error'
        );
      }
    });

  return backdrop;
}

/*
 * Build navigation based on role.
 */
function buildNav(activePage) {
  const user = getStoredUser();
  const role = user?.role;

  return NAV_SECTIONS
    .map((section) => {
      const items = section.items.filter(
        (item) =>
          !item.roles ||
          item.roles.includes(role)
      );

      const seen = new Set();

      const unique = items.filter((item) => {
        const key =
          item.href + item.label;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      });

      if (!unique.length) {
        return '';
      }

      const links = unique
        .map((item) => {
          const hrefFile =
            item.href.split('?')[0];

          const active =
            hrefFile === activePage ||
            item.href === activePage;

          return `
            <a
              class="nav-link ${active ? 'active' : ''}"
              href="${item.href}"
            >
              ${escapeHtml(item.label)}
            </a>
          `;
        })
        .join('');

      return `
        <div class="nav-section">
          ${
            section.title
              ? `
                <div class="nav-section-title">
                  ${escapeHtml(section.title)}
                </div>
              `
              : ''
          }

          ${links}
        </div>
      `;
    })
    .join('');
}

/*
 * Mobile navigation drawer
 */
function bindNavDrawer(shell) {
  const sidebar =
    shell.querySelector('.sidebar');

  const overlay =
    shell.querySelector('.nav-overlay');

  const openBtn =
    shell.querySelector('#btn-nav-open');

  const closeBtn =
    shell.querySelector('#btn-nav-close');

  const open = () => {
    document.body.classList.add('nav-open');

    openBtn?.setAttribute(
      'aria-expanded',
      'true'
    );

    sidebar?.setAttribute(
      'aria-hidden',
      'false'
    );
  };

  const close = () => {
    document.body.classList.remove(
      'nav-open'
    );

    openBtn?.setAttribute(
      'aria-expanded',
      'false'
    );

    sidebar?.setAttribute(
      'aria-hidden',
      'true'
    );
  };

  openBtn?.addEventListener(
    'click',
    open
  );

  closeBtn?.addEventListener(
    'click',
    close
  );

  overlay?.addEventListener(
    'click',
    close
  );

  sidebar
    ?.querySelectorAll('a.nav-link')
    .forEach((link) => {
      link.addEventListener('click', () => {
        if (
          window.matchMedia(
            '(max-width: 1023px)'
          ).matches
        ) {
          close();
        }
      });
    });

  document.addEventListener(
    'keydown',
    (e) => {
      if (
        e.key === 'Escape' &&
        document.body.classList.contains(
          'nav-open'
        )
      ) {
        close();
      }
    }
  );

  const mq = window.matchMedia(
    '(min-width: 1024px)'
  );

  const syncDesktop = () => {
    if (mq.matches) {
      document.body.classList.remove(
        'nav-open'
      );

      sidebar?.removeAttribute(
        'aria-hidden'
      );

      openBtn?.setAttribute(
        'aria-expanded',
        'false'
      );
    } else {
      sidebar?.setAttribute(
        'aria-hidden',
        'true'
      );
    }
  };

  syncDesktop();

  if (mq.addEventListener) {
    mq.addEventListener(
      'change',
      syncDesktop
    );
  } else {
    mq.addListener(syncDesktop);
  }
}

/*
 * Breadcrumb
 */
function renderBreadcrumb(options = {}) {
  const parts = [];

  if (options.mobileBack?.href) {
    parts.push(`
      <a
        class="breadcrumb-back"
        href="${escapeHtml(
          options.mobileBack.href
        )}"
      >
        ←
        ${escapeHtml(
          options.mobileBack.label ||
            'Kembali'
        )}
      </a>
    `);
  }

  if (options.breadcrumb) {
    parts.push(`
      <div class="breadcrumb breadcrumb-full">
        ${options.breadcrumb}
      </div>
    `);
  }

  return parts.join('');
}

/*
 * Mount application shell
 */
export async function mountShell(
  activePage,
  options = {}
) {
  const user = getStoredUser();

  const shell =
    document.getElementById('app');

  if (!shell) {
    return;
  }

  const content = shell.innerHTML;

  const crumb =
    renderBreadcrumb(options);

  const initials = (
    user?.name || 'U'
  )
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  shell.className = 'app-shell';

  shell.innerHTML = `
    <div
      class="nav-overlay"
      aria-hidden="true"
    ></div>

    <aside
      class="sidebar"
      id="app-sidebar"
      aria-label="Navigasi utama"
    >
      <div class="sidebar-top">

        <div class="brand">
          <div class="brand-mark">
            RSKHKB Facility Ops
          </div>

          <div class="brand-name">
            Pemeriksaan Ruangan
          </div>
        </div>

        <button
          type="button"
          class="${iconBtn} sidebar-close"
          id="btn-nav-close"
          aria-label="Tutup navigasi"
        >
          ✕
        </button>

      </div>

      <nav>
        ${buildNav(activePage)}
      </nav>

      <div class="sidebar-foot">
        <strong>
          ${escapeHtml(
            user?.name || ''
          )}
        </strong>

        ${escapeHtml(
          roleLabel(
            user?.role || ''
          )
        )}
      </div>
    </aside>

    <div class="main">

      <header class="topbar">

        <div class="topbar-start">

          <button
            type="button"
            class="${iconBtn} nav-toggle"
            id="btn-nav-open"
            aria-label="Buka navigasi"
            aria-controls="app-sidebar"
            aria-expanded="false"
          >
            ☰
          </button>

          <div
            class="topbar-brand"
            aria-hidden="false"
          >
            RSU Dr. H. Koesnadi
          </div>

          <form
            class="topbar-search"
            id="global-search-form"
          >
            <label
              class="sr-only"
              for="global-search-input"
            >
              Cari ruangan
            </label>

            <input
              id="global-search-input"
              type="search"
              name="q"
              placeholder="Cari kode atau nama ruangan…"
              autocomplete="off"
            />
          </form>

        </div>

        <div class="topbar-actions">

          <button
            type="button"
            class="${btnSecondary} ${btnSm} notif-dot"
            id="btn-notif"
            aria-label="Notifikasi"
          >
            <span
              class="notif-icon"
              aria-hidden="true"
            >
              N
            </span>

            <span class="notif-label">
              Notifikasi
            </span>
          </button>

          <button
            type="button"
            class="${btnSecondary} ${btnSm} btn-logout-full"
            id="btn-logout"
          >
            Keluar
          </button>

          <button
            type="button"
            class="${iconBtn} user-chip"
            id="btn-user-menu"
            aria-label="${escapeHtml(
              user?.name || 'Pengguna'
            )}"
            title="${escapeHtml(
              user?.name || ''
            )} — Keluar"
          >
            ${escapeHtml(initials)}
          </button>

        </div>

      </header>

      <div
        class="content content-max"
        id="page-content"
      >
        ${crumb}
        ${content}
      </div>

    </div>

    <div
      id="notif-panel"
      class="${card} notif-panel hidden"
    ></div>
  `;

  bindNavDrawer(shell);

  /*
   * Logout
   */
  document
    .getElementById('btn-logout')
    ?.addEventListener(
      'click',
      () => logout()
    );

  document
    .getElementById('btn-user-menu')
    ?.addEventListener(
      'click',
      () => logout()
    );

  /*
   * Global room search
   */
  document
    .getElementById('global-search-form')
    ?.addEventListener(
      'submit',
      (e) => {
        e.preventDefault();

        const q = new FormData(
          e.target
        ).get('q');

        location.href =
          `rooms.html?q=${encodeURIComponent(
            String(q || '')
          )}`;
      }
    );

  /*
   * Notifications
   */
  const btnNotif =
    document.getElementById(
      'btn-notif'
    );

  const panel =
    document.getElementById(
      'notif-panel'
    );

  try {
    const res =
      await api('/notifications');

    const notifications =
      res.data || [];

    const unread =
      notifications.filter(
        (notification) =>
          !notification.is_read
      ).length;

    if (unread) {
      btnNotif?.setAttribute(
        'data-count',
        String(unread)
      );
    }

    btnNotif?.addEventListener(
      'click',
      () => {
        panel.classList.toggle(
          'hidden'
        );

        panel.innerHTML = `
          <h3 class="notif-panel-title">
            Notifikasi
          </h3>

          ${
            notifications
              .map(
                (notification) => `
                  <div class="notif-item">

                    <strong>
                      ${escapeHtml(
                        notification.title
                      )}
                    </strong>

                    <div class="notif-msg">
                      ${escapeHtml(
                        notification.message
                      )}
                    </div>

                    ${
                      !notification.is_read
                        ? `
                          <button
                            class="${btnSecondary} ${btnSm}"
                            data-read="${notification.id}"
                          >
                            Tandai dibaca
                          </button>
                        `
                        : ''
                    }

                  </div>
                `
              )
              .join('') ||
            `
              <p class="${empty}">
                Tidak ada notifikasi
              </p>
            `
          }
        `;

        panel
          .querySelectorAll(
            '[data-read]'
          )
          .forEach((btnEl) => {
            btnEl.addEventListener(
              'click',
              async () => {
                try {
                  await api(
                    `/notifications/${btnEl.getAttribute(
                      'data-read'
                    )}/read`,
                    {
                      method: 'PATCH',
                    }
                  );

                  btnEl.remove();

                  toast(
                    'Ditandai dibaca',
                    'success'
                  );
                } catch (err) {
                  toast(
                    err.message ||
                      'Gagal menandai notifikasi',
                    'error'
                  );
                }
              }
            );
          });
      }
    );
  } catch {
    // Ignore notification errors.
  }
}