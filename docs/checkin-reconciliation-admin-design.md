# HUB MIND — Módulo de conciliación de asistencias (propuesta de implementación)

## Situación validada (25-oct-2026)
- `checkins`: 2,892 filas, 2,777 vinculadas, 115 sin `user_id`.
- Pendientes: 75 manuales (`is_manual = true`, `manual_name` presente) y 40 biométricas (8 PIN ZK distintos).
- 80 conciliaciones históricas verificadas: 59 ZK y 21 manuales; respaldos y cero conflictos reportados.
- ZK 84 → Genaro Velasco Herrera es **candidato**, no validado históricamente frente a posible reutilización de PIN.
- 39 registros de 7 PIN ZK carecen de asociación en `zk_user_map` y `members_admin`.
- Ale Martínez: posible doble asistencia a 15m36s; **excluir de auto-conciliación**.
- Excel histórico es exportación, nunca fuente de verdad. Ver `docs/reconciliation-source-of-truth.md`.

## Contrato funcional
1. Vista de administrador: pestañas **Pendientes**, **Resueltas**, **Visitantes**, **Posibles duplicados**; filtros por fecha, origen y organización.
2. Cada fila muestra fecha local, nombre manual o PIN ZK, dispositivo, evidencia disponible, candidato(s) y número de coincidencias. Los candidatos son sugerencias, nunca decisiones automáticas.
3. Acciones explícitas y auditadas: **Vincular a perfil**, **Marcar como visitante**, **Marcar como prueba**, **Posponer**, **Revertir conciliación** (solo con revisión). No eliminar el check-in.
4. Al crear check-in manual, exigir selección de perfil existente **o** identidad de visitante (nombre obligatorio). El campo libre de nombre no sustituye `user_id` de un miembro.
5. PIN ZK sin asociación queda en cola de revisión; la integración no debe adivinar usuario por similitud de nombre. Para vincular PIN, verificar dispositivo, organización, titularidad y vigencia temporal (PIN potencialmente reutilizado).
6. No modificar automáticamente saldos, plan, rol, email, fecha, `assigned_class_id` ni `zk_user_id` durante la conciliación.

## Esquema propuesto — NO ejecutar sin inspección de políticas y esquema actual
- `checkin_reconciliation_decisions`: `id uuid PK`, `checkin_id uuid FK`, `organization_id uuid`, `decision text` (link_member, visitor, test, defer, undo), `target_user_id uuid nullable`, `reason text`, `evidence jsonb`, `previous_user_id uuid nullable`, `actor_user_id uuid`, `created_at timestamptz`, `reversed_decision_id uuid nullable`.
- Considerar `checkin_identity_status` o una vista derivada para distinguir visitante/prueba/pendiente; **no** inferir visitante simplemente de `user_id IS NULL`.
- RLS: solo administradores de la organización pueden leer/decidir; denegar acceso cruzado. No confiar en `organization_id` enviado por el cliente; resolverlo en servidor.
- RPC `resolve_checkin_identity(checkin_id, decision, target_user_id, reason)`: `SECURITY DEFINER` con `search_path` explícito y permisos mínimos, o endpoint de servidor autenticado con transacción. Validar rol, organización, registro actual, decisión y pertenencia del perfil.
- En la misma transacción: bloquear `checkins` con `FOR UPDATE`, revisar posibles duplicados, insertar auditoría inmutable, actualizar `user_id` **solo** para link_member. Visitante y prueba permanecen sin usuario pero dejan de contar como pendientes.
- Reversión: nueva decisión de auditoría y restauración solo si el estado actual coincide con el esperado; nunca borrar historial.

## Reglas de seguridad y pruebas
- Coincidencia exacta o parcial NO autoriza auto-vinculación.
- Posible duplicado por mismo usuario/organización y ventana de tiempo configurable requiere revisión humana. No asumir que ±12h demuestra duplicación.
- Si el check-in ya fue resuelto por otro administrador, abortar y recargar.
- RPC idempotente frente a reintentos; no crear débitos retroactivos de créditos.
- Verificar triggers de `checkins` antes de desplegar: `trg_process_membership_checkin` opera AFTER INSERT; `trg_audit_checkin_class_assignment` opera BEFORE UPDATE. Confirmar en entorno actual y con pruebas.
- Pruebas: usuario ajeno a organización, usuario sin rol, dos administradores concurrentes, PIN reutilizado, visitante, prueba, duplicado, reversión, repetición de solicitud, ausencia de perfil, exportación.
- Auditoría y backup existentes deben preservarse: `checkin_reconciliation_backup` y `manual_checkin_reconciliation_backup`.

## Plan de entrega
**Fase 1:** inspeccionar rutas/componentes reales de app, políticas RLS, tipos de `checkins`, controles de rol y esquema de membresías. Diseñar migración compatible, sin aplicarla a producción.

**Fase 2:** migración auditada + RPC + pruebas SQL; desplegar primero en staging.

**Fase 3:** UI de cola de conciliación y formulario de check-in manual con selector de perfil/visitante.

**Fase 4:** validación de conteos: 115 pendientes iniciales se dividen en vinculados, visitantes, pruebas y pendientes genuinos; nunca se borran para mejorar el KPI.

## SQL de diagnóstico (solo lectura)
```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS vinculadas,
  COUNT(*) FILTER (WHERE user_id IS NULL AND is_manual IS TRUE) AS manuales_sin_usuario,
  COUNT(*) FILTER (WHERE user_id IS NULL AND zk_user_id IS NOT NULL) AS biometricas_sin_usuario
FROM public.checkins;
```

**Estado:** especificación y propuesta; no es una implementación desplegada. No se ha alterado Supabase desde este documento.
