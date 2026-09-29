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

export const toastContainer =
  "toast-container pointer-events-none fixed top-4 right-4 left-4 z-[200] flex flex-col items-end gap-2 lg:left-auto";

export function toastClass(type = "info") {
  const base =
    "toast pointer-events-auto w-[min(360px,100%)] rounded-xl border-l-4 px-3.5 py-3 text-[13px] break-words text-white shadow-md";
  if (type === "error") return `${base} error border-l-[#e08a82] bg-[#5c2a26]`;
  if (type === "success") return `${base} success border-l-[#7cbc9a] bg-[#244536]`;
  return `${base} border-l-[#6b8fb8] bg-sidebar`;
}
