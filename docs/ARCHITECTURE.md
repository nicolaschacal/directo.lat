# Arquitectura

```
Persona ──► Chat web (link) ──► /api/chat ──► Gemini (solo con la base de conocimiento)
                │
                ├─► /api/chat/session  (historial y localidad elegida)
                └─► /api/lead/contact  (nombre, teléfono, localidad, consentimiento)
                                              │
                                              ▼
                                        PostgreSQL
                                              ▲
Administrador / Coordinador ──► /dashboard ──► /api/crm/*  (filtrado por rol y localidad)
```

## Modelo de datos

- `managers`: usuarios del panel (`admin` | `coordinator`).
- `zones`: localidades (estado + nombre) que se eligen en el chat.
- `manager_zones`: qué localidades atiende cada coordinador.
- `leads`: contactos (nombre, teléfono, estado, localidad, estado del seguimiento, resumen IA).
- `conversation_sessions` / `conversation_messages`: conversaciones, con la localidad elegida.
- `followups`: pendientes y recordatorios.
- `activities`: historial de cada contacto.
- `email_jobs`: cola de correos con reintentos.
- `knowledge_categories` / `knowledge_items`: base de conocimiento.
- `crm_settings`: perfil, captación, retención e integraciones.

## Visibilidad

`lib/auth.js` → `requireManager` lee el usuario y sus localidades de la base en cada pedido; `leadScope` y `canSeeLead` aplican el filtro. Las vistas `inquiries`, `territory`, `settings`, `capture`, `integrations` y la gestión de equipo y localidades son solo de administrador.

## Tareas periódicas

`lib/reminders.js` (cada hora en servidor propio; cron diario en Vercel):
- recordatorio a cada coordinador con los pendientes de sus localidades;
- reintento de correos;
- `lib/retention.js`: borrado de conversaciones vencidas y visitas vacías.
