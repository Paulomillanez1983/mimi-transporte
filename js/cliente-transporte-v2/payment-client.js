(function () {
  const MOCK_CHECKOUT_HOST = "mock-payments.mimi.local";
  const PAYMENT_STORAGE_KEY = "mimi_transport_payment_intent_v1";

  function getSupabaseConfig() {
    const url = typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : "";
    const anonKey = typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : "";
    if (!url || !anonKey) {
      throw new Error("Configuracion de Supabase no disponible para pagos");
    }
    return { url, anonKey };
  }

  async function getSession() {
    if (typeof asegurarSesionCliente === "function") {
      return asegurarSesionCliente();
    }

    if (!window.sbRealtime?.auth) {
      throw new Error("Cliente Auth no inicializado");
    }

    const { data, error } = await window.sbRealtime.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  function normalizePayment(payment) {
    if (!payment) return null;

    return {
      ...payment,
      total_amount: Number(payment.total_amount ?? 0),
      platform_fee: Number(payment.platform_fee ?? 0),
      provider_amount: Number(payment.provider_amount ?? 0),
      currency: payment.currency || "ARS",
      status: String(payment.status || "PENDING").toUpperCase(),
      provider_name: payment.provider_name || "mock",
      checkout_url: payment.checkout_url || ""
    };
  }

  async function invokePaymentFunction(functionName, payload) {
    const { url, anonKey } = getSupabaseConfig();
    const session = await getSession();

    if (!session?.access_token) {
      throw new Error("Inicia sesion para confirmar y pagar el viaje");
    }

    const response = await fetch(`${url}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(payload)
    });

    const rawText = await response.text();
    let data = null;

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (_) {
      throw new Error(`Respuesta invalida de ${functionName}`);
    }

    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || data?.message || `No se pudo procesar el pago (${response.status})`);
    }

    return data;
  }

  function persistPayment(payment) {
    try {
      localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(payment));
    } catch (error) {
      console.warn("[payments] no se pudo persistir payment intent:", error);
    }
  }

  async function createPaymentIntentForTrip(tripId) {
    if (!tripId) throw new Error("Falta el viaje para crear el intento de pago");

    const data = await invokePaymentFunction("create-payment-intent", {
      context_type: "TRANSPORT_TRIP",
      trip_id: tripId
    });

    const payment = normalizePayment(data?.payment);
    if (payment) persistPayment(payment);
    return payment;
  }

  async function getPaymentStatus(paymentId) {
    if (!paymentId) throw new Error("Falta payment_id");
    const data = await invokePaymentFunction("get-payment-status", { payment_id: paymentId });
    return normalizePayment(data?.payment);
  }

  function isMockCheckout(payment) {
    try {
      return new URL(payment?.checkout_url || "").hostname === MOCK_CHECKOUT_HOST;
    } catch (_) {
      return false;
    }
  }

  function openCheckout(payment) {
    if (!payment?.checkout_url || isMockCheckout(payment)) return false;
    window.location.assign(payment.checkout_url);
    return true;
  }

  function formatMoney(amount, currency = "ARS") {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(Number(amount || 0));
  }

  function describePayment(payment) {
    if (!payment) return "No se pudo preparar el pago.";

    const total = formatMoney(payment.total_amount, payment.currency);
    const fee = formatMoney(payment.platform_fee, payment.currency);
    const net = formatMoney(payment.provider_amount, payment.currency);

    if (isMockCheckout(payment)) {
      return `Pago mock preparado. Total ${total}. Comision MIMI ${fee}. Neto del proveedor ${net}.`;
    }

    return `Checkout seguro preparado. Total ${total}. Comision MIMI ${fee}. Neto del proveedor ${net}.`;
  }

  window.MimiTransportPayments = {
    createPaymentIntentForTrip,
    getPaymentStatus,
    openCheckout,
    describePayment,
    isMockCheckout,
    normalizePayment
  };
})();
