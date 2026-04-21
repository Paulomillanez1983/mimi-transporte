import { loadMessages, sendProviderMessage } from "../services/service-api.js";
import { playMessageSound } from "../services/sound.js";
import { setState, state } from "../state/app-state.js";
import { loadChatDraft, saveChatDraft } from "../services/provider-storage.js";

export function openChatDrawer() {
  const drawer = document.getElementById("chatDrawer");
  if (!drawer) return;

  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");

  const input = document.getElementById("chatInput");
  if (input) {
    input.value = loadChatDraft();
  }
}

export function closeChatDrawer() {
  const drawer = document.getElementById("chatDrawer");
  if (!drawer) return;

  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
}

export async function loadConversationMessages(conversationId) {
  if (!conversationId) return [];

  const messages = await loadMessages(conversationId);

  setState((draft) => {
    draft.chat.conversationId = conversationId;
    draft.chat.messages = messages;
    draft.chat.unreadCount = messages.filter(
      (message) => !message.read_at && message.sender_user_id !== draft.session.userId,
    ).length;
  });

  return messages;
}

export async function sendChatMessage(body) {
  const conversationId = state.chat.conversationId || state.client.activeConversationId;
  if (!conversationId || !body?.trim()) return null;

  const message = await sendProviderMessage(conversationId, body.trim());

  setState((draft) => {
    draft.chat.messages.push(message);
  });

  saveChatDraft("");
  return message;
}

export function markMessagesRead() {
  setState((draft) => {
    draft.chat.unreadCount = 0;
  });
}

export function handleIncomingMessage(payload) {
  const message = payload?.new ?? payload?.record ?? payload;
  if (!message) return;

  setState((draft) => {
    const exists = draft.chat.messages.some((item) => item.id === message.id);
    if (!exists) {
      draft.chat.messages.push(message);

      if (message.sender_user_id !== draft.session.userId) {
        draft.chat.unreadCount += 1;
      }
    }
  });

  if (message.sender_user_id !== state.session.userId) {
    playMessageSound();
  }
}

export function bindChatDraftPersistence() {
  const input = document.getElementById("chatInput");
  if (!input) return;

  input.value = loadChatDraft();
  input.addEventListener("input", () => {
    saveChatDraft(input.value);
  });
}
