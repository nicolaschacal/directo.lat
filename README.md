# Escucha (nombre provisorio)

Asistente con IA para dirigentes políticos. La gente conversa con un chat propio (se comparte como un link en WhatsApp, Instagram, columnas o un QR), conoce qué hace y qué propone el dirigente, y si quiere deja su nombre, teléfono y localidad para que la contacte el coordinador de su zona.

Construido sobre la base de AdmisIA: mismo chat estilo WhatsApp, misma base de conocimiento (la IA responde solo con lo que carga el equipo) y mismo panel, adaptado a contactos por localidad.

## Qué hace

**Chat público**
- La IA responde solo desde la base de conocimiento. Si algo no está, no inventa: ofrece que el coordinador responda.
- No promete gestiones, no opina de otros políticos, no da opiniones propias.
- Aviso de privacidad visible al abrir el chat (editable): no escribir cédula ni dirección.
- Selector opcional de estado y localidad, para saber qué dice la gente en cada zona aunque no deje sus datos.
- Invitación sutil a dejar nombre, teléfono y localidad para que lo contacte el coordinador de su zona, con consentimiento explícito.
- Detección de teléfonos venezolanos escritos en el chat (0414…, +58…).

**Panel**
- **Administrador** (el político y su equipo de confianza): ve todo. Contactos de todas las localidades, conversaciones anónimas, escucha territorial y configuración.
- **Coordinador**: ve solo los contactos de sus localidades, con la conversación y un resumen de la IA para llamar preparado. Nada más.
- **Escucha territorial**: por estado y localidad, cuántas conversaciones y contactos hay, los mensajes de la gente y un resumen con IA de las principales preocupaciones y de las preguntas que conviene agregar a la base.
- Pendientes y recordatorios por coordinador, con aviso por correo (sin teléfonos ni conversaciones en el correo).

**Datos**
- De cada contacto: nombre, teléfono, estado, localidad, notas y resumen de la IA.
- Las conversaciones se borran solas a los 90 días sin actividad (configurable). Los contactos quedan.
- Las claves de integraciones se guardan cifradas (AES-256-GCM). Contraseñas con bcrypt. Sesión en cookie HttpOnly.
- Cada pedido del panel vuelve a validar al usuario: si se lo desactiva o se le quitan localidades, rige en el acto.

## Instalación

1. **Base de datos.** PostgreSQL (servidor propio recomendado; también Neon, Supabase o Railway). El usuario necesita poder crear las extensiones `pgcrypto` y `pg_trgm`.
2. **Variables mínimas** (ver `.env.example`): `DATABASE_URL`, `CRM_JWT_SECRET`, `CRON_SECRET`.
3. **Migraciones.** `npm install && npm run db:migrate`
4. **Asistente inicial.** Entrar a `/dashboard`: como no hay usuarios, aparece “Configuración inicial” para crear el administrador.

Después, en **Configuración → Primeros pasos**:

| Paso | Dónde |
|---|---|
| Perfil público (nombre, foto, descripción, aviso de privacidad) | Configuración → Perfil |
| Localidades (estado + municipios/parroquias) | Configuración → Localidades |
| Clave de IA (Gemini) | Configuración → Integraciones |
| Contenido para el asistente | Base de conocimiento |
| Coordinadores y sus localidades | Configuración → Equipo |
| Correo saliente (opcional, para avisos) | Configuración → Integraciones |

## Servidor propio (recomendado para estos datos)

`docker compose up -d --build` con `.env` a partir de `.env.server.example`. PostgreSQL queda en una red interna sin puerto publicado y Caddy sirve HTTPS. Conviene un proveedor y una jurisdicción fuera de Venezuela, y `scripts/backup-db.sh` con los respaldos cifrados en otro lugar.

## Pendiente para la versión 2 (protección de datos)

Esta versión es el MVP. Lo previsto para endurecerla:
- teléfono cifrado a nivel de campo y visible solo para el coordinador asignado;
- borrar teléfono y resumen al marcar el contacto como contactado;
- separar conversaciones de contactos (sin vínculo directo) y limpiar datos personales antes de guardar;
- segundo factor (passkey o app autenticadora) para administradores;
- registro de auditoría de consultas y bloqueo de exportaciones masivas.
