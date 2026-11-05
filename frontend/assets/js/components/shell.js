import { logout, getStoredUser, api } from "../api.js";
import { escapeHtml, roleLabel } from "../utils/format.js";
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
} from "../ui.js";

/*
 * Inline icon set (24x24, stroke based) so the shell stays
 * dependency free while still looking crisp on every screen.
 */
const ICONS = {
  brand:
    '<path d="M12 3 4 6v6c0 4.4 3.4 8.4 8 9 4.6-.6 8-4.6 8-9V6l-8-3z"/><path d="M12 9v6M9 12h6"/>',
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  rooms:
    '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/>',
  checklist:
    '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  inspection:
    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/>',
  draft: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  history: '<path d="M3 12a9 9 0 1 0 2.7-6.4L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
};

function icon(name, className = "icon") {
  const body = ICONS[name] || "";
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

const NAV_SECTIONS = [
  {
    title: null,
    items: [
      {
        href: "dashboard.html",
        label: "Dashboard",
        icon: "dashboard",
        roles: ["SUPER_ADMIN", "KEPALA", "ANGGOTA"],
      },
    ],
  },

  {
    title: "Master Data",
    items: [
      {
        href: "rooms.html",
        label: "Ruangan",
        icon: "rooms",
        roles: ["SUPER_ADMIN", "KEPALA"],
      },
      {
        href: "checklist.html",
        label: "Item Pemeriksaan",
        icon: "checklist",
        roles: ["SUPER_ADMIN", "KEPALA"],
      },
    ],
  },

  {
    title: "Operasi",
    items: [
      {
        href: "inspection.html",
        label: "Pemeriksaan",
        icon: "inspection",
        roles: ["SUPER_ADMIN", "KEPALA", "ANGGOTA"],
      },
    ],
  },

  {
    title: "Review",
    items: [
      {
        href: "open-inspection.html",
        label: "Draft Pemeriksaan",
        icon: "draft",
        roles: ["SUPER_ADMIN", "KEPALA", "ANGGOTA"],
      },
      {
        href: "latest.html",
        label: "Riwayat Pemeriksaan",
        icon: "history",
        roles: ["SUPER_ADMIN", "KEPALA", "ANGGOTA"],
      },
    ],
  },

  {
    title: "Sistem",
    items: [
      {
        href: "users.html",
        label: "Pengguna",
        icon: "users",
        roles: ["SUPER_ADMIN", "KEPALA"],
      },
    ],
  },
];

/*
 * Toast
 */
export function toast(message, type = "info") {
  let box = document.querySelector(".toast-container");

  if (!box) {
    box = document.createElement("div");
    box.className = toastContainer;
    document.body.appendChild(box);
  }

  const el = document.createElement("div");

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
    const backdrop = document.createElement("div");

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

    backdrop.addEventListener("click", (e) => {
      const act = e.target.getAttribute("data-act");

      if (act === "ok") {
        backdrop.remove();
        resolve(true);
      } else if (act === "cancel" || e.target === backdrop) {
        backdrop.remove();
        resolve(false);
      }
    });
  });
}

/*
 * Generic modal
 */
export function openModal({ title, bodyHtml, onSubmit, submitLabel = "Simpan" }) {
  const backdrop = document.createElement("div");

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

  document.body.classList.add("modal-open");

  const close = () => {
    backdrop.remove();
    document.body.classList.remove("modal-open");
  };

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.getAttribute("data-act") === "close") {
      close();
    }
  });

  backdrop.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const form = e.target;

    const data = Object.fromEntries(new FormData(form).entries());

    try {
      await onSubmit(data, form);
      close();
    } catch (err) {
      toast(err.message || "Gagal menyimpan", "error");
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

  return NAV_SECTIONS.map((section) => {
    const items = section.items.filter((item) => !item.roles || item.roles.includes(role));

    const seen = new Set();

    const unique = items.filter((item) => {
      const key = item.href + item.label;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    });

    if (!unique.length) {
      return "";
    }

    const links = unique
      .map((item) => {
        const hrefFile = item.href.split("?")[0];

        const active = hrefFile === activePage || item.href === activePage;

        return `
            <a
              class="nav-link ${active ? "active" : ""}"
              href="${item.href}"
              ${active ? 'aria-current="page"' : ""}
            >
              <span class="nav-icon">${icon(item.icon)}</span>
              <span class="nav-label">${escapeHtml(item.label)}</span>
            </a>
          `;
      })
      .join("");

    return `
        <div class="nav-section">
          ${
            section.title
              ? `
                <div class="nav-section-title">
                  ${escapeHtml(section.title)}
                </div>
              `
              : ""
          }

          ${links}
        </div>
      `;
  }).join("");
}

