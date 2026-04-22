import { appConfig } from "../../config.js";
import {
  acceptOffer,
  completeService,
  loadActiveRequest,
  loadConversationForRequest,
  loadMessages,
  loadProviderOffers,
  markProviderArrived,
  markProviderEnRoute,
  rejectOffer,
  sendProviderLocation,
  startService,
  updateProviderStatus,
} from "../services/service-api.js";
import { playOfferSound, playStatusSound } from "../services/sound.js";
import { setState, state } from "../state/app-state.js";
import { updateTrackingMarkers } from "../services/map.js";

let trackingTimer = null;

function getRequestId(service) {
  return service?.request_id ?? service?.id ?? null;
}

function hydrateConversationState(conversation, messages) {
  setState((draft) => {
    draft.chat.conversationId = conversation?.id ?? null;
    draft.client.activeConversationId = conversation?.id ?? null;
    draft.chat.messages = messages ?? [];
    draft.chat.unreadCount = (messages ?? []).filter(
      (message) => !message.read_at && message.sender_user_id !== draft.session.userId,
    ).length;
  });
}

export async function bootstrapProviderContext() {
  const providerId = state.session.providerId;
  if (!providerId) return;

  const [offers, activeService] = await Promise.all([
    loadProviderOffers(providerId),
    loadActiveRequest({
      userId: null,
      providerId,
    }),
  ]);

  let conversation = null;
  let messages = [];

  if (activeService?.id) {
    conversation = await loadConversationForRequest(activeService.id);
    messages = conversation?.id ? await loadMessages(conversation.id) : [];
  }

  setState((draft) => {
    draft.provider.offers = offers;
    draft.provider.stats.offers = offers.length;
    draft.provider.activeService = activeService;
    draft.provider.offerDeadlineAt = offers[0]?.expires_at ?? null;
    draft.provider.availability.isOnline = draft.provider.status === "ONLINE_IDLE";

    if (draft.provider.profile) {
      draft.provider.stats.rating = Number(draft.provider.profile.rating_avg ?? 5);
    }

    if (activeService?.service_lat && activeService?.service_lng) {
      draft.tracking.clientPosition = {
        lat: activeService.service_lat,
        lng: activeService.service_lng,
      };
    }
  });

  hydrateConversationState(conversation, messages);

  updateTrackingMarkers({
    clientPosition: state.tracking.clientPosition,
    providerPosition: state.tracking.providerPosition,
  });

  startProviderTrackingLoop();
}

export async function refreshProviderOffers() {
  if (!state.session.providerId) return [];

  const offers = await loadProviderOffers(state.session.providerId);
  setState((draft) => {
    draft.provider.offers = offers;
    draft.provider.stats.offers = offers.length;
    draft.provider.offerDeadlineAt = offers[0]?.expires_at ?? null;
  });

  return offers;
}

export async function acceptProviderOffer(offerId) {
  const response = await acceptOffer(offerId);
  await restoreProviderActiveService();
  playStatusSound();
  return response;
}

export async function rejectProviderOffer(offerId) {
  const response = await rejectOffer(offerId);
  await refreshProviderOffers();
  return response;
}

export async function setProviderStatus(status) {
  const now = new Date().toISOString();
  let profile = state.provider.profile;

  if (state.session.providerId) {
    profile = await updateProviderStatus(state.session.providerId, status) ?? profile;
  }

  setState((draft) => {
    draft.provider.profile = profile ?? draft.provider.profile;
    draft.provider.status = profile?.status ?? status;
    draft.provider.availability.isOnline = (profile?.status ?? status) === "ONLINE_IDLE";
    draft.provider.availability.lastSeenAt = now;
  });
}

export async function restoreProviderActiveService() {
  if (!state.session.providerId) return null;

  const activeService = await loadActiveRequest({
    userId: null,
    providerId: state.session.providerId,
  });

  let conversation = null;
  let messages = [];

  if (activeService?.id) {
    conversation = await loadConversationForRequest(activeService.id);
    messages = conversation?.id ? await loadMessages(conversation.id) : [];
  }

  setState((draft) => {
    draft.provider.activeService = activeService;
    draft.client.activeConversationId = conversation?.id ?? null;
    draft.chat.conversationId = conversation?.id ?? null;
    draft.chat.messages = messages;
    draft.chat.unreadCount = messages.filter(
      (message) => !message.read_at && message.sender_user_id !== draft.session.userId,
    ).length;

    if (activeService?.service_lat && activeService?.service_lng) {
      draft.tracking.clientPosition = {
        lat: activeService.service_lat,
        lng: activeService.service_lng,
      };
    }

    draft.tracking.active = Boolean(activeService);
  });

  updateTrackingMarkers({
    clientPosition: state.tracking.clientPosition,
    providerPosition: state.tracking.providerPosition,
  });

  return activeService;
}

export async function advanceProviderFlow(action) {
  const activeService = state.provider.activeService;
  const requestId = getRequestId(activeService);
  if (!requestId) return null;

  let response = null;

  if (action === "en-route") {
    response = await markProviderEnRoute(requestId);
  } else if (action === "arrived") {
    response = await markProviderArrived(requestId);
  } else if (action === "start") {
    response = await startService(requestId);
  } else if (action === "complete") {
    response = await completeService(requestId);
  }

  await restoreProviderActiveService();
  playStatusSound();

  return response;
}

export function handleIncomingOffer(offerPayload) {
  const record = offerPayload?.new ?? offerPayload?.record ?? offerPayload;
  if (!record) return;

  setState((draft) => {
    const exists = draft.provider.offers.some((item) => item.id === record.id);
    if (!exists) {
      draft.provider.offers.unshift(record);
      draft.provider.offerDeadlineAt = record.expires_at ?? null;
      draft.provider.stats.offers = draft.provider.offers.length;
    }
  });

  playOfferSound();
}

export function startProviderTrackingLoop() {
  if (trackingTimer) return;
  if (!navigator.geolocation) return;

  trackingTimer = window.setInterval(() => {
    const activeService = state.provider.activeService;
    const requestId = getRequestId(activeService);

    if (!requestId) return;

    const allowed = ["PROVIDER_EN_ROUTE", "PROVIDER_ARRIVED", "IN_PROGRESS"];
    if (!allowed.includes(activeService?.status)) return;

    navigator.geolocation.getCurrentPosition(async (position) => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
      };

      setState((draft) => {
        draft.tracking.providerPosition = {
          lat: coords.lat,
          lng: coords.lng,
        };
        draft.tracking.active = true;
      });

      updateTrackingMarkers({
        clientPosition: state.tracking.clientPosition,
        providerPosition: state.tracking.providerPosition,
      });

      try {
        await sendProviderLocation(requestId, coords);
      } catch {
        // noop
      }
    });
  }, appConfig.providerUi.trackingIntervalMs ?? 12000);
}
