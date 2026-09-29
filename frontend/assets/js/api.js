import { APP_CONFIG } from "./config-module.js";

const TOKEN_KEY = "he_token";
const USER_KEY = "he_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function hasPermission(perm) {
  const user = getStoredUser();
  return !!(user && Array.isArray(user.permissions) && user.permissions.includes(perm));
}

export function hasAnyPermission(...perms) {
  return perms.some((p) => hasPermission(p));
}

/**
 * @param {string} path - e.g. '/rooms' or 'rooms'
 * @param {RequestInit & { query?: Record<string, string|number|undefined|null> }} [options]
 */
export async function api(path, options = {}) {
  const base = (window.APP_CONFIG || APP_CONFIG).API_BASE_URL.replace(/\/$/, "");
  let url = `${base}/${String(path).replace(/^\//, "")}`;
  if (options.query) {
    const qs = new URLSearchParams();
    Object.entries(options.query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  console.log("FETCH URL:", url);
  const res = await fetch(url, { ...options, headers, body });
  const ct = res.headers.get("content-type") || "";

  if (
    res.ok &&
    (ct.includes("application/pdf") || (String(path).includes("/pdf") && !ct.includes("json")))
  ) {
    const blob = await res.blob();
    return { success: true, data: blob, pdf: true };
  }

  const json = await res.json().catch(() => ({
    success: false,
    error: { code: "PARSE_ERROR", message: "Respons tidak valid" },
  }));

  if (res.status === 401) {
    clearSession();
    if (!location.pathname.endsWith("login.html")) {
      location.href = resolveLoginPath();
    }
  }

  if (!json.success) {
    const err = new Error(json.error?.message || "Request gagal");
    err.code = json.error?.code;
    err.status = res.status;
    throw err;
  }

  return json;
}

function resolveLoginPath() {
  if (location.pathname.includes("/pages/")) return "../login.html";
  return "login.html";
}

export async function login(email, password) {
  const res = await api("/auth/login", { method: "POST", body: { email, password } });
  console.log("LOGIN API RESPONSE:", res);
  setSession(res.data.token, res.data.user);
  return res.data.user;
}

export async function logout() {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  clearSession();
  location.href = location.pathname.includes("/pages/") ? "../login.html" : "login.html";
}

export async function requireAuth() {
  const token = getToken();
  if (!token) {
    location.href = location.pathname.includes("/pages/") ? "../login.html" : "login.html";
    return null;
  }
  try {
    const res = await api("/me");
    setSession(token, res.data);
    return res.data;
  } catch {
    clearSession();
    location.href = location.pathname.includes("/pages/") ? "../login.html" : "login.html";
    return null;
  }
}

export { APP_CONFIG };

export function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const objectURL = URL.createObjectURL(blob);
  a.href = objectURL;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
}

export async function downloadInspectionPdf(id) {
  const res = await api(`/inspections/${id}/pdf`);
  downloadBlob(res.data, `pemeriksaan-${id}.pdf`);
}
