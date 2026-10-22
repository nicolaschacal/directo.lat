# Seguridad y privacidad

El sistema guarda datos de ciudadanos que conversan con un dirigente político. En Venezuela eso puede exponer a esas personas, así que el criterio es: guardar lo mínimo, mostrarlo solo a quien lo necesita y borrarlo cuando deja de servir.

## Qué se guarda

| Dato | Dónde | Quién lo ve | Cuánto dura |
|---|---|---|---|
| Nombre, teléfono, estado y localidad | `leads` | Administradores y el coordinador de esa localidad | Hasta que se borre el contacto |
| Notas y resumen de la IA | `leads` | Ídem | Ídem |
| Mensajes del chat | `conversation_messages` | Administradores; el coordinador solo los de sus contactos | 90 días sin actividad (configurable) |
| Localidad de conversaciones anónimas | `conversation_sessions` | Administradores | Ídem |

No se pide cédula, dirección, correo ni fecha de nacimiento. El chat muestra un aviso para que la gente no los escriba.

## Controles incluidos

- Consentimiento explícito en el formulario de contacto (queda la fecha).
- Roles: administrador y coordinador. Filtros por localidad aplicados en el servidor en cada consulta.
- El usuario se vuelve a validar en cada pedido: desactivar a alguien corta su acceso en el acto.
- Correos de aviso sin teléfonos ni conversaciones: solo localidad y enlace al panel.
- Las indicaciones internas del asistente no se publican en el perfil público.
- Borrado automático de conversaciones vencidas y de visitas vacías (tarea periódica).
- Claves de integraciones cifradas (AES-256-GCM), contraseñas con bcrypt, cookie HttpOnly.
- PostgreSQL sin puerto expuesto y HTTPS con Caddy en el despliegue con Docker.

## Recomendaciones de operación

- Servidor y dominio a nombre de una persona o entidad fuera de Venezuela.
- Pocos administradores; revisar periódicamente quién tiene acceso.
- Coordinadores: usar un número de teléfono dedicado y no guardar los contactos en la agenda personal.
- Respaldos cifrados en otro proveedor; no usar datos reales para pruebas.
- Proveedor de IA con opción de no retención de datos si está disponible.

## Datos enviados a Gemini

Los mensajes del chat se envían al modelo para generar respuestas. El nombre y el teléfono del formulario no se envían. El resumen para el coordinador y el resumen territorial usan las conversaciones; se le indica al modelo que no incluya datos personales en sus resúmenes.
