export function buildMockProviders(categoryId, draft) {
  const base = [
    { provider_id: "prov-1", user_id: "user-1", full_name: "Lucia Torres", rating: 4.9, rating_count: 138, distance_km: 1.4, provider_price: 9200, currency: "ARS", score: 92.4 },
    { provider_id: "prov-2", user_id: "user-2", full_name: "Martin Ruiz", rating: 4.8, rating_count: 89, distance_km: 2.1, provider_price: 8600, currency: "ARS", score: 88.7 },
    { provider_id: "prov-3", user_id: "user-3", full_name: "Daniela Sosa", rating: 4.7, rating_count: 204, distance_km: 3.6, provider_price: 7900, currency: "ARS", score: 84.5 }
  ];
  return base.map((provider, index) => ({
    ...provider,
    category_id: categoryId,
    fee: Math.max(500, Math.round(provider.provider_price * 0.15)),
    total_price: provider.provider_price + Math.max(500, Math.round(provider.provider_price * 0.15)),
    estimated_eta_min: 8 + index * 4,
    requested_hours: draft.requestedHours
  }));
}

export function buildMockOffers() {
  return [
    {
      id: "offer-1",
      request_id: "req-1",
      client_name: "Paula M.",
      title: "Limpieza profunda",
      address_text: "Villa Allende Golf",
      requested_hours: 3,
      total_price_snapshot: 12000,
      status: "PENDING_PROVIDER_RESPONSE"
    }
  ];
}

export function buildMockNotifications() {
  return [
    { id: "n1", title: "Nueva oferta disponible", body: "Un cliente cercano te eligio.", created_at: new Date().toISOString(), read_at: null },
    { id: "n2", title: "Prestador en camino", body: "Tu servicio acaba de entrar en ruta.", created_at: new Date(Date.now() - 7200000).toISOString(), read_at: null }
  ];
}

export function buildMockMessages() {
  return [
    { id: "m1", sender_user_id: "user-1", body: "Hola, llego en 10 minutos.", created_at: new Date(Date.now() - 600000).toISOString() },
    { id: "m2", sender_user_id: "self", body: "Perfecto, te espero en porteria.", created_at: new Date(Date.now() - 240000).toISOString() }
  ];
}
