/*
 * Class strings for dynamically rendered UI.
 *
 * Presentation lives in CSS (theme.css / app.css), so these
 * constants only carry semantic class names. That keeps the
 * runtime markup readable and avoids utility classes fighting
 * the design system.
 */

export const btn = "btn";

export const btnSecondary = "btn btn-secondary";

export const btnDanger = "btn btn-danger";

export const btnSm = "btn-sm";

export const iconBtn = "icon-btn";

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

export const card = "card";
export const panel = "panel";
export const section = "section";
export const sectionHeader = "section-header";
export const sectionBody = "section-body";

export const formGroup = "form-group";
export const formRow = "form-row";
export const filters = "filters";

export const tableWrap = "table-wrap";
export const dataTable = "data";
export const tableToolbar = "table-toolbar";

export const modalBackdrop = "modal-backdrop";
export const modal = "modal";
export const modalHeader = "modal-header";
export const modalBody = "modal-body";
export const modalFooter = "modal-footer";

export const toastContainer = "toast-container";

export function toastClass(type = "info") {
  if (type === "error") return "toast error";
  if (type === "success") return "toast success";
  return "toast";
}

export const pageHeader = "page-header";
export const empty = "empty";
export const statGrid = "stat-grid";
export const statCard = "stat-card";
export const textarea = "app-textarea";