/*
 * Mobile navigation drawer
 */
function bindNavDrawer(shell) {
  const sidebar = shell.querySelector(".sidebar");

  const overlay = shell.querySelector(".nav-overlay");

  const openBtn = shell.querySelector("#btn-nav-open");

  const closeBtn = shell.querySelector("#btn-nav-close");

  const open = () => {
    document.body.classList.add("nav-open");

    openBtn?.setAttribute("aria-expanded", "true");

    sidebar?.setAttribute("aria-hidden", "false");
  };

  const close = () => {
    document.body.classList.remove("nav-open");

    openBtn?.setAttribute("aria-expanded", "false");

    sidebar?.setAttribute("aria-hidden", "true");
  };

  openBtn?.addEventListener("click", open);

  closeBtn?.addEventListener("click", close);

  overlay?.addEventListener("click", close);

  sidebar?.querySelectorAll("a.nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        close();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
      close();
    }
  });

  const mq = window.matchMedia("(min-width: 1024px)");

  const syncDesktop = () => {
    if (mq.matches) {
      document.body.classList.remove("nav-open");

      sidebar?.removeAttribute("aria-hidden");

      openBtn?.setAttribute("aria-expanded", "false");
    } else {
      sidebar?.setAttribute("aria-hidden", "true");
    }
  };

  syncDesktop();

  if (mq.addEventListener) {
    mq.addEventListener("change", syncDesktop);
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
        href="${escapeHtml(options.mobileBack.href)}"
      >
        ←
        ${escapeHtml(options.mobileBack.label || "Kembali")}
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

  return parts.join("");
}

/*
 * Mount application shell
 */
