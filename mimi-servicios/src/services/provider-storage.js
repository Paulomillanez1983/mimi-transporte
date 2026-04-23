import { appConfig } from "../../config.js";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // noop
  }
}

function getStorageKey(name, fallback) {
  return appConfig?.storageKeys?.[name] ?? fallback;
}

export function saveProviderStatus(status) {
  localStorage.setItem(
    getStorageKey("providerStatus", "mimi_provider_status"),
    status ?? "OFFLINE"
  );
}

export function loadProviderStatus() {
  return (
    localStorage.getItem(getStorageKey("providerStatus", "mimi_provider_status")) ??
    "OFFLINE"
  );
}

export function saveActiveService(service) {
  writeJson(getStorageKey("activeService", "mimi_active_service"), service ?? null);
}

export function loadActiveService() {
  return readJson(getStorageKey("activeService", "mimi_active_service"), null);
}

export function saveNotifications(items) {
  const limit = appConfig?.providerUi?.notificationsMaxItems ?? 50;
  writeJson(
    getStorageKey("notifications", "mimi_provider_notifications"),
    Array.isArray(items) ? items.slice(0, limit) : []
  );
}

export function loadNotifications() {
  return readJson(
    getStorageKey("notifications", "mimi_provider_notifications"),
    []
  );
}

export function saveProviderMode(mode) {
  localStorage.setItem(
    getStorageKey("providerMode", "mimi_provider_mode"),
    mode ?? "client"
  );
}

export function loadProviderMode() {
  return (
    localStorage.getItem(getStorageKey("providerMode", "mimi_provider_mode")) ??
    "client"
  );
}

export function saveChatDraft(value) {
  localStorage.setItem(
    getStorageKey("chatDraft", "mimi_provider_chat_draft"),
    value ?? ""
  );
}

export function loadChatDraft() {
  return (
    localStorage.getItem(getStorageKey("chatDraft", "mimi_provider_chat_draft")) ??
    ""
  );
}

export function clearProviderSessionUi() {
  try {
    localStorage.removeItem(getStorageKey("activeService", "mimi_active_service"));
    localStorage.removeItem(getStorageKey("chatDraft", "mimi_provider_chat_draft"));
  } catch {
    // noop
  }
}
