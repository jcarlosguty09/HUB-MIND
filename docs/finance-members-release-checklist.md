# Finanzas + Miembros — entrega integral

## Incluido
- Exportación XLSX nativa (sin CDN): hojas Miembros, Historial, Planes, Notas.
- Consultas paginadas de 500 en 500 para evitar el límite de 1,000 registros.
- No se sobrescriben membresías; el importe histórico registrado NO se trata como cobro confirmado.
- Finanzas: categorías, borradores, filtros, confirmación/anulación mediante RPC, CSV, indicadores.
- Finanzas visible exclusivamente para master_admin; Supabase RLS es la barrera real.

## Despliegue
1. Revisar PR y probar preview de Vercel. Probar Excel con Excel/LibreOffice, verificar conteos y todas las hojas.
2. Confirmar que la propuesta `supabase/proposals/finance_transition_rpc_NOT_EXECUTED.sql` de PR #28 **NO está ejecutada automáticamente por merge**.
3. Revisar esa RPC (SECURITY DEFINER, owner, permisos, roles, concurrencia) en staging antes de ejecutarla en producción. Sin ella, los botones Confirmar/Anular darán error controlado.
4. Verificar pruebas de roles con cuentas reales: master_admin, admin, coach, sales, atleta. Admin no puede leer finanzas. Exportación Miembros permitida para master_admin/admin.
5. Verificar que el Excel no se trunca y que no se descargan datos de otras organizaciones.

## Alcance pendiente
- Vinculación de transacciones con membresías y conciliación de cobros reales.
- Comprobantes adjuntos y conciliación bancaria.
- Reportes de utilidad contable (dashboard actual = resultado operativo de caja).
- Auditoría de permisos de la vista members_admin y membership_credit_ledger.
