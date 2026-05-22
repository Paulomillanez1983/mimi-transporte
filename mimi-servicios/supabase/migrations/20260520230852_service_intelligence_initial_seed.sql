-- Service Intelligence Foundation - initial seed.
--
-- Seed rows are starting points only. They are not the limit of MIMIGO
-- Servicios. All feature flags stay disabled, so this migration does not
-- activate catalog v2, dynamic questions, pricing engine, quotes, discovery,
-- AI, or regulated-services guards in the public UI.

begin;

insert into public.svc_feature_flags (key, enabled, scope, description, metadata_json)
values
  ('MIMI_SERVICE_CATALOG_V2_ENABLED', false, 'global', 'Enable versioned service catalog v2 surfaces.', '{"default":"off"}'::jsonb),
  ('MIMI_PROVIDER_GUIDED_SERVICE_ENABLED', false, 'provider', 'Enable guided provider service setup beta.', '{"default":"off"}'::jsonb),
  ('MIMI_CLIENT_DYNAMIC_QUESTIONS_ENABLED', false, 'client', 'Enable optional dynamic refinement questions for clients.', '{"default":"off","ux_rule":"SEARCH_FIRST_QUESTIONS_LATER"}'::jsonb),
  ('MIMI_PRICING_ENGINE_ENABLED', false, 'system', 'Enable backend pricing engine decisions.', '{"default":"off"}'::jsonb),
  ('MIMI_QUOTES_V2_ENABLED', false, 'global', 'Enable internal quote request and quote offer flow v2.', '{"default":"off"}'::jsonb),
  ('MIMI_AI_INTENT_ASSIST_ENABLED', false, 'system', 'Enable AI-assisted intent classification. AI cannot set final prices.', '{"default":"off"}'::jsonb),
  ('MIMI_SERVICE_DISCOVERY_ENABLED', false, 'global', 'Enable service discovery event inserts from client/provider text.', '{"default":"off"}'::jsonb),
  ('MIMI_REGULATED_SERVICES_GUARD_ENABLED', false, 'global', 'Enable regulated and sensitive service safety guard flows.', '{"default":"off"}'::jsonb),
  ('MIMI_CLIENT_ONE_SHOT_SEARCH_ENABLED', false, 'client', 'Enable one-message search-first client experience.', '{"default":"off","rule":"SEARCH_FIRST_QUESTIONS_LATER"}'::jsonb)
on conflict (key) do update
set
  enabled = false,
  scope = excluded.scope,
  description = excluded.description,
  metadata_json = excluded.metadata_json,
  updated_at = now();

