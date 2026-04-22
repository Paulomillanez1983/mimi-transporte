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

export function saveProviderStatus(status) {
  localStorage.setItem(appConfig.storageKeys.providerStatus, status ?? "OFFLINE");
}

export function loadProviderStatus() {
  return localStorage.getItem(appConfig.storageKeys.providerStatus) ?? "OFFLINE";
}

export function saveActiveService(service) {
  writeJson(appConfig.storageKeys.activeService, service ?? null);
}

export function loadActiveService() {
  return readJson(appConfig.storageKeys.activeService, null);
}

export function saveNotifications(items) {
  const limit = appConfig.providerUi.notificationsMaxItems ?? 50;
  writeJson(appConfig.storageKeys.notifications, Array.isArray(items) ? items.slice(0, limit) : []);
}

export function loadNotifications() {
  return readJson(appConfig.storageKeys.notifications, []);
}

export function saveProviderMode(mode) {
  localStorage.setItem(appConfig.storageKeys.providerMode, mode ?? "client");
}

export function loadProviderMode() {
  return localStorage.getItem(appConfig.storageKeys.providerMode) ?? "client";
}

export function saveChatDraft(value) {
  localStorage.setItem(appConfig.storageKeys.chatDraft, value ?? "");
}

export function loadChatDraft() {
  return localStorage.getItem(appConfig.storageKeys.chatDraft) ?? "";
}

export function clearProviderSessionUi() {
  try {
    localStorage.removeItem(appConfig.storageKeys.activeService);
    localStorage.removeItem(appConfig.storageKeys.chatDraft);
  } catch {
    // noop
  }
}
