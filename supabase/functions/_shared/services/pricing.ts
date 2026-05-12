export const MIMI_PLATFORM_FEE_PERCENT = 30;

export type ServicePricingBreakdown = {
  providerPrice: number;
  platformFeePercent: number;
  platformFee: number;
  totalPrice: number;
  currency: string;
};

function roundMoney(value: number, currency = "ARS") {
  const safeValue = Number(value);
  if (!Number.isFinite(safeValue) || safeValue <= 0) return 0;
  if (currency.toUpperCase() === "ARS") return Math.round(safeValue);
  return Math.round(safeValue * 100) / 100;
}

export function calculateServicePricingFromProviderAmount(
  providerAmount: number,
  currency = "ARS",
  platformFeePercent = MIMI_PLATFORM_FEE_PERCENT,
): ServicePricingBreakdown {
  const providerPrice = roundMoney(providerAmount, currency);
  const percent = Number.isFinite(Number(platformFeePercent))
    ? Number(platformFeePercent)
    : MIMI_PLATFORM_FEE_PERCENT;
  const platformFee = providerPrice > 0
    ? roundMoney(providerPrice * (percent / 100), currency)
    : 0;

  return {
    providerPrice,
    platformFeePercent: percent,
    platformFee,
    totalPrice: roundMoney(providerPrice + platformFee, currency),
    currency,
  };
}