with seed_templates as (
  select *
  from jsonb_to_recordset($$[
    {"slug":"pintura-interior","name":"Pintura interior","category_code":"PINTURA","macro_vertical":"Hogar y mantenimiento","service_family":"Pintura","pricing_model":"SQUARE_METER","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Interior","Habitacion","Casa completa","Hay humedad"]},
    {"slug":"pintura-exterior","name":"Pintura exterior","category_code":"PINTURA","macro_vertical":"Hogar y mantenimiento","service_family":"Pintura","pricing_model":"SQUARE_METER","quote":true,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"REQUIRED_BEFORE_PRICE","chips":["Exterior","Frente","Altura","Medianera"]},
    {"slug":"reparacion-humedad-pared","name":"Reparacion de humedad","category_code":"PINTURA","macro_vertical":"Construccion y refacciones","service_family":"Pintura","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Mancha","Filtracion","Techo","Pared"]},
    {"slug":"pintura-habitacion","name":"Pintura de habitacion","category_code":"PINTURA","macro_vertical":"Hogar y mantenimiento","service_family":"Pintura","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Habitacion","Incluye techo","Solo paredes"]},
    {"slug":"cotizacion-obra-pintura","name":"Cotizacion de obra de pintura","category_code":"PINTURA","macro_vertical":"Construccion y refacciones","service_family":"Pintura","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["Visita","Obra completa","Presupuesto"]},

    {"slug":"plomeria-reparar-perdida","name":"Reparar perdida de agua","category_code":"PLOMERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Plomeria","pricing_model":"BASE_VISIT","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Urgente","Bano","Cocina","Pared"]},
    {"slug":"plomeria-destapar-caneria","name":"Destapar caneria","category_code":"PLOMERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Plomeria","pricing_model":"BASE_VISIT","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Bano","Cocina","Patio","Urgente"]},
    {"slug":"plomeria-instalar-griferia","name":"Instalar griferia","category_code":"PLOMERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Plomeria","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["Bano","Cocina","Tengo repuesto"]},
    {"slug":"plomeria-instalar-termotanque","name":"Instalar termotanque","category_code":"PLOMERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Plomeria","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"medium","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Electrico","Gas","Retiro anterior"]},
    {"slug":"plomeria-diagnostico","name":"Diagnostico de plomeria","category_code":"PLOMERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Plomeria","pricing_model":"BASE_VISIT","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["No se donde pierde","Presupuesto"]},

    {"slug":"electricidad-reparacion","name":"Reparacion electrica","category_code":"ELECTRICIDAD","macro_vertical":"Hogar y mantenimiento","service_family":"Electricidad","pricing_model":"BASE_VISIT","quote":false,"regulated":"regulated","sensitive":"medium","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Sin luz","Corto","Llave termica"]},
    {"slug":"electricidad-instalacion-luces","name":"Instalacion de luces","category_code":"ELECTRICIDAD","macro_vertical":"Hogar y mantenimiento","service_family":"Electricidad","pricing_model":"UNIT","quote":false,"regulated":"regulated","sensitive":"low","approval":true,"credentials":true,"strategy":"OPTIONAL_REFINEMENT","chips":["Lampara","Spot","Exterior"]},
    {"slug":"electricidad-tablero","name":"Trabajo en tablero electrico","category_code":"ELECTRICIDAD","macro_vertical":"Construccion y refacciones","service_family":"Electricidad","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Tablero","Disyuntor","Termica"]},
    {"slug":"electricidad-enchufes","name":"Instalar enchufes o tomas","category_code":"ELECTRICIDAD","macro_vertical":"Hogar y mantenimiento","service_family":"Electricidad","pricing_model":"UNIT","quote":false,"regulated":"regulated","sensitive":"low","approval":true,"credentials":true,"strategy":"OPTIONAL_REFINEMENT","chips":["Cantidad","Pared","Exterior"]},

    {"slug":"gas-revision-instalacion","name":"Revision de instalacion de gas","category_code":"GASISTA","macro_vertical":"Hogar y mantenimiento","service_family":"Gas","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Matriculado","Perdida","Artefacto"]},
    {"slug":"gas-instalacion-artefacto","name":"Instalacion de artefacto a gas","category_code":"GASISTA","macro_vertical":"Hogar y mantenimiento","service_family":"Gas","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Cocina","Calefon","Termotanque"]},
    {"slug":"gas-reparacion-perdida","name":"Reparacion de perdida de gas","category_code":"GASISTA","macro_vertical":"Hogar y mantenimiento","service_family":"Gas","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"critical","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Cortar gas","Urgente","Matriculado"]},
    {"slug":"gas-cotizacion","name":"Cotizacion de trabajo de gas","category_code":"GASISTA","macro_vertical":"Construccion y refacciones","service_family":"Gas","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Obra","Plano","Matricula"]},

    {"slug":"aire-instalacion-split","name":"Instalacion de aire split","category_code":"INSTALACION_AIRE","macro_vertical":"Hogar y mantenimiento","service_family":"Aire acondicionado","pricing_model":"FIXED","quote":false,"regulated":"low","sensitive":"low","approval":false,"credentials":true,"strategy":"REQUIRED_BEFORE_PRICE","chips":["Split","Altura","Frigorias","Mensula"]},
    {"slug":"aire-mantenimiento","name":"Mantenimiento de aire acondicionado","category_code":"INSTALACION_AIRE","macro_vertical":"Hogar y mantenimiento","service_family":"Aire acondicionado","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Limpieza","No enfria","Service"]},
    {"slug":"aire-limpieza","name":"Limpieza de aire acondicionado","category_code":"INSTALACION_AIRE","macro_vertical":"Hogar y mantenimiento","service_family":"Aire acondicionado","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["Split","Filtro","Unidad interior"]},
    {"slug":"aire-desinstalacion","name":"Desinstalacion de aire","category_code":"INSTALACION_AIRE","macro_vertical":"Hogar y mantenimiento","service_family":"Aire acondicionado","pricing_model":"FIXED","quote":false,"regulated":"low","sensitive":"low","approval":false,"credentials":true,"strategy":"REQUIRED_BEFORE_PRICE","chips":["Retiro","Altura","Conservar gas"]},
    {"slug":"aire-diagnostico-tecnico","name":"Diagnostico tecnico de aire","category_code":"INSTALACION_AIRE","macro_vertical":"Hogar y mantenimiento","service_family":"Aire acondicionado","pricing_model":"BASE_VISIT","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["No enfria","Hace ruido","Pierde agua"]},

    {"slug":"cerrajeria-apertura-puerta","name":"Apertura de puerta","category_code":"CERRAJERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Cerrajeria","pricing_model":"BASE_VISIT","quote":false,"regulated":"none","sensitive":"medium","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Urgente","Casa","Auto"]},
    {"slug":"cerrajeria-cambio-cerradura","name":"Cambio de cerradura","category_code":"CERRAJERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Cerrajeria","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"medium","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Puerta principal","Reja","Tengo cerradura"]},
    {"slug":"cerrajeria-copia-llaves","name":"Copia o reparacion de llaves","category_code":"CERRAJERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Cerrajeria","pricing_model":"UNIT","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["Llave comun","Llave especial"]},

    {"slug":"limpieza-hogar","name":"Limpieza de hogar","category_code":"LIMPIEZA","macro_vertical":"Hogar y mantenimiento","service_family":"Limpieza","pricing_model":"HOURLY","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Departamento","Casa","Profunda"]},
    {"slug":"limpieza-post-obra","name":"Limpieza post obra","category_code":"LIMPIEZA","macro_vertical":"Construccion y refacciones","service_family":"Limpieza","pricing_model":"SQUARE_METER","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"REQUIRED_BEFORE_PRICE","chips":["Obra","Escombros","Vidrios"]},
    {"slug":"limpieza-oficina","name":"Limpieza de oficina","category_code":"LIMPIEZA","macro_vertical":"Profesionales","service_family":"Limpieza","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Frecuencia","Metros","Fuera de horario"]},

    {"slug":"jardineria-mantenimiento","name":"Mantenimiento de jardin","category_code":"JARDINERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Jardineria","pricing_model":"SQUARE_METER","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Cesped","Poda","Maleza"]},
    {"slug":"jardineria-poda","name":"Poda de arboles o plantas","category_code":"JARDINERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Jardineria","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"medium","approval":false,"credentials":false,"strategy":"REQUIRED_BEFORE_PRICE","chips":["Altura","Arbol grande","Retiro ramas"]},
    {"slug":"jardineria-diseno","name":"Diseno de jardin","category_code":"JARDINERIA","macro_vertical":"Hogar y mantenimiento","service_family":"Jardineria","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Plantas","Riego","Proyecto"]},

    {"slug":"peluqueria-corte","name":"Corte de pelo a domicilio","category_code":"PELUQUERIA","macro_vertical":"Belleza y cuidado personal","service_family":"Peluqueria","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["Mujer","Hombre","Nino"]},
    {"slug":"peluqueria-peinado","name":"Peinado a domicilio","category_code":"PELUQUERIA","macro_vertical":"Belleza y cuidado personal","service_family":"Peluqueria","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Evento","Brushing","Recogido"]},
    {"slug":"peluqueria-coloracion","name":"Coloracion","category_code":"PELUQUERIA","macro_vertical":"Belleza y cuidado personal","service_family":"Peluqueria","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"REQUIRED_BEFORE_PRICE","chips":["Tintura","Mechas","Decoloracion"]},
    {"slug":"barberia-corte-barba","name":"Corte y barba","category_code":"PELUQUERIA","macro_vertical":"Belleza y cuidado personal","service_family":"Barberia","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["Corte","Barba","Perfilado"]},
    {"slug":"manicura-servicio","name":"Manicura a domicilio","category_code":"MANICURIA","macro_vertical":"Belleza y cuidado personal","service_family":"Manicura","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Semipermanente","Kapping","Esculpidas"]},
    {"slug":"maquillaje-evento","name":"Maquillaje para evento","category_code":"BELLEZA","macro_vertical":"Belleza y cuidado personal","service_family":"Maquillaje","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Fiesta","Novia","Social"]},
    {"slug":"depilacion-domicilio","name":"Depilacion a domicilio","category_code":"BELLEZA","macro_vertical":"Belleza y cuidado personal","service_family":"Depilacion","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"medium","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Zona","Sistema","Domicilio"]},

    {"slug":"masaje-relajante","name":"Masaje relajante","category_code":"MASAJISTA","macro_vertical":"Salud y bienestar","service_family":"Masajes","pricing_model":"SESSION","quote":false,"regulated":"none","sensitive":"medium","approval":false,"credentials":false,"strategy":"SAFETY_GATE","chips":["Relajante","Domicilio","Duracion"]},
    {"slug":"masaje-descontracturante","name":"Masaje descontracturante","category_code":"MASAJISTA","macro_vertical":"Salud y bienestar","service_family":"Masajes","pricing_model":"SESSION","quote":false,"regulated":"none","sensitive":"medium","approval":false,"credentials":false,"strategy":"SAFETY_GATE","chips":["Contractura","Dolor","No diagnostico"]},
    {"slug":"masaje-deportivo","name":"Masaje deportivo","category_code":"MASAJISTA","macro_vertical":"Salud y bienestar","service_family":"Masajes","pricing_model":"SESSION","quote":false,"regulated":"low","sensitive":"medium","approval":false,"credentials":true,"strategy":"SAFETY_GATE","chips":["Post entrenamiento","Zona","Duracion"]},
    {"slug":"psicologia-primera-consulta","name":"Primera consulta psicologica","category_code":"PSICOLOGIA","macro_vertical":"Salud y bienestar","service_family":"Psicologia","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Online","Presencial","Matricula"]},
    {"slug":"psicologia-consulta-individual","name":"Consulta psicologica individual","category_code":"PSICOLOGIA","macro_vertical":"Salud y bienestar","service_family":"Psicologia","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Online","Seguimiento","Matricula"]},
    {"slug":"kinesiologia-sesion","name":"Sesion de kinesiologia","category_code":"KINESIOLOGIA","macro_vertical":"Salud y bienestar","service_family":"Kinesiologia","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Rehabilitacion","Domicilio","Matricula"]},
    {"slug":"entrenamiento-personal","name":"Entrenamiento personalizado","category_code":"BELLEZA","macro_vertical":"Salud y bienestar","service_family":"Entrenamiento","pricing_model":"SESSION","quote":false,"regulated":"low","sensitive":"medium","approval":false,"credentials":true,"strategy":"OPTIONAL_REFINEMENT","chips":["Online","Presencial","Objetivo"]},
    {"slug":"yoga-clase","name":"Clase de yoga","category_code":"BELLEZA","macro_vertical":"Salud y bienestar","service_family":"Yoga","pricing_model":"SESSION","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Individual","Grupal","Online"]},

    {"slug":"paseo-perro","name":"Paseo de perro","category_code":"MASCOTAS","macro_vertical":"Mascotas","service_family":"Paseador de perros","pricing_model":"SESSION","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Perro chico","Perro grande","Duracion"]},
    {"slug":"peluqueria-canina","name":"Peluqueria canina","category_code":"MASCOTAS","macro_vertical":"Mascotas","service_family":"Peluqueria canina","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Tamano","Bano","Corte"]},
    {"slug":"cuidado-mascotas","name":"Cuidado de mascotas","category_code":"MASCOTAS","macro_vertical":"Mascotas","service_family":"Cuidado de mascotas","pricing_model":"DAILY","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["En casa","Visita","Dias"]},

    {"slug":"profesor-particular","name":"Profesor particular","category_code":"EDUCACION","macro_vertical":"Educacion","service_family":"Profesor particular","pricing_model":"HOURLY","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Materia","Nivel","Online"]},
    {"slug":"apoyo-escolar","name":"Apoyo escolar","category_code":"EDUCACION","macro_vertical":"Educacion","service_family":"Apoyo escolar","pricing_model":"HOURLY","quote":false,"regulated":"none","sensitive":"medium","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Primaria","Secundaria","Domicilio"]},
    {"slug":"clases-idiomas","name":"Clases de idiomas","category_code":"EDUCACION","macro_vertical":"Educacion","service_family":"Idiomas","pricing_model":"HOURLY","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Ingles","Portugues","Online"]},

    {"slug":"reparacion-pc","name":"Reparacion de PC","category_code":"TECNOLOGIA","macro_vertical":"Tecnologia","service_family":"Reparacion de PC","pricing_model":"BASE_VISIT","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Notebook","PC","No enciende"]},
    {"slug":"soporte-tecnico","name":"Soporte tecnico","category_code":"TECNOLOGIA","macro_vertical":"Tecnologia","service_family":"Soporte tecnico","pricing_model":"HOURLY","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"NO_QUESTION","chips":["Remoto","Domicilio","Software"]},
    {"slug":"instalacion-redes","name":"Instalacion de redes","category_code":"TECNOLOGIA","macro_vertical":"Tecnologia","service_family":"Instalacion de redes","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"REQUIRED_BEFORE_PRICE","chips":["Wifi","Cableado","Camara"]},

    {"slug":"cuidador-adultos","name":"Cuidador de adultos","category_code":"CUIDADO_ADULTOS","macro_vertical":"Cuidado de personas","service_family":"Cuidador de adultos","pricing_model":"HOURLY","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Acompanamiento","Turno","Credenciales"]},
    {"slug":"acompanante-personas","name":"Acompanante","category_code":"CUIDADO_ADULTOS","macro_vertical":"Cuidado de personas","service_family":"Acompanante","pricing_model":"HOURLY","quote":true,"regulated":"low","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Adulto mayor","Turno","Domicilio"]},
    {"slug":"ninera","name":"Ninera","category_code":"CUIDADO_NINOS","macro_vertical":"Cuidado de personas","service_family":"Ninera","pricing_model":"HOURLY","quote":true,"regulated":"restricted","sensitive":"critical","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Menores","Referencias","Aprobacion"]},

    {"slug":"evento-mozo","name":"Mozos para eventos","category_code":"MOZZO","macro_vertical":"Eventos","service_family":"Personal de eventos","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Cantidad","Horas","Ubicacion"]},
    {"slug":"evento-cocinero","name":"Cocinero a domicilio","category_code":"COCINEROS_DOMICILIO","macro_vertical":"Eventos","service_family":"Cocina para eventos","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Comensales","Menu","Fecha"]},
    {"slug":"evento-maquillaje","name":"Maquillaje para eventos","category_code":"BELLEZA","macro_vertical":"Eventos","service_family":"Belleza para eventos","pricing_model":"FIXED","quote":false,"regulated":"none","sensitive":"none","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Fiesta","Novia","Social"]},

    {"slug":"abogado-consulta","name":"Consulta legal","category_code":"ABOGADO","macro_vertical":"Profesionales","service_family":"Abogado","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Consulta","Matricula","Jurisdiccion"]},
    {"slug":"abogado-penalista-consulta","name":"Consulta penal","category_code":"ABOGADO_PENALISTA","macro_vertical":"Profesionales","service_family":"Abogado penalista","pricing_model":"QUOTE","quote":true,"regulated":"regulated","sensitive":"high","approval":true,"credentials":true,"strategy":"SAFETY_GATE","chips":["Urgente","Matricula","Jurisdiccion"]},
    {"slug":"cotizacion-profesional","name":"Cotizacion profesional","category_code":"PROFESIONALES","macro_vertical":"Profesionales","service_family":"Otros profesionales","pricing_model":"QUOTE","quote":true,"regulated":"low","sensitive":"medium","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Consulta","Presupuesto","Online"]},

    {"slug":"gomeria-movil","name":"Gomeria movil","category_code":"GOMERIA_MOVIL","macro_vertical":"Automotor liviano","service_family":"Gomeria movil","pricing_model":"BASE_VISIT","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["Pinchadura","Cambio rueda","Ubicacion"]},
    {"slug":"mecanica-movil-diagnostico","name":"Diagnostico mecanico movil","category_code":"MECANICA_MOVIL","macro_vertical":"Automotor liviano","service_family":"Mecanica movil","pricing_model":"BASE_VISIT","quote":false,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"OPTIONAL_REFINEMENT","chips":["No arranca","Bateria","Ubicacion"]},
    {"slug":"otros-discovery","name":"Otro servicio a descubrir","category_code":"OTROS","macro_vertical":"Otros / discovery","service_family":"Discovery","pricing_model":"QUOTE","quote":true,"regulated":"none","sensitive":"low","approval":false,"credentials":false,"strategy":"REQUIRED_BEFORE_RESULTS","chips":["Describir","No encuentro rubro","Nuevo servicio"]}
  ]$$::jsonb) as x(
    slug text,
    name text,
    category_code text,
    macro_vertical text,
    service_family text,
    pricing_model text,
    quote boolean,
    regulated text,
    sensitive text,
    approval boolean,
    credentials boolean,
    strategy text,
    chips jsonb
  )
),
upserted_templates as (
  insert into public.svc_service_templates (
    category_id,
    slug,
    name,
    description,
    macro_vertical,
    service_family,
    default_pricing_model,
    default_quote_required,
    regulated_level,
    sensitive_level,
    requires_admin_approval,
    requires_credentials,
    default_question_strategy,
    is_active,
    metadata_json
  )
  select
    (
      select c.id
      from public.svc_categories c
      where c.code = st.category_code
         or c.slug = lower(replace(st.service_family, ' ', '-'))
      order by case when c.code = st.category_code then 0 else 1 end
      limit 1
    ),
    st.slug,
    st.name,
    'Seed template for Service Intelligence Foundation. Not a marketplace boundary.',
    st.macro_vertical,
    st.service_family,
    st.pricing_model,
    st.quote,
    st.regulated,
    st.sensitive,
    st.approval,
    st.credentials,
    st.strategy,
    true,
    jsonb_build_object(
      'seed', true,
      'seed_category_code', st.category_code,
      'search_first', true,
      'suggested_chips', st.chips
    )
  from seed_templates st
  on conflict (slug) do update
  set
    name = excluded.name,
    description = excluded.description,
    macro_vertical = excluded.macro_vertical,
    service_family = excluded.service_family,
    default_pricing_model = excluded.default_pricing_model,
    default_quote_required = excluded.default_quote_required,
    regulated_level = excluded.regulated_level,
    sensitive_level = excluded.sensitive_level,
    requires_admin_approval = excluded.requires_admin_approval,
    requires_credentials = excluded.requires_credentials,
    default_question_strategy = excluded.default_question_strategy,
    is_active = excluded.is_active,
    metadata_json = excluded.metadata_json,
    updated_at = now()
  returning id, slug, name, default_pricing_model, default_quote_required, default_question_strategy, regulated_level, sensitive_level, requires_admin_approval, requires_credentials, metadata_json
),
upserted_versions as (
  insert into public.svc_service_template_versions (
    service_template_id,
    version_number,
    status,
    title,
    description,
    pricing_model,
    quote_required_default,
    question_strategy_default,
    metadata_json,
    published_at
  )
  select
    t.id,
    1,
    'active',
    t.name,
    'Initial active template version for search-first Service Intelligence.',
    t.default_pricing_model,
    t.default_quote_required,
    t.default_question_strategy,
    jsonb_build_object(
      'seed', true,
      'search_first', true,
      'suggested_result_mode',
      case
        when t.default_question_strategy = 'SAFETY_GATE' then 'safety_gate'
        when t.default_quote_required then 'quote'
        else 'show_results_with_refinements'
      end,
      'suggested_chips', coalesce(t.metadata_json->'suggested_chips', '[]'::jsonb)
    ),
    now()
  from upserted_templates t
  on conflict (service_template_id, version_number) do update
  set
    status = excluded.status,
    title = excluded.title,
    description = excluded.description,
    pricing_model = excluded.pricing_model,
    quote_required_default = excluded.quote_required_default,
    question_strategy_default = excluded.question_strategy_default,
    metadata_json = excluded.metadata_json,
    published_at = coalesce(public.svc_service_template_versions.published_at, excluded.published_at),
    updated_at = now()
  returning id, service_template_id, pricing_model, quote_required_default, question_strategy_default
)
insert into public.svc_service_attributes (
  template_version_id,
  code,
  label,
  description,
  data_type,
  unit,
  required,
  affects_price,
  affects_matching,
  can_be_extracted_from_text,
  ask_only_if_missing,
  enum_options,
  validation_json,
  sort_order
)
select
  v.id,
  a.code,
  a.label,
  a.description,
  a.data_type,
  a.unit,
  a.required,
  a.affects_price,
  a.affects_matching,
  true,
  true,
  a.enum_options,
  a.validation_json,
  a.sort_order
