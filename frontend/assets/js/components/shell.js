import { logout, getStoredUser, hasPermission, api } from "../api.js";
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
  setTimeout(() => el.remove(), 3500);
}
