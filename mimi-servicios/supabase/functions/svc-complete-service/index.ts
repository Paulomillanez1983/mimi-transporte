import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleProviderComplete } from "../_shared/service-lifecycle.ts";

serve((req) => handleProviderComplete(req));
