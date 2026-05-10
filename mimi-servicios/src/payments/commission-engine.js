const DEFAULT_COMMISSION_RULE = {
  serviceType: "DEFAULT",
  percentage: 30,
  minimumFee: 0,
  fixedFee: 0,
  rounding: "round"
};

function roundAmount(value, mode = "ceil") {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) return 0;
  if (mode === "floor") return Math.floor(amount);
  if (mode === "round") return Math.round(amount);

  return Math.ceil(amount);
}

export function calculateCommission(input = {}) {
  const serviceAmount = Math.max(0, Number(input.serviceAmount ?? input.providerAmount ?? input.totalAmount ?? 0));
  const rule = {
    ...DEFAULT_COMMISSION_RULE,
    ...(input.rule ?? {})
  };

  const percentageFee = serviceAmount * (Number(rule.percentage ?? 0) / 100);
  const rawPlatformFee = Math.max(
    Number(rule.minimumFee ?? 0),
    percentageFee + Number(rule.fixedFee ?? 0)
  );
  const platformFee = roundAmount(rawPlatformFee, rule.rounding);
  const providerAmount = serviceAmount;
  const totalAmount = providerAmount + platformFee;

  return {
    service_amount: serviceAmount,
    total_amount: totalAmount,
    platform_fee: platformFee,
    provider_amount: providerAmount,
    currency: input.currency ?? "ARS",
    rule: {
      service_type: rule.serviceType,
      percentage: Number(rule.percentage ?? 0),
      minimum_fee: Number(rule.minimumFee ?? 0),
      fixed_fee: Number(rule.fixedFee ?? 0),
      rounding: rule.rounding
    }
  };
}
