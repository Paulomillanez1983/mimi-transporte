export type CommissionRule = {
  service_type?: string;
  percentage?: number;
  minimum_fee?: number;
  fixed_fee?: number;
  rounding?: "ceil" | "floor" | "round";
};

function roundAmount(value: number, mode: string) {
  if (mode === "floor") return Math.floor(value);
  if (mode === "round") return Math.round(value);
  return Math.ceil(value);
}

export function calculateCommission(totalAmount: number, rule: CommissionRule | null = null) {
  const safeTotal = Math.max(0, Number(totalAmount || 0));
  const percentage = Number(rule?.percentage ?? 30);
  const minimumFee = Number(rule?.minimum_fee ?? 0);
  const fixedFee = Number(rule?.fixed_fee ?? 0);
  const rawFee = safeTotal * (percentage / 100) + fixedFee;
  const platformFee = Math.min(
    safeTotal,
    roundAmount(Math.max(minimumFee, rawFee), rule?.rounding ?? "ceil")
  );

  return {
    total_amount: safeTotal,
    platform_fee: platformFee,
    provider_amount: Math.max(0, safeTotal - platformFee),
    rule: {
      service_type: rule?.service_type ?? "DEFAULT",
      percentage,
      minimum_fee: minimumFee,
      fixed_fee: fixedFee,
      rounding: rule?.rounding ?? "ceil"
    }
  };
}
