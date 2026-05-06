-- Categorias profesionales para MIMI Servicios.
-- Ejecutar en Supabase SQL Editor o con la CLI cuando se quiera habilitar
-- matching real para psicologia, nutricion, kinesiologia, abogacia,
-- contabilidad y clases particulares.
--
-- Es aditivo y reversible: no elimina datos y usa ON CONFLICT por code.

with upserted as (
  insert into public.svc_categories (
    code,
    name,
    description,
    active,
    sort_order,
    aliases,
    search_keywords,
    default_pricing_model,
    requires_provider_quote
  )
  values
    (
      'PSICOLOGIA',
      'Psicologia',
      'Orientacion y acompanamiento psicologico con profesionales independientes.',
      true,
      320,
      '["psicologo","psicologa","terapia","ansiedad","emocional","salud mental"]'::jsonb,
      array['psicologo','psicologa','psicologia','terapia','ansiedad','depresion','panico','angustia','salud mental','acompanamiento emocional'],
      'HOURLY',
      false
    ),
    (
      'NUTRICION',
      'Nutricion',
      'Consultas y orientacion nutricional con profesionales independientes.',
      true,
      321,
      '["nutricionista","alimentacion","dieta","plan alimentario"]'::jsonb,
      array['nutricionista','nutricion','alimentacion','dieta','plan alimentario','comer mejor'],
      'HOURLY',
      false
    ),
    (
      'KINESIOLOGIA',
      'Kinesiologia',
      'Rehabilitacion, movilidad y sesiones de kinesiologia.',
      true,
      322,
      '["kinesiologo","fisio","rehabilitacion","dolor muscular"]'::jsonb,
      array['kinesiologo','kinesiologia','fisio','fisioterapia','rehabilitacion','lesion','dolor muscular','movilidad'],
      'HOURLY',
      false
    ),
    (
      'ABOGACIA',
      'Abogacia',
      'Consultas legales y orientacion profesional independiente.',
      true,
      323,
      '["abogado","abogada","legal","contrato","laboral"]'::jsonb,
      array['abogado','abogada','abogacia','legal','contrato','laboral','despido','familia','alquiler','carta documento'],
      'QUOTE',
      true
    ),
    (
      'CONTABILIDAD',
      'Contabilidad',
      'Asistencia contable, impositiva y administrativa.',
      true,
      324,
      '["contador","contadora","monotributo","afip","impuestos"]'::jsonb,
      array['contador','contadora','contabilidad','impuestos','monotributo','afip','facturacion','balances','iva'],
      'QUOTE',
      true
    ),
    (
      'CLASES_PARTICULARES',
      'Clases particulares',
      'Apoyo escolar, idiomas y capacitaciones particulares.',
      true,
      325,
      '["profesor","profesora","clases","matematica","ingles"]'::jsonb,
      array['profesor','profesora','clases','apoyo escolar','matematica','ingles','idiomas','examen'],
      'HOURLY',
      false
    )
  on conflict (code) do update set
    name = excluded.name,
    description = excluded.description,
    active = true,
    aliases = excluded.aliases,
    search_keywords = excluded.search_keywords,
    default_pricing_model = excluded.default_pricing_model,
    requires_provider_quote = excluded.requires_provider_quote,
    updated_at = now()
  returning id, code
),
rules as (
  select *
  from (values
    ('PSICOLOGIA', 'necesito un psicologo', array['psicologo','psicologa','terapia','ansiedad','salud mental'], 1.45),
    ('PSICOLOGIA', 'necesito terapia', array['terapia','terapeuta','angustia','panico','acompanamiento emocional'], 1.35),
    ('NUTRICION', 'quiero una nutricionista', array['nutricionista','nutricion','alimentacion','dieta','plan alimentario'], 1.35),
    ('KINESIOLOGIA', 'busco kinesiologo', array['kinesiologo','kinesiologia','fisio','rehabilitacion','lesion'], 1.35),
    ('ABOGACIA', 'necesito un abogado', array['abogado','abogada','legal','contrato','laboral','despido'], 1.35),
    ('CONTABILIDAD', 'necesito un contador', array['contador','contadora','monotributo','afip','impuestos','facturacion'], 1.35),
    ('CLASES_PARTICULARES', 'necesito clases particulares', array['profesor','profesora','clases','apoyo escolar','matematica','ingles'], 1.25)
  ) as r(code, phrase, keywords, weight)
),
inserted_rules as (
  insert into public.svc_service_intent_rules (
    category_id,
    locale,
    phrase,
    keywords,
    weight,
    active
  )
  select
    c.id,
    'es-AR',
    r.phrase,
    r.keywords::text[],
    r.weight,
    true
  from rules r
  join public.svc_categories c on c.code = r.code
  where not exists (
    select 1
    from public.svc_service_intent_rules existing
    where existing.category_id = c.id
      and lower(existing.phrase) = lower(r.phrase)
  )
  returning id
)
select
  (select count(*) from upserted) as categories_upserted,
  (select count(*) from inserted_rules) as rules_inserted;