export async function mountShell(activePage, options = {}) {
  const user = getStoredUser();

  const shell = document.getElementById("app");

  if (!shell) {
    return;
  }

  const content = shell.innerHTML;

  const crumb = renderBreadcrumb(options);

  const initials = (user?.name || "U")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const todayLabel = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const roleText = roleLabel(user?.role || "");

  shell.className = "app-shell";

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
          <span class="brand-mark-icon">
            ${icon("brand")}
          </span>

          <div class="brand-copy">
            <div class="brand-mark">
              RSKHKB Facility Ops
            </div>

            <div class="brand-name">
              Pemeriksaan Ruangan
            </div>
          </div>
        </div>

        <button
          type="button"
          class="${iconBtn} sidebar-close"
          id="btn-nav-close"
          aria-label="Tutup navigasi"
        >
          ${icon("close")}
        </button>

      </div>

      <nav>
        ${buildNav(activePage)}
      </nav>

      <div class="sidebar-foot">
        <span class="foot-avatar">${escapeHtml(initials)}</span>

        <div class="foot-copy">
          <strong>${escapeHtml(user?.name || "")}</strong>
          <span class="foot-role">${escapeHtml(roleText)}</span>
        </div>
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
            ${icon("menu")}
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
            role="search"
          >
            <span class="search-icon">
              ${icon("search")}
            </span>

            <input
              type="search"
              name="q"
              placeholder="Cari ruangan…"
              aria-label="Cari ruangan"
              autocomplete="off"
            />
          </form>
        </div>

        <div class="topbar-actions">

          <span class="topbar-date">
            ${escapeHtml(todayLabel)}
          </span>

          <span
            class="topbar-divider"
            aria-hidden="true"
          ></span>

          <button
            type="button"
            class="${iconBtn} notif-dot"
            id="btn-notif"
            aria-label="Notifikasi"
          >
            ${icon("bell", "bell-icon")}
          </button>

          <button
            type="button"
            class="${btnSecondary} ${btnSm} btn-logout-full"
            id="btn-logout"
          >
            ${icon("logout")}
            Keluar
          </button>

          <div class="user-menu-wrap">
            <button
              type="button"
              class="user-chip"
              id="btn-user-menu"
              aria-haspopup="menu"
              aria-expanded="false"
              aria-label="Menu pengguna"
              title="${escapeHtml(user?.name || "")}"
            >
              <span class="avatar">${escapeHtml(initials)}</span>

              <span class="user-meta">
                <strong>${escapeHtml(user?.name || "")}</strong>
                <span>${escapeHtml(roleText)}</span>
              </span>

              ${icon("chevron", "chevron")}
            </button>

            <div
              class="user-menu hidden"
              id="user-menu"
              role="menu"
            >
              <div class="user-menu-head">
                <strong>${escapeHtml(user?.name || "")}</strong>
                <span>${escapeHtml(user?.email || "")}</span>
              </div>

              <button
                type="button"
                class="user-menu-item"
                id="btn-user-logout"
                role="menuitem"
              >
                ${icon("logout")}
                Keluar
              </button>
            </div>
          </div>

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
   * Flash message left by the previous page (e.g. login -> dashboard)
   */
  const flash = sessionStorage.getItem("flash_toast");

  if (flash) {
    sessionStorage.removeItem("flash_toast");
    toast(flash, "success");
  }

  /*
   * Logout + user menu
   */
  document.getElementById("btn-logout")?.addEventListener("click", () => logout());

  const userMenuButton = document.getElementById("btn-user-menu");
  const userMenuPanel = document.getElementById("user-menu");

  const setUserMenu = (open) => {
    userMenuPanel?.classList.toggle("hidden", !open);
    userMenuButton?.setAttribute("aria-expanded", String(open));
  };

  userMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setUserMenu(userMenuPanel?.classList.contains("hidden"));
  });

  document.addEventListener("click", (event) => {
    if (!userMenuPanel || userMenuPanel.classList.contains("hidden")) return;
    if (event.target === userMenuButton || userMenuPanel.contains(event.target)) return;
    setUserMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setUserMenu(false);
  });

  document.getElementById("btn-user-logout")?.addEventListener("click", () => logout());

  /*
   * Global room search
   */
  document.getElementById("global-search-form")?.addEventListener("submit", (e) => {
    e.preventDefault();

    const q = new FormData(e.target).get("q");

    location.href = `rooms.html?q=${encodeURIComponent(String(q || ""))}`;
  });

  /*
   * Notifications
   */
  const btnNotif = document.getElementById("btn-notif");

  const panel = document.getElementById("notif-panel");

  try {
    const res = await api("/notifications");

    const notifications = res.data || [];

    const unread = notifications.filter((notification) => !notification.is_read).length;

    if (unread) {
      btnNotif?.setAttribute("data-count", String(unread));
    }

    btnNotif?.addEventListener("click", () => {
      panel.classList.toggle("hidden");

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
                      ${escapeHtml(notification.title)}
                    </strong>

                    <div class="notif-msg">
                      ${escapeHtml(notification.message)}
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
                        : ""
                    }

                  </div>
                `,
              )
              .join("") ||
            `
              <p class="${empty}">
                Tidak ada notifikasi
              </p>
            `
          }
        `;

      panel.querySelectorAll("[data-read]").forEach((btnEl) => {
        btnEl.addEventListener("click", async () => {
          try {
            await api(`/notifications/${btnEl.getAttribute("data-read")}/read`, {
              method: "PATCH",
            });

            btnEl.remove();

            toast("Ditandai dibaca", "success");
          } catch (err) {
            toast(err.message || "Gagal menandai notifikasi", "error");
          }
        });
      });
    });
  } catch {
    // Ignore notification errors.
  }
}
