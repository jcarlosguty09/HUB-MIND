# Finanzas v1 — migración propuesta

Esta migración crea tablas nuevas sin tocar `member_memberships`, `organization_members` ni datos existentes.

## Seguridad
- RLS restringido por `public.is_org_master_admin(organization_id)`.
- `authenticated` solo puede consultar/crear borradores de movimientos; no puede confirmar, anular ni eliminar por REST.
- Confirmación/anulación requiere RPC auditada en siguiente fase.
- No sumar `member_memberships.amount_paid` como ingreso cobrado.
- Categorías no pueden cambiar de tipo mientras estén referenciadas, gracias a FK compuesta.
- Una membresía vinculada debe pertenecer a la misma organización y usuario, si se especifica.

## Antes de ejecutar
1. Confirmar que no existen tablas `finance_categories` y `finance_transactions`.
2. Respaldar esquema; probar primero en entorno de staging.
3. Confirmar existencia y permisos de `is_org_master_admin(uuid)`.
4. Revisar que `public.member_memberships.user_id` refiere al mismo usuario que `auth.users.id`.
5. Revisar permisos de funciones SECURITY DEFINER y pruebas de API con rol admin/coach/atleta.
6. No ejecutar la propuesta previa del PR #24 ni la propuesta RLS del PR #26: esta migración las sustituye.

## Próxima fase
RPC transaccionales para registrar/publicar/anular movimientos, auditoría, UI Finanzas, exportaciones y pruebas end-to-end. Hasta entonces no hay flujo de cobros listo.
