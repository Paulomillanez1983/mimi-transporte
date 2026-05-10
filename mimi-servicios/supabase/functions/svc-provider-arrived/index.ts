import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleProviderTransition } from "../_shared/service-lifecycle.ts";

serve((req) =>
  handleProviderTransition(req, {
    functionName: "svc-provider-arrived",
    allowedStatuses: ["PROVIDER_EN_ROUTE"],
    targetStatus: "PROVIDER_ARRIVED",
    timestampColumn: "arrived_at",
    providerStatus: "ARRIVED",
    notificationType: "REQUEST_PROVIDER_ARRIVED",
    notificationTitle: "El prestador llegó",
    notificationBody: "El prestador marcó que ya llegó al lugar del servicio.",
  })
);
