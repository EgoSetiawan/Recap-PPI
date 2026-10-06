export const btn =
  "btn inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent bg-primary px-4 py-2 text-[13px] leading-snug font-semibold whitespace-nowrap text-white no-underline shadow-sm transition-all duration-150 hover:bg-primary-hover hover:text-white hover:no-underline hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none";

export const btnSecondary =
  "btn btn-secondary inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-[13px] leading-snug font-semibold whitespace-nowrap text-text no-underline shadow-sm transition-all duration-150 hover:border-border-strong hover:bg-surface-alt hover:text-text hover:no-underline disabled:cursor-not-allowed disabled:opacity-55";

export const btnDanger =
  "btn btn-danger inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-danger bg-danger px-4 py-2 text-[13px] leading-snug font-semibold whitespace-nowrap text-white no-underline shadow-sm transition-all duration-150 hover:bg-[#8c322a] hover:text-white hover:no-underline disabled:cursor-not-allowed disabled:opacity-55";

export const btnSm = "btn-sm min-h-8 rounded-md px-3 py-1.5 text-xs";

export const iconBtn =
  "icon-btn inline-flex min-h-(--spacing-touch) min-w-(--spacing-touch) shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface p-0 text-base font-semibold text-text shadow-sm transition-all duration-150 hover:border-border-strong hover:bg-surface-alt";

export function button(variant = "primary", size = "md") {
  const base = variant === "secondary" ? btnSecondary : variant === "danger" ? btnDanger : btn;
  return size === "sm" ? `${base} ${btnSm}` : base;
}

const BADGE_KIND = {
  good: "badge badge-good",
  warn: "badge badge-warn",
  danger: "badge badge-danger",
  info: "badge badge-info",
  muted: "badge badge-muted",
};

export function badge(kind = "muted") {
  return BADGE_KIND[kind] || BADGE_KIND.muted;
}

export function alert(kind = "info") {
  if (kind === "error") return "alert alert-error";
  if (kind === "failed") return "alert-failed";
  return "alert alert-info";
}

export const card = "card rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm";
export const panel = "panel rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm";
export const section =
  "section mb-4 overflow-hidden rounded-xl border border-border bg-surface shadow-sm";
export const sectionHeader =
  "section-header border-b border-border bg-surface-alt/80 px-4 py-3 text-[13px] font-semibold tracking-tight";
export const sectionBody = "section-body px-4 py-3.5";

export const formGroup = "form-group mb-3.5 flex min-w-0 flex-col gap-1.5";
export const formRow = "form-row grid grid-cols-1 gap-3.5 md:grid-cols-2";
export const filters =
  "filters mb-3.5 grid grid-cols-1 items-end gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-sm sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]";

export const tableWrap = "table-wrap max-w-full w-full overflow-x-auto rounded-xl";
export const dataTable =
  "data min-w-[560px] w-full border-collapse overflow-hidden rounded-xl border border-border bg-surface text-[13px] shadow-sm";
export const tableToolbar =
  "table-toolbar mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface px-3.5 py-3 shadow-sm";

export const modalBackdrop =
  "modal-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(26,40,56,0.45)] p-0 backdrop-blur-[2px] lg:items-center lg:p-5";
export const modal =
  "modal flex max-h-[92vh] w-full max-w-full flex-col overflow-auto rounded-t-2xl border border-border bg-white shadow-md lg:w-[min(520px,100%)] lg:rounded-2xl max-md:h-full max-md:max-h-screen max-md:rounded-none";
export const modalHeader =
  "modal-header sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-border bg-surface-alt/90 px-4 py-3.5 backdrop-blur-sm";
export const modalBody = "modal-body flex-1 overflow-auto p-4";
export const modalFooter =
  "modal-footer sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface-alt/90 px-4 py-3.5 backdrop-blur-sm lg:flex-row lg:justify-end";

export const toastContainer =
  "toast-container pointer-events-none fixed top-4 right-4 left-4 z-[200] flex flex-col items-end gap-2 lg:left-auto";

export function toastClass(type = "info") {
  const base =
    "toast pointer-events-auto w-[min(360px,100%)] rounded-xl border-l-4 px-3.5 py-3 text-[13px] break-words text-white shadow-md";
  if (type === "error") return `${base} error border-l-[#e08a82] bg-[#5c2a26]`;
  if (type === "success") return `${base} success border-l-[#7cbc9a] bg-[#244536]`;
  return `${base} border-l-[#6b8fb8] bg-sidebar`;
}

export const pageHeader = "page-header mb-5 flex flex-wrap items-start justify-between gap-4";
export const empty = "empty p-5 py-8 text-center text-[13px] text-muted";
export const statGrid =
  "stat-grid mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]";
export const statCard =
  "stat-card min-w-0 rounded-xl border border-border bg-surface px-4 py-3.5 shadow-sm transition-shadow duration-150 hover:shadow-md";
