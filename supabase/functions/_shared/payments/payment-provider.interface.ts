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
};

export type PaymentProviderResult = {
  providerName: string;
  providerPaymentId: string;
  checkoutUrl: string | null;
  status: string;
  rawResponse: Record<string, unknown>;
};

export interface PaymentProvider {
  name: string;
  createPaymentIntent(input: PaymentIntentInput): Promise<PaymentProviderResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentProviderResult>;
  cancelPayment(providerPaymentId: string, reason?: string): Promise<PaymentProviderResult>;
  refundPayment(providerPaymentId: string, amount: number, reason?: string): Promise<PaymentProviderResult>;
  parseWebhook(req: Request, rawBody: string): Promise<{
    valid: boolean;
    providerPaymentId?: string;
    status?: string;
    eventType?: string;
    payload: Record<string, unknown>;
  }>;
}
