import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleProviderTransition } from "../_shared/service-lifecycle.ts";

serve((req) =>
  handleProviderTransition(req, {
    functionName: "svc-provider-en-route",
    allowedStatuses: ["ACCEPTED", "SCHEDULED"],
    targetStatus: "PROVIDER_EN_ROUTE",
    timestampColumn: "en_route_at",
    providerStatus: "EN_ROUTE",
  })
);
