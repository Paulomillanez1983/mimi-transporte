import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleProviderTransition } from "../_shared/service-lifecycle.ts";

serve((req) =>
  handleProviderTransition(req, {
    functionName: "svc-start-service",
    allowedStatuses: ["PROVIDER_ARRIVED", "PROVIDER_EN_ROUTE", "ACCEPTED", "SCHEDULED"],
    targetStatus: "IN_PROGRESS",
    timestampColumn: "started_at",
    providerStatus: "IN_SERVICE",
  })
);
