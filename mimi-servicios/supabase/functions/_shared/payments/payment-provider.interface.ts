export type PaymentIntentInput = {
  paymentId: string;
  contextType: string;
  contextId: string;
  totalAmount: number;
  platformFee: number;
  providerAmount: number;
  currency: string;
  customerId: string;
  providerId?: string | null;
  description?: string;
  customerEmail?: string | null;
};

export type PaymentProviderResult = {
  providerName: string;
  providerPaymentId: string;
  checkoutUrl: string | null;
  status: string;
  rawResponse: Record<string, unknown>;
};

export type PaymentProviderWebhookEvent = {
  valid: boolean;
  signatureValid: boolean;
  providerName: string;
  providerPaymentId?: string;
  providerEventId?: string;
  status?: string;
  eventType?: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
  providerFeeAmount?: number;
  isTest?: boolean;
  replayProtectionKey?: string;
  errorCode?: string;
  errorMessage?: string;
};

export interface PaymentProvider {
  name: string;
  createPaymentIntent(input: PaymentIntentInput): Promise<PaymentProviderResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentProviderResult>;
  cancelPayment(providerPaymentId: string, reason?: string): Promise<PaymentProviderResult>;
  refundPayment(providerPaymentId: string, amount: number, reason?: string, idempotencyKey?: string): Promise<PaymentProviderResult>;
  verifyWebhook(req: Request, rawBody: string): Promise<PaymentProviderWebhookEvent>;
  parseWebhook(req: Request, rawBody: string): Promise<PaymentProviderWebhookEvent>;
  normalizeEvent(payload: Record<string, unknown>): PaymentProviderWebhookEvent;
}
