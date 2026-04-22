import { appConfig } from "../config.js";
import { searchProviders, prepareRequestPricing, createRequest, cancelRequest } from "./services/service-api.js";
import { patchState, setState, state, subscribe } from "./state/app-state.js";
import { renderApp } from "./ui/render.js";
import { bootstrapApp } from "./controllers/bootstrap-controller.js";
import { initMap } from "./services/map.js";
import { signInWithGoogle, signOut, subscribeToAuthChanges } from "./services/supabase.js";
import {
  acceptProviderOffer,
  advanceProviderFlow,
  refreshProviderOffers,
  rejectProviderOffer,
  restoreProviderActiveService,
  setProviderStatus,
} from "./controllers/provider-controller.js";
import {
  bindChatDraftPersistence,
  loadConversationMessages,
  markMessagesRead,
  openChatDrawer,
  sendChatMessage,
} from "./controllers/chat-controller.js";

function syncDraftFromForm() {
  patchState("requestDraft.address", document.getElementById("serviceAddressInput")?.value?.trim() ?? "");
  patchState("requestDraft.lat", Number(document.getElementById("serviceLatInput")?.value || state.requestDraft.lat));
  patchState("requestDraft.lng", Number(document.getElementById("serviceLngInput")?.value || state.requestDraft.lng));
  patchState("requestDraft.requestType", document.getElementById("requestTypeSelect")?.value ?? "IMMEDIATE");
  patchState("requestDraft.scheduledFor", document.getElementById("scheduledForInput")?.value ?? "");
  patchState("requestDraft.requestedHours", Number(document.getElementById("requestedHoursInput")?.value || 2));
}

function updateScheduledVisibility() {
  const wrapper = document.getElementById("scheduledForWrapper");
  if (!wrapper) return;
  wrapper.hidden = state.requestDraft.requestType !== "SCHEDULED";
}

function toggleDrawer(id, force) {
  const drawer = document.getElementById(id);
  if (!drawer) return;

  const open = force ?? !drawer.classList.contains("is-open");
  drawer.classList.toggle("is-open", open);
  drawer.setAttribute("aria-hidden", String(!open));
}

function reportUiError(error, fallbackMessage) {
  setState((draft) => {
    draft.meta.error = error?.message ?? fallbackMessage;
  });
}

