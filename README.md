# Catalina Cosmetic

Este proyecto contiene los archivos estáticos y scripts SQL necesarios para inicializar el sitio Catalina Cosmetic con Supabase.

## Contenido

- `catalina.html`: Página principal del cliente.
- `admin.html`: Interfaz de administración.
- `supabase-schema.sql`: Esquema de base de datos para Supabase.
- `supabase-seed.sql`: Datos iniciales de ejemplo para productos.
- `SUPABASE_SETUP.md`: Instrucciones para configurar Supabase.

## Configuración

1. Crear un proyecto en Supabase.
2. Habilitar autenticación por correo y contraseña.
3. Ejecutar `supabase-schema.sql` en el editor SQL.
4. Ejecutar `supabase-seed.sql` para cargar los datos iniciales.
5. Crear un usuario administrador en Supabase Auth.
6. Configurar el metadato `app_metadata` del admin en:

```json
{ "role": "admin" }
```

7. Agregar las siguientes variables de entorno en la configuración del sitio:

```text
CATALINA_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
CATALINA_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

8. Desplegar nuevamente el sitio después de configurar las variables.

## Notas

- No incluya la `service_role` key en `catalina.html` ni en el frontend público.
- El cliente público debe usar únicamente la `publishable key`.
