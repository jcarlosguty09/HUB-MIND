# Conciliación APP-prioritaria: fase 1

## Propósito
Preparar la importación administrativa de HUB MIND **sin cambiar datos productivos** hasta validar identidades y membresías. Este PR contiene auditoría SQL de solo lectura y el contrato de importación.

## Fuente de verdad
- **APP**: `organization_members.user_id`, `auth.users.email`, rol, estado y membresías actuales.
- **Excel**: nombre alternativo, datos administrativos históricos y decisiones humanas. No puede sobrescribir correo APP.
- `SEPARAR`: prohibido vincular la pareja rechazada.
- `VINCULAR`: requiere `user_id` existente y comprobación de que no está asignado a otra identidad distinta.
- `CREAR`: nunca crear automáticamente desde nombres. Requiere correo válido, ausencia de cuenta existente y aprobación.
- `INVESTIGAR` / pendientes: no se ejecutan.
- Un registro Excel duplicado puede referirse a una sola persona APP, sin generar un segundo usuario.

## Excepciones confirmadas
- Jorge Loredo: buscar y conservar la cuenta cuyo correo APP real es `jiloredo@outlook.com` y rol coach.
- Viridiana Corona: **12 clases al mes**, no 12 por semana. Comprobar catálogo antes de modificar créditos; no cambiar membresía automáticamente.
- Alan Tapia: candidato APP Alan Israel Tapia Coria. Conservar correo APP.
- Mari Arcila y otras personas que existen solo en APP: nunca eliminarlas por ausencia en Excel.

## Ejecución
1. Ejecutar `supabase/audits/20261022_member_reconciliation_readonly.sql` en SQL Editor.
2. Revisar especialmente las cuentas especiales, los planes y las membresías activas duplicadas.
3. Generar una **vista previa transaccional** a partir del Excel aprobado; no ejecutar importación todavía.
4. Solo después, preparar PR separado con migración idempotente y rollback, y confirmar altas por lotes.

## No hace este PR
No cambia tablas, permisos, datos de producción, contraseñas, correos ni créditos.
No contiene información personal del Excel administrativo.
