# HUB MIND — Finanzas integrales / fase 1

## Alcance aprobado
Registrar ingresos, gastos y resultados por periodo desde la app; vincular cobros a miembros/membresías cuando corresponda, sin duplicar cobros históricos.

## Arquitectura
- `finance_categories`: catálogo de categorías por organización y tipo.
- `finance_transactions`: movimientos individuales con fecha efectiva, método, estado, responsable y referencias.
- Estados: `draft` (borrador), `posted` (confirmado), `void` (anulado). No borrar cobros contabilizados.
- `external_key`: clave idempotente de integración/importación para impedir duplicados.
- `amount_paid` en `member_memberships` **no es** una transacción y no debe convertirse en ingreso automáticamente.

## Etapas
1. Revisar el esquema real, RLS y roles de `organization_members`; validar referencias de tablas existentes.
2. Crear esquema con políticas seguras y pruebas de aislamiento multi-organización.
3. Desarrollar pantalla Finanzas: ingresos, gastos, categorías, pagos pendientes, anulaciones y filtros.
4. Desarrollar reportes CSV/Excel: ingresos, egresos, flujo de caja, desglose por método y categoría.
5. Integrar renovaciones con registro de cobro opcional, transaccional e idempotente.
6. Conciliar históricos contra recibos/transferencias, sin sumar montos antiguos como cobros.

## Definición honesta de métricas
- **Ingresos cobrados**: transacciones de ingreso confirmadas.
- **Gastos pagados**: transacciones de egreso confirmadas.
- **Resultado operativo de caja**: diferencia anterior.
- **Utilidad neta**: solo cuando existan reglas de devengo, impuestos, depreciación y ajustes contables.
- **Adeudos**: requieren una cuenta por cobrar separada, no se deducen de `amount_paid`.

## Seguridad
No exponer finanzas a atletas ni coaches. El rol `master_admin` debe verificarse del lado de Supabase, nunca confiar solo en `state.role`. RLS sin políticas permite denegación por defecto. Antes de activar accesos, implementar RPC de escritura con comprobación de pertenencia/rol y pruebas de roles.

## Estado
La migración es un borrador para revisión, **no se ha ejecutado en Supabase**. No hay todavía interfaz de finanzas ni reportes de ingresos reales.
