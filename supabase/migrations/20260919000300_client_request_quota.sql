-- 20260919000300_client_request_quota.sql
-- El tope de pedidos, pero contando lo que hay que contar.
--
-- EL PROBLEMA DEL TOPE INGENUO
--   Un tope de "2 pedidos por semana" castiga al que publicó un pedido y NADIE le respondió.
--   Eso no es culpa del cliente, es una falla nuestra, y encima es el peor momento para
--   decirle "no podés publicar más": ya se fue frustrado una vez.
--
-- LA FÓRMULA
--   No se cuentan los pedidos PUBLICADOS: se cuentan los presupuestos RECIBIDOS Y NO
--   CONFIRMADOS. Esa es la firma exacta del que usa la app de cotizador — recibe precios y
--   se va. Y es la única que no castiga a nadie por culpa nuestra:
--
--     · Pedido sin ninguna respuesta        -> NO consume (fallamos nosotros, no él)
--     · Pedido confirmado                   -> NO consume (convirtió, es el objetivo)
--     · Cancelado antes de recibir ofertas  -> NO consume
--     · Recibió ofertas y no confirmó       -> CONSUME  <-- acá está el abuso
--
-- ADITIVO: función nueva, nadie la llama todavía.
--
-- Aún sin decidir: el valor del tope. Queda como parámetro (p_limit), default 2.

begin;

create or replace function public.svc_client_request_quota(
  p_user_id uuid,
  p_window_days integer default 7,
  p_limit integer default 2
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(p_window_days, 90)));
  v_publicados integer := 0;
  v_con_oferta integer := 0;
  v_confirmados integer := 0;
  v_consumidos integer := 0;
  v_esperando integer := 0;
begin
  select
    count(*),
    -- Recibió al menos una oferta de algún prestador. Se mira svc_request_offers, que es
    -- donde caen las ofertas del flujo directo.
    count(*) filter (
      where exists (
        select 1 from public.svc_request_offers o
        where o.request_id = r.id
      )
    ),
    -- Confirmó: hay prestador aceptado o el pedido ya avanzó. Cualquiera de las dos cosas.
    count(*) filter (
      where r.accepted_provider_id is not null
         or r.status in ('ACCEPTED','IN_PROGRESS','COMPLETED')
    )
  into v_publicados, v_con_oferta, v_confirmados
  from public.svc_requests r
  where r.client_user_id = p_user_id
    and r.created_at >= v_desde;

  -- Un pedido confirmado no puede además contar como "recibió y no confirmó": si el
  -- cliente confirmó, sale de los dos lados. Por eso el mayor(...) y no una resta simple.
  v_consumidos := greatest(v_con_oferta - v_confirmados, 0);

  -- Sin ninguna respuesta y sin confirmar: quedaron colgados. No consumen, pero interesa
  -- saber cuántos son: es la señal de que nos falta cobertura en esa zona, no de abuso.
  v_esperando := greatest(v_publicados - v_con_oferta - v_confirmados, 0);

  return jsonb_build_object(
    'ok', true,
    'window_days', p_window_days,
    'limit', p_limit,
    'publicados', v_publicados,
    'con_oferta', v_con_oferta,
    'confirmados', v_confirmados,
    'consumidos', v_consumidos,
    'sin_respuesta', v_esperando,
    'restantes', greatest(p_limit - v_consumidos, 0),
    'bloqueado', v_consumidos >= p_limit,
    -- Mensajes listos para mostrar. El de bloqueo no habla de "límite alcanzado" en
    -- abstracto: dice por qué, que es lo que lo hace tolerable.
    'mensaje', case
      when v_consumidos >= p_limit
        then 'Recibiste presupuestos y no confirmaste ninguno. Podés volver a publicar en unos días.'
      when v_esperando > 0
        then 'Tu último pedido no recibió respuestas. No te cuenta para el límite: vamos a avisarte cuando haya un prestador disponible en tu zona.'
      else null
    end
  );
end;
$function$;

comment on function public.svc_client_request_quota(uuid, integer, integer) is
  'Tope de pedidos contando presupuestos recibidos y no confirmados. Los pedidos sin respuesta no consumen.';

revoke all on function public.svc_client_request_quota(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.svc_client_request_quota(uuid, integer, integer) to service_role;

-- Lo que NO resuelve, y hay que resolver aparte:
--   Un pedido sin respuestas no consume tope, pero SÍ dejó fotos en el storage. Eso ya lo
--   cubre el vencimiento de 72 h de svc_expire_request_photos(). Y al cliente hay que darle
--   una salida, no un callejón: ampliar el radio, dejarlo agendado, o avisarle cuando
--   aparezca un prestador en su zona.

commit;

-- Verificación después de aplicar:
--   select public.svc_client_request_quota('<uuid de un cliente>');
