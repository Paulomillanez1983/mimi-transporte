
(function redirectServicesOAuthCallback() {
      try {
        var intent =
          sessionStorage.getItem("mimi_services_auth_intent") ||
          localStorage.getItem("mimi_services_auth_intent");
        var pending =
          sessionStorage.getItem("mimi_services_auth_redirect_in_progress") ||
          "";
        var hasSupabaseCallback =
          window.location.search.indexOf("code=") !== -1 ||
          window.location.hash.indexOf("access_token") !== -1;

        if (
          hasSupabaseCallback &&
          (intent === "client" || pending.indexOf("cliente") !== -1)
        ) {
          window.location.replace("/servicios" + window.location.search + window.location.hash);
          return;
        }

        if (
          hasSupabaseCallback &&
          (intent === "provider" || pending.indexOf("prestador") !== -1)
        ) {
          window.location.replace("/prestador" + window.location.search + window.location.hash);
        }
      } catch (_) {}
    })();
