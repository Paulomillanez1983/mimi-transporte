-- MIMI Servicios - categorias base para marketplace de prestadores independientes.
-- Idempotente: actualiza por code si existe, inserta si falta.

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('SERVICIO_DOMESTICO', 'Servicio domestico', 'Ayuda general para el hogar.'),
      ('LIMPIEZA', 'Limpieza', 'Hogar, departamento, oficina y mantenimiento general.'),
      ('PLOMERIA', 'Plomeria', 'Canerias, perdidas, griferia, banos y urgencias simples.'),
      ('ELECTRICIDAD', 'Electricidad', 'Instalaciones, reparaciones y revisiones electricas.'),
      ('GASISTA', 'Gasista', 'Instalaciones y revisiones de gas por prestadores habilitados.'),
      ('INSTALACION_AIRE', 'Instalacion de aire', 'Instalacion, mantenimiento y revision de aires acondicionados.'),
      ('REFRIGERACION', 'Refrigeracion', 'Heladeras, freezers, camaras y equipos de frio.'),
      ('PINTURA', 'Pintura', 'Pintura interior, exterior y retoques.'),
      ('CERRAJERIA', 'Cerrajeria', 'Cerraduras, llaves, aperturas y cambios.'),
      ('CARPINTERIA', 'Carpinteria', 'Muebles, puertas, arreglos y trabajos en madera.'),
      ('ALBANILERIA', 'Albanileria', 'Arreglos, pequenas obras y mantenimiento.'),
      ('JARDINERIA', 'Jardineria', 'Corte, poda, limpieza y mantenimiento de espacios verdes.'),
      ('MUDANZAS', 'Mudanzas', 'Ayuda para mover, cargar, ordenar y trasladar objetos.'),
      ('PELUQUERIA', 'Peluqueria', 'Corte, peinado, color y servicios personales.'),
      ('MANICURIA', 'Manicuria', 'Manos, unas, esmaltado y belleza personal.'),
      ('MASAJISTA', 'Masajista', 'Masajes y bienestar a domicilio.'),
      ('CUIDADO_ADULTOS', 'Cuidado de adultos', 'Acompanamiento y cuidado de personas mayores.'),
      ('CUIDADO_NINOS', 'Cuidado de ninos', 'Cuidado y acompanamiento infantil.'),
      ('ENFERMERIA', 'Enfermeria', 'Asistencia basica de salud y cuidados indicados.'),
      ('TECNICO_PC', 'Tecnico PC', 'Soporte tecnico, computadoras, redes e impresoras.'),
      ('TECNOLOGIA', 'Tecnologia', 'Instalaciones, soporte tecnico y configuracion de equipos.'),
      ('MASCOTAS', 'Mascotas', 'Paseos, cuidado, acompanamiento y asistencia basica.'),
      ('BELLEZA', 'Belleza', 'Servicios personales, estetica y cuidado a domicilio.')
    ) as v(code, name, description)
  loop
    if exists (select 1 from public.svc_categories where code = item.code) then
      update public.svc_categories
      set
        name = item.name,
        description = item.description,
        active = true
      where code = item.code;
    else
      insert into public.svc_categories (id, code, name, description, active)
      values (gen_random_uuid(), item.code, item.name, item.description, true);
    end if;
  end loop;
end $$;

update public.svc_categories legacy
set active = false
where legacy.code = 'domestic_cleaning'
  and exists (
    select 1
    from public.svc_categories canonical
    where canonical.code = 'SERVICIO_DOMESTICO'
      and canonical.active = true
  )
  and not exists (
    select 1
    from public.svc_provider_categories pc
    where pc.category_id = legacy.id
  );

select code, name, active
from public.svc_categories
where active = true
order by name;