from upserted_versions v
cross join (
  values
    ('urgency', 'Urgencia', 'Nivel de urgencia expresado por el cliente.', 'enum', null, false, false, true, '["normal","hoy","urgente"]'::jsonb, '{}'::jsonb, 10),
    ('modality', 'Modalidad', 'Online, presencial o a domicilio.', 'enum', null, false, false, true, '["domicilio","presencial","online"]'::jsonb, '{}'::jsonb, 20),
    ('location', 'Ubicacion', 'Zona o domicilio aproximado para matching.', 'location', null, false, false, true, '[]'::jsonb, '{}'::jsonb, 30),
    ('quantity', 'Cantidad o medida', 'Cantidad, m2, horas o unidades segun servicio.', 'number', null, false, true, false, '[]'::jsonb, '{"min":0}'::jsonb, 40),
    ('details', 'Detalle del pedido', 'Texto libre para explicar alcance sin bloquear busqueda.', 'text', null, false, false, true, '[]'::jsonb, '{"maxLength":2000}'::jsonb, 90)
) as a(code, label, description, data_type, unit, required, affects_price, affects_matching, enum_options, validation_json, sort_order)
on conflict (template_version_id, code) do update
set
  label = excluded.label,
  description = excluded.description,
  data_type = excluded.data_type,
  unit = excluded.unit,
  required = excluded.required,
  affects_price = excluded.affects_price,
  affects_matching = excluded.affects_matching,
  can_be_extracted_from_text = excluded.can_be_extracted_from_text,
  ask_only_if_missing = excluded.ask_only_if_missing,
  enum_options = excluded.enum_options,
  validation_json = excluded.validation_json,
  sort_order = excluded.sort_order;

