-- 20260919000100_compose_offering_price.sql
-- El motor: convierte los parámetros del prestador + el pedido del cliente en un presupuesto.
--
-- ADITIVO. Nada lo llama todavía.
--
-- LA REGLA QUE RESPETA
--   Las 68 reglas de precio ya dicen: formula_json -> ai_final_price_allowed = false.
--   Este motor NO inventa: compone con parámetros que el prestador cargó. Si falta un dato
--   que afecta el precio, devuelve COTIZAR y enumera lo que falta — que es exactamente lo
--   que va a llenar `svc_quote_requests.required_variables_json`.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lógica de tres estados para una condición.
-- MATCH / NO / UNKNOWN. UNKNOWN es lo importante y por eso no alcanza un boolean:
-- significa "no sé si aplica porque falta el dato", y eso obliga a cotizar en vez de
-- aplicar un recargo a ciegas.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.price_condition_state(
  p_attribute text,
  p_condition jsonb,
  p_spec jsonb
) returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_raw jsonb;
  v_txt text;
  v_num numeric;
begin
  -- Sin condición: siempre aplica.
  if p_condition is null or p_condition = '{}'::jsonb then
    return 'MATCH';
  end if;

  v_raw := p_spec -> p_attribute;
  if v_raw is null or v_raw = 'null'::jsonb or trim(both '"' from v_raw::text) = '' then
    return 'UNKNOWN';
  end if;

  v_txt := upper(trim(both '"' from v_raw::text));
  if v_raw::text ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v_num := v_raw::numeric;
  end if;

  if p_condition ? 'eq' then
    return case
      when v_txt = upper(trim(both '"' from (p_condition -> 'eq')::text)) then 'MATCH'
      else 'NO' end;
  end if;

  if p_condition ? 'in' then
    return case
      when exists (
        select 1 from jsonb_array_elements_text(p_condition -> 'in') as e(val)
        where upper(val) = v_txt
      ) then 'MATCH' else 'NO' end;
  end if;

  -- Comparaciones numéricas: si el valor no es número, es UNKNOWN (no NO).
  if p_condition ? 'gte' or p_condition ? 'gt' or p_condition ? 'lte' or p_condition ? 'lt' then
    if v_num is null then return 'UNKNOWN'; end if;
    if (p_condition ? 'gte') and v_num < (p_condition ->> 'gte')::numeric then return 'NO'; end if;
    if (p_condition ? 'gt')  and v_num <= (p_condition ->> 'gt')::numeric then return 'NO'; end if;
    if (p_condition ? 'lte') and v_num > (p_condition ->> 'lte')::numeric then return 'NO'; end if;
    if (p_condition ? 'lt')  and v_num >= (p_condition ->> 'lt')::numeric then return 'NO'; end if;
    return 'MATCH';
  end if;

  return 'MATCH';
end;
$function$;

comment on function public.price_condition_state(text, jsonb, jsonb) is
  'MATCH/NO/UNKNOWN. UNKNOWN = falta el dato: no se aplica a ciegas, se cotiza.';