function bindGlobalUI() {
  document.getElementById("enterServicesHub")?.addEventListener("click", () => {
    patchState("ui.appEntered", true);
  });

  document.getElementById("notificationsButton")?.addEventListener("click", () => {
    toggleDrawer("notificationsDrawer", true);
  });

  document.getElementById("chatButton")?.addEventListener("click", async () => {
    openChatDrawer();
    if (state.chat.conversationId) {
      await loadConversationMessages(state.chat.conversationId);
    }
    markMessagesRead();
  });

  document.querySelectorAll("[data-close-drawer]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleDrawer(button.dataset.closeDrawer, false);
    });
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      patchState("ui.activeMode", button.dataset.mode);
    });
  });

  document.addEventListener("click", async (event) => {
    try {
      const authButton = event.target.closest("[data-auth-action]");
      if (authButton) {
        const action = authButton.dataset.authAction;

        if (action === "login") {
          await signInWithGoogle();
        } else if (action === "enter") {
          patchState("ui.appEntered", true);
        }

        return;
      }

      if (event.target.closest("#authSecondaryButton")) {
        await signOut();
        window.location.reload();
        return;
      }

      const categoryButton = event.target.closest("[data-category-id]");
      if (categoryButton) {
        patchState("ui.selectedCategoryId", categoryButton.dataset.categoryId);
        return;
      }

      const providerButton = event.target.closest("[data-provider-select]");
      if (providerButton) {
        const providerId = providerButton.dataset.providerSelect;
        const pricing = await prepareRequestPricing({
          clientUserId: state.session.userId,
          categoryId: state.ui.selectedCategoryId,
          providerId,
          draft: state.requestDraft,
        });

        if (!pricing?.eligible) {
          setState((draft) => {
            draft.meta.error = pricing?.reason ?? "No pudimos preparar el precio.";
          });
          return;
        }

        const request = await createRequest({
          categoryId: state.ui.selectedCategoryId,
          selectedProviderId: providerId,
          address: state.requestDraft.address,
          serviceLat: Number(state.requestDraft.lat),
          serviceLng: Number(state.requestDraft.lng),
          requestType: state.requestDraft.requestType,
          scheduledFor: state.requestDraft.scheduledFor || null,
          requestedHours: Number(state.requestDraft.requestedHours),
        });

        setState((draft) => {
          draft.client.activeRequest = request;
          draft.client.selectedProvider = state.client.providers.find((item) => item.provider_id === providerId) ?? null;
          draft.meta.error = null;
          draft.meta.info = "Solicitud creada correctamente.";
        });

        return;
      }

      const offerActionButton = event.target.closest("[data-offer-action]");
      if (offerActionButton) {
        const offerId = offerActionButton.dataset.offerId;
        const action = offerActionButton.dataset.offerAction;

        if (action === "accept") {
          await acceptProviderOffer(offerId);
        } else {
          await rejectProviderOffer(offerId);
        }

        return;
      }

      const providerFlowButton = event.target.closest("[data-provider-flow]");
      if (providerFlowButton) {
        const action = providerFlowButton.dataset.providerFlow;

        if (action === "chat") {
          openChatDrawer();
          return;
        }

        await advanceProviderFlow(action);
        return;
      }

      const requestActionButton = event.target.closest("[data-request-action]");
      if (requestActionButton?.dataset.requestAction === "cancel") {
        const requestId = state.client.activeRequest?.id;
        if (!requestId) return;

        await cancelRequest(requestId);
        await restoreProviderActiveService();

        setState((draft) => {
          draft.client.activeRequest = null;
          draft.meta.error = null;
          draft.meta.info = "Solicitud cancelada.";
        });
      }
    } catch (error) {
      reportUiError(error, "No pudimos completar la accion.");
    }
  });

  document.querySelectorAll("[data-provider-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await setProviderStatus(button.dataset.providerStatus);
      } catch (error) {
        reportUiError(error, "No pudimos actualizar el estado del prestador.");
      }
    });
  });

  document.getElementById("requestTypeSelect")?.addEventListener("change", () => {
    syncDraftFromForm();
    updateScheduledVisibility();
  });

  document.getElementById("requestForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      syncDraftFromForm();

      const providers = await searchProviders(
        state.ui.selectedCategoryId,
        state.requestDraft,
      );

      setState((draft) => {
        draft.client.providers = providers;
        draft.meta.error = null;
        draft.meta.info = providers.length
          ? "Prestadores actualizados."
          : "No encontramos prestadores para ese criterio.";
        draft.meta.lastSearchAt = new Date().toISOString();
      });
    } catch (error) {
      reportUiError(error, "No pudimos buscar prestadores.");
    }
  });

  document.getElementById("chatForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const input = document.getElementById("chatInput");
    const body = input?.value?.trim();

    if (!body) return;

    try {
      await sendChatMessage(body);
    } catch (error) {
      reportUiError(error, "No pudimos enviar el mensaje.");
      return;
    }

    if (input) input.value = "";
  });

  bindChatDraftPersistence();
  updateScheduledVisibility();
}

subscribe(renderApp);
initMap("trackingMap");
bindGlobalUI();

try {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
} catch {
  // noop
}

let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

document.getElementById("installButton")?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice.catch(() => {});
  deferredInstallPrompt = null;
});

const authSubscription = subscribeToAuthChanges(() => {
  window.location.reload();
});

bootstrapApp().catch((error) => {
  setState((draft) => {
    draft.meta.error = error?.message ?? "No pudimos iniciar la app.";
  });
});

window.addEventListener("beforeunload", () => {
  authSubscription?.unsubscribe?.();
});