insert into public.svc_service_questions (
  template_version_id,
  attribute_id,
  question_text,
  helper_text,
  answer_type,
  required,
  question_strategy,
  show_if_json,
  risk_check_json,
  sort_order
)
select
  v.id,
  a.id,
  case a.code
    when 'urgency' then 'Lo necesitas hoy o puede ser programado?'
    when 'quantity' then 'Tenes una medida o cantidad aproximada?'
    when 'details' then 'Queres sumar algun detalle para ajustar resultados?'
    else 'Queres ajustar este dato?'
  end,
  'Refinamiento opcional. No bloquea la primera busqueda salvo safety gate.',
  a.data_type,
  false,
  case
    when v.question_strategy_default = 'SAFETY_GATE' and a.code = 'details' then 'safety'
    when a.affects_price then 'price_only'
    else 'optional_refinement'
  end,
  '{}'::jsonb,
  case
    when v.question_strategy_default = 'SAFETY_GATE' then '{"requires_safe_copy":true}'::jsonb
    else '{}'::jsonb
  end,
  a.sort_order
from public.svc_service_template_versions v
join public.svc_service_attributes a on a.template_version_id = v.id
where v.status = 'active'
  and not exists (
    select 1 from public.svc_service_questions q
    where q.template_version_id = v.id
      and q.attribute_id = a.id
  );