-- ─────────────────────────────────────────────────────────────────────────────
-- El motor
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.compose_offering_price(
  p_offering_id uuid,
  p_spec jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  v_off record;
  v_model text;
  v_currency text;
  v_lines jsonb := '[]'::jsonb;
  v_excludes jsonb := '[]'::jsonb;
  v_assumptions jsonb := '[]'::jsonb;
  v_missing text[] := '{}';
  -- v_base es el precio de partida; v_subtotal es lo que se va acumulando (base + tramos)
  -- y sobre lo que se calculan los recargos porcentuales. Van separados a proposito:
  -- la visita y el trabajo se SUMAN, no se reemplazan, y "urgencia +30%" se lee sobre el
  -- total del trabajo, no solo sobre la visita.
  v_base numeric := 0;
  v_subtotal numeric := 0;
  v_var numeric := 0;
  v_qty numeric;
  v_hours numeric;
  v_unit_label text;
  v_p record;
  v_state text;
  v_min_charge numeric;
  v_tier_applied boolean := false;
begin
  select * into v_off
  from public.svc_provider_service_offerings
  where id = p_offering_id;

  if v_off.id is null then
    return jsonb_build_object('kind', 'ERROR', 'error', 'offering_not_found');
  end if;

  v_currency := coalesce(nullif(v_off.currency, ''), 'ARS');
  v_model := upper(coalesce(nullif(v_off.pricing_model, ''), 'HOURLY'));
  v_min_charge := coalesce(v_off.minimum_charge, 0);
  v_unit_label := coalesce(nullif(v_off.unit_name, ''), 'unidad');

  v_qty := case when (p_spec ->> 'quantity') ~ '^-?[0-9]+(\.[0-9]+)?$'
                then (p_spec ->> 'quantity')::numeric end;
  v_hours := case when (p_spec ->> 'hours') ~ '^-?[0-9]+(\.[0-9]+)?$'
                  then (p_spec ->> 'hours')::numeric end;

  -- ── 1. Precio de partida ──────────────────────────────────────────────────
  select * into v_p
  from public.svc_offering_price_params
  where offering_id = p_offering_id and kind = 'BASE' and active
  limit 1;

  if v_p.id is not null then
    v_base := coalesce((v_p.adjustment_json ->> 'value')::numeric, 0);
    if v_base > 0 then
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object('kind', 'BASE', 'label', coalesce(v_p.note, 'Precio base'), 'amount', v_base)
      );
    end if;
  else
    -- Sin cuadro tarifario cargado: se usa el precio plano que ya existe en la prestación,
    -- para que el motor sirva también para lo que ya está publicado.
    case v_model
      when 'FIXED' then
        v_base := coalesce(v_off.fixed_price, 0);
        if v_base > 0 then
          v_lines := v_lines || jsonb_build_array(
            jsonb_build_object('kind','BASE','label','Precio cerrado','amount',v_base));
        end if;
      when 'BASE_VISIT' then
        v_base := coalesce(v_off.base_visit_fee, 0);
        if v_base > 0 then
          v_lines := v_lines || jsonb_build_array(
            jsonb_build_object('kind','BASE','label','Visita','amount',v_base));
        end if;
      when 'HOURLY' then
        if v_hours is null then
          v_missing := array_append(v_missing, 'hours');
        else
          v_base := coalesce(v_off.price_per_hour, 0) * v_hours;
          if v_base > 0 then
            v_lines := v_lines || jsonb_build_array(
              jsonb_build_object('kind','BASE','label', v_hours || ' h × ' || coalesce(v_off.price_per_hour,0),'amount',round(v_base,2)));
          end if;
        end if;
      when 'UNIT', 'SQUARE_METER', 'LINEAR_METER' then
        if v_qty is null then
          v_missing := array_append(v_missing, 'quantity');
        else
          v_base := coalesce(v_off.unit_price, 0) * v_qty;
          if v_base > 0 then
            v_lines := v_lines || jsonb_build_array(
              jsonb_build_object('kind','BASE','label', v_qty || ' ' || v_unit_label || ' × ' || coalesce(v_off.unit_price,0),'amount',round(v_base,2)));
          end if;
        end if;
      else
        -- QUOTE y cualquier modelo sin precio plano: no hay de dónde partir.
        null;
    end case;
  end if;

  -- El precio de partida entra en el subtotal sobre el que se calculan los recargos.
  v_subtotal := v_base;

  -- ── 2. Recargos y tramos ─────────────────────────────────────────────────
  for v_p in
    select * from public.svc_offering_price_params
    where offering_id = p_offering_id and active and kind in ('SURCHARGE','TIER')
    order by sort_order
  loop
    v_state := public.price_condition_state(v_p.attribute_code, v_p.condition_json, p_spec);

    if v_state = 'UNKNOWN' then
      -- Falta el dato. Dos casos MUY distintos, y tratarlos igual seria un error:
      --   · TIER: sin la cantidad no hay precio que calcular -> hay que preguntar.
      --   · SURCHARGE: no saber si es urgente no impide cotizar; se asume que NO aplica,
      --     se muestra el precio sin el recargo y se declara el supuesto. Bloquear el
      --     precio por un recargo opcional haria que casi todo termine en cotizacion.
      if v_p.kind = 'TIER' then
        if not (v_p.attribute_code = any(v_missing)) then
          v_missing := array_append(v_missing, v_p.attribute_code);
        end if;
      else
        v_assumptions := v_assumptions || to_jsonb(coalesce(
          v_p.note,
          'No se aplicó el recargo de ' || v_p.attribute_code || ': no nos dijiste ese dato'
        ));
      end if;
    elsif v_state = 'MATCH' then
      if v_p.kind = 'TIER' and coalesce((v_p.adjustment_json ->> 'value')::numeric, 0) > 0 then
        -- El tramo SUMA al precio de partida: la visita y el trabajo por m² son cosas
        -- distintas y el cliente paga las dos.
        v_var := round(coalesce((v_p.adjustment_json ->> 'value')::numeric, 0) * coalesce(v_qty, 1), 2);
        v_subtotal := v_subtotal + v_var;
        v_tier_applied := true;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'kind','TIER',
          'label', coalesce(v_p.note, coalesce(v_qty,0) || ' ' || coalesce(v_p.adjustment_json ->> 'unit', v_unit_label)),
          'amount', v_var));
      elsif coalesce((v_p.adjustment_json ->> 'value')::numeric, 0) <> 0 then
        if (v_p.adjustment_json ->> 'type') = 'percent' then
          -- Porcentaje sobre el subtotal acumulado hasta acá (visitа + tramos).
          v_var := round(v_subtotal * (v_p.adjustment_json ->> 'value')::numeric / 100.0, 2);
        else
          v_var := (v_p.adjustment_json ->> 'value')::numeric;
        end if;
        v_subtotal := v_subtotal + v_var;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'kind','SURCHARGE',
          'label', coalesce(v_p.note, 'Recargo'),
          'amount', v_var));
      end if;
    end if;
  end loop;

  -- ── 3. Lo que no incluye (informativo, y es lo que evita la discusión después) ──
  for v_p in
    select * from public.svc_offering_price_params
    where offering_id = p_offering_id and active and kind = 'EXCLUDE'
    order by sort_order
  loop
    v_state := public.price_condition_state(v_p.attribute_code, v_p.condition_json, p_spec);
    if v_state <> 'NO' then
      v_excludes := v_excludes || to_jsonb(coalesce(v_p.note, 'No incluye'));
    end if;
  end loop;

  -- ── 4. Mínimo del prestador sobre la parte variable ──────────────────────
  if v_subtotal > 0 and v_subtotal < v_min_charge then
    v_var := v_min_charge - v_subtotal;
    v_subtotal := v_min_charge;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('kind','MINIMUM','label','Mínimo del servicio','amount',round(v_var,2)));
  end if;

  -- ── 5. Decisión: precio al instante o cotización ─────────────────────────
  if array_length(v_missing, 1) > 0 or v_subtotal <= 0 then
    return jsonb_build_object(
      'kind', 'QUOTE',
      'reason', case when array_length(v_missing, 1) > 0 then 'missing_attributes' else 'no_base_price' end,
      'missing', to_jsonb(v_missing),
      -- Lo que el prestador ya puede ver aunque falte algo: así no cotiza a ciegas.
      'partial_lines', v_lines,
      'partial_total', round(v_subtotal, 2),
      'spec', p_spec,
      'excludes', v_excludes,
      'assumptions', v_assumptions,
      'currency', v_currency
    );
  end if;

  return jsonb_build_object(
    'kind', 'INSTANT',
    'amount', round(v_subtotal, 2),
    'currency', v_currency,
    'breakdown', v_lines,
    'excludes', v_excludes,
    'assumptions', v_assumptions,
    'tier_applied', v_tier_applied,
    'spec_used', p_spec
  );
end;
$function$;

comment on function public.compose_offering_price(uuid, jsonb) is
  'Compone el precio con los parámetros del prestador. Devuelve INSTANT con desglose, o QUOTE indicando qué falta. Nunca inventa el precio.';

revoke all on function public.compose_offering_price(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.compose_offering_price(uuid, jsonb) to service_role;

commit;

-- Verificación después de aplicar:
--   select public.compose_offering_price('<offering_id>', '{"urgency":"HOY","quantity":4}'::jsonb);
