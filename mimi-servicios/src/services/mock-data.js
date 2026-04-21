function buildFee(amount) {
  return Math.max(500, Math.round((amount ?? 0) * 0.15));
}

export function buildMockProviders(categoryId, draft) {
  const requestedHours = Number(draft?.requestedHours ?? 2);

  const base = [
    {
      provider_id: "prov-1",
      user_id: "user-1",
      full_name: "Lucia Torres",
      rating: 4.9,
      rating_count: 138,
      distance_km: 1.4,
      provider_price: 9200,
      currency: "ARS",
      score: 92.4
    },
    {
      provider_id: "prov-2",
      user_id: "user-2",
      full_name: "Martin Ruiz",
      rating: 4.8,
      rating_count: 89,
      distance_km: 2.1,
      provider_price: 8600,
      currency: "ARS",
      score: 88.7
    },
    {
      provider_id: "prov-3",
      user_id: "user-3",
      full_name: "Daniela Sosa",
      rating: 4.7,
      rating_count: 204,
      distance_km: 3.6,
      provider_price: 7900,
      currency: "ARS",
      score: 84.5
    }
  ];

  return base.map((provider, index) => {
    const platformFee = buildFee(provider.provider_price);

    return {
      ...provider,
      category_id: categoryId,
      fee: platformFee,
      platform_fee: platformFee,
      total_price: provider.provider_price + platformFee,
      estimated_eta_min: 8 + index * 4,
      requested_hours: requestedHours
    };
  });
}

export function buildMockOffers() {
  return [
    {
      id: "offer-1",
      request_id: "req-1",
      provider_id: "prov-demo",
      client_name: "Paula M.",
      title: "Limpieza profunda",
      address_text: "Villa Allende Golf",
      requested_hours: 3,
      total_price_snapshot: 12000,
      status: "PENDING_PROVIDER_RESPONSE",
      created_at: new Date().toISOString()
    }
  ];
}

export function buildMockNotifications() {
  return [
    {
      id: "n1",
      title: "Nueva oferta disponible",
      body: "Un cliente cercano te eligio.",
      type: "SERVICE_OFFER",
      created_at: new Date().toISOString(),
      read_at: null
    },
    {
      id: "n2",
      title: "Prestador en camino",
      body: "Tu servicio acaba de entrar en ruta.",
      type: "PROVIDER_EN_ROUTE",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      read_at: null
    }
  ];
}

export function buildMockMessages() {
  return [
    {
      id: "m1",
      conversation_id: "demo-conversation",
      sender_user_id: "user-1",
      body: "Hola, llego en 10 minutos.",
      message_type: "TEXT",
      read_at: null,
      created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString()
    },
    {
      id: "m2",
      conversation_id: "demo-conversation",
      sender_user_id: "self",
      body: "Perfecto, te espero en porteria.",
      message_type: "TEXT",
      read_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
      created_at: new Date(Date.now() - 1000 * 60 * 4).toISOString()
    }
  ];
}
