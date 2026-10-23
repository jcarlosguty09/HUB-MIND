// Finanzas v1 — solo ADMIN MAESTRO. La autorización real está en Supabase RLS.
const FinanceUI = {
  async render() {
    const root = document.getElementById('finance-root');
    if (!root) return;
    if (state.role !== 'master_admin') {
      root.textContent = 'Acceso restringido.';
      return;
    }
    root.innerHTML = '<p>Consultando movimientos financieros...</p>';
    try {
      const [tx, cats] = await Promise.all([
        sbReq('GET','finance_transactions?select=id,organization_id,kind,status,occurred_on,amount,payment_method,description,reference,category_id&order=occurred_on.desc,created_at.desc&limit=1000'),
        sbReq('GET','finance_categories?select=id,name,kind&order=name.asc')
      ]);
      const posted = tx.filter(t=>t.status==='posted');
      const income = posted.filter(t=>t.kind==='income').reduce((s,t)=>s+Number(t.amount),0);
      const expense = posted.filter(t=>t.kind==='expense').reduce((s,t)=>s+Number(t.amount),0);
      const money = n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(n);
      const esc = x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const catMap = Object.fromEntries(cats.map(c=>[c.id,c.name]));
      root.innerHTML = `
        <div class="fin-grid">
          <article><small>Ingresos confirmados</small><strong>${money(income)}</strong></article>
          <article><small>Gastos confirmados</small><strong>${money(expense)}</strong></article>
          <article><small>Resultado operativo de caja</small><strong>${money(income-expense)}</strong></article>
        </div>
        <p class="fin-note">Solo movimientos confirmados. No incluye importes históricos de membresías. No equivale a utilidad neta.</p>
        <div class="fin-toolbar"><h3>Movimientos</h3><button type="button" id="fin-refresh" class="btn-secondary">Actualizar</button></div>
        <div class="fin-scroll"><table class="fin-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th>Estado</th><th>Importe</th></tr></thead>
        <tbody>${tx.length?tx.map(t=>`<tr><td>${esc(t.occurred_on)}</td><td>${t.kind==='income'?'Ingreso':'Gasto'}</td><td>${esc(catMap[t.category_id]||'Sin categoría')}</td><td>${esc(t.description)}</td><td>${esc(t.status)}</td><td>${money(Number(t.amount))}</td></tr>`).join(''):'<tr><td colspan="6">Aún no hay movimientos financieros registrados.</td></tr>'}</tbody></table></div>
        <p class="fin-note">Registro, confirmación y anulación se habilitarán tras validar las operaciones seguras de Supabase.</p>`;
      document.getElementById('fin-refresh')?.addEventListener('click',()=>this.render());
    } catch (e) {
      root.textContent = 'No se pudieron consultar las finanzas: '+e.message;
    }
  }
};
