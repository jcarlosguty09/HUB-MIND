/* HUB MIND - Exportaciones administrativas, lectura exclusiva.
 * Usa las mismas API y permisos de la app. No altera membresías ni cobros.
 */
(() => {
  'use strict';
  const csvCell = value => {
    let s = String(value ?? '');
    // Impide que Excel ejecute fórmulas contenidas en datos de usuarios.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const saveCSV = (filename, headers, rows) => {
    const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const panel = () => {
    const host = document.querySelector('#view-reports .checkins-header');
    if (!host || document.getElementById('hm-report-exports')) return;
    const div = document.createElement('div');
    div.id = 'hm-report-exports';
    div.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 8px;';
    div.innerHTML = `
      <button type="button" class="secondary-btn" data-export="attendance"><i class="ti ti-download"></i> Asistencias CSV</button>
      <button type="button" class="secondary-btn" data-export="memberships"><i class="ti ti-download"></i> Membresías CSV</button>
      <button type="button" class="secondary-btn" data-export="finance"><i class="ti ti-download"></i> Montos registrados CSV</button>
      <small style="flex-basis:100%;color:var(--text3)">Asistencias: periodo seleccionado. Membresías y montos: corte actual. Los montos registrados NO son un reporte de ingresos cobrados ni una contabilidad conciliada.</small>
    `;
    host.appendChild(div);
    div.addEventListener('click', async event => {
      const button = event.target.closest('button[data-export]');
      if (!button) return;
      if (typeof state === 'undefined' || !['master_admin','admin'].includes(state.role)) {
        alert('Solo administradores pueden exportar reportes.'); return;
      }
      const start = document.getElementById('reports-start')?.value;
      const end = document.getElementById('reports-end')?.value;
      if (!start || !end || start > end) { alert('Selecciona un rango válido.'); return; }
      button.disabled = true;
      const label = button.innerHTML;
      button.textContent = 'Preparando CSV...';
      try {
        const kind = button.dataset.export;
        if (kind === 'attendance') {
          // Paginación explícita: no truncar reportes de más de 5000 filas.
          const records = [];
          const from = start + 'T00:00:00-06:00';
          const untilDate = new Date(end + 'T12:00:00Z');
          untilDate.setUTCDate(untilDate.getUTCDate() + 1);
          const until = untilDate.toISOString().slice(0,10) + 'T00:00:00-06:00';
          for (let offset = 0; ; offset += 1000) {
            const rows = await sbReq('GET',
              'checkins?select=id,timestamp,user_id,assigned_class_id,is_manual' +
              '&timestamp=gte.' + encodeURIComponent(from) +
              '&timestamp=lt.' + encodeURIComponent(until) +
              '&order=timestamp.asc,id.asc&limit=1000&offset=' + offset);
            records.push(...(rows || []));
            if (!rows || rows.length < 1000) break;
          }
          const members = await MemberAPI.list();
          const names = Object.fromEntries(members.map(m => [m.id, m.full_name || m.email || '']));
          saveCSV('hubmind_asistencias_' + start + '_' + end + '.csv',
            ['checkin_id','fecha_hora','user_id','miembro','clase_id','manual'],
            records.map(c => [c.id,c.timestamp,c.user_id,names[c.user_id] || '',c.assigned_class_id,c.is_manual]));
        } else {
          const [members, plans, memberships] = await Promise.all([
            MemberAPI.list(), MembershipEngineAPI.listPlans(), MembershipEngineAPI.listMemberships()
          ]);
          const names = Object.fromEntries(members.map(m => [m.id,m]));
          const planMap = Object.fromEntries(plans.map(p => [p.id,p]));
          if (kind === 'memberships') {
            saveCSV('hubmind_membresias_corte_' + end + '.csv',
              ['membership_id','user_id','miembro','correo','plan','canal','inicio','vencimiento','estado','saldo_clases','monto_registrado'],
              memberships.map(m => [m.id,m.user_id,names[m.user_id]?.full_name,
                names[m.user_id]?.email,planMap[m.plan_id]?.name,m.channel,m.starts_at,
                m.expires_at,m.status,m.credit_balance,m.amount_paid]));
          } else {
            saveCSV('hubmind_montos_registrados_NO_CONCILIADOS_' + end + '.csv',
              ['membership_id','user_id','miembro','plan','canal','inicio','monto_registrado','advertencia'],
              memberships.map(m => [m.id,m.user_id,names[m.user_id]?.full_name,
                planMap[m.plan_id]?.name,m.channel,m.starts_at,m.amount_paid,
                'NO confirma pago recibido; puede incluir histórico, cancelaciones o importaciones']));
          }
        }
      } catch (err) {
        console.error('Report export:',err);
        alert('No se pudo exportar: ' + (err.message || err));
      } finally { button.disabled = false; button.innerHTML = label; }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',panel);
  else panel();
})();
