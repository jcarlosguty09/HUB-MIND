# Revisión de triggers existentes — 2026-10-22

Las funciones `protect_master_admin_role`, `protect_organization_member_changes` y `protect_organization_member_status` restringen promociones, cambios de roles y cambios de estado del personal. `is_org_master_admin(org_id)` es SECURITY DEFINER y verifica pertenencia activa con rol `master_admin`.

## Decisión
Finanzas será **exclusivo de master_admin** para consulta, registro, edición, exportación y reportes. No ampliar permisos a `admin`.

## Riesgos pendientes
- La función `protect_master_admin_role` contiene bypass explícito para `session_user = 'postgres'` y `service_role`, habitual para mantenimiento. Revisar que ningún cliente reciba credenciales privilegiadas.
- `protect_organization_member_changes` usa `current_user IN ('postgres','service_role')`; revisar la identidad efectiva del propietario de funciones SECURITY DEFINER y probar comportamiento real de triggers. La segunda función es la protección más relevante para cambios de roles.
- Revisar `DELETE` en `organization_members`, funciones RPC privilegiadas y permisos GRANT más amplios.
- El SQL propuesto de finanzas no se ha ejecutado. No ejecutar la migración base sin validar claves foráneas y pruebas de roles.
- Movimientos financieros confirmados deben ser inmutables salvo RPC controlada con historial.