insert into public.svc_pricing_rules (
  template_version_id,
  pricing_model,
  rule_type,
  condition_json,
  formula_json,
  min_price,
  max_price,
  currency,
  quote_if_missing_attributes,
  quote_if_low_confidence,
  allow_search_without_full_price,
  is_active
)
select
  v.id,
  v.pricing_model,
  case when v.quote_required_default then 'quote_gate' else 'base' end,
  jsonb_build_object('search_first', true),
  jsonb_build_object(
    'source', 'provider_offering_or_quote',
    'ai_final_price_allowed', false
  ),
  null,
  null,
  'ARS',
  true,
  true,
  true,
  true
from public.svc_service_template_versions v
where v.status = 'active'
  and not exists (
    select 1 from public.svc_pricing_rules r
    where r.template_version_id = v.id
      and r.rule_type in ('base', 'quote_gate')
  );

insert into public.svc_regulated_service_requirements (
  service_template_id,
  template_version_id,
  requirement_type,
  requirement_label,
  required_document_type,
  jurisdiction_required,
  admin_approval_required,
  emergency_disclaimer_required,
  blocks_auto_pricing,
  blocks_results_without_disclaimer,
  metadata_json
)
select
  t.id,
  v.id,
  req.requirement_type,
  req.requirement_label,
  req.required_document_type,
  req.jurisdiction_required,
  t.requires_admin_approval,
  req.emergency_disclaimer_required,
  true,
  req.blocks_results_without_disclaimer,
  jsonb_build_object('seed', true, 'regulated_level', t.regulated_level, 'sensitive_level', t.sensitive_level)
from public.svc_service_templates t
join public.svc_service_template_versions v on v.service_template_id = t.id and v.status = 'active'
cross join (
  values
    ('credential', 'Credenciales o matricula verificables', 'professional_license', true, false, false),
    ('disclaimer', 'Aviso: MIMIGO no diagnostica ni reemplaza atencion profesional.', null, false, true, true),
    ('manual_quote', 'Cotizacion o validacion manual antes de confirmar precio final.', null, false, false, false)
) as req(requirement_type, requirement_label, required_document_type, jurisdiction_required, emergency_disclaimer_required, blocks_results_without_disclaimer)
where (t.regulated_level <> 'none' or t.sensitive_level in ('medium', 'high', 'critical'))
  and not exists (
    select 1
    from public.svc_regulated_service_requirements existing
    where existing.template_version_id = v.id
      and existing.requirement_type = req.requirement_type
  );

commit;
