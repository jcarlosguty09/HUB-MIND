// HUB MIND Finance v2. Server-side RLS and RPC enforce permissions.
const FinanceUI = {
  money(n) { return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n)||0); },
  esc(v) { return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  async all(path) {
    const out=[];
    for(let offset=0;offset<100000;offset+=500){
      const rows=await sbReq('GET',path+(path.includes('?')?'&':'?')+'limit=500&offset='+offset);
      if(!Array.isArray(rows))throw Error('Respuesta financiera inesperada');
      out.push(...rows);if(rows.length<500)return out;
    }
    throw Error('Se alcanzó el límite de consulta; contacta soporte');
  },
  async org() {
    const user=Auth.getUser();
    if(!user?.id)throw Error('Sesión no disponible');
    const rows=await sbReq('GET','organization_members?select=organization_id&user_id=eq.'+encodeURIComponent(user.id)+'&role=eq.master_admin&is_active=eq.true');
    if(rows.length!==1)throw Error('Se requiere exactamente una organización con rol ADMIN MAESTRO');
    return rows[0].organization_id;
  },
  async refresh() {
    this.organizationId=await this.org();
    const id=encodeURIComponent(this.organizationId);
    [this.tx,this.cats]=await Promise.all([
      this.all('finance_transactions?select=*&organization_id=eq.'+id+'&order=occurred_on.desc,created_at.desc'),
      this.all('finance_categories?select=*&organization_id=eq.'+id+'&order=name.asc')
    ]);
  },
  async render() {
    const root=document.getElementById('finance-root');
    if(!root)return;
    if(state.role!=='master_admin'){root.textContent='Acceso restringido';return;}
    root.textContent='Cargando finanzas...';
    try{await this.refresh();this.draw();}
    catch(e){root.textContent='Error al consultar Finanzas: '+e.message;}
  },
  draw() {
    const root=document.getElementById('finance-root');
    const current=new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
    const month=current.slice(0,7);
    const chosen=document.getElementById('fin-month')?.value??month;
    const kind=document.getElementById('fin-kind')?.value??'all';
    const status=document.getElementById('fin-status')?.value??'all';
    const filtered=this.tx.filter(t=>(!chosen||t.occurred_on.startsWith(chosen))&&(kind==='all'||t.kind===kind)&&(status==='all'||t.status===status));
    const posted=filtered.filter(t=>t.status==='posted');
    const income=posted.filter(t=>t.kind==='income').reduce((s,t)=>s+Number(t.amount),0);
    const expense=posted.filter(t=>t.kind==='expense').reduce((s,t)=>s+Number(t.amount),0);
    const categoryName=Object.fromEntries(this.cats.map(c=>[c.id,c.name]));
    const options=(arr)=>arr.map(x=>'<option value="'+this.esc(x.id)+'">'+this.esc(x.name)+' ('+(x.kind==='income'?'Ingreso':'Gasto')+')</option>').join('');
    root.innerHTML='<div class="fin-grid">'+
      '<article><small>Ingresos confirmados</small><strong>'+this.money(income)+'</strong></article>'+
      '<article><small>Gastos confirmados</small><strong>'+this.money(expense)+'</strong></article>'+
      '<article><small>Resultado operativo de caja</small><strong>'+this.money(income-expense)+'</strong></article></div>'+
      '<p class="fin-note">Solo movimientos confirmados dentro del filtro. No equivale a utilidad neta; no incluye montos históricos de membresías.</p>'+
      '<div class="fin-toolbar"><h3>Movimientos</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn-secondary" id="fin-export">Exportar CSV</button><button type="button" class="btn-secondary" id="fin-refresh">Actualizar</button></div></div>'+
      '<div class="fin-toolbar" style="justify-content:flex-start;flex-wrap:wrap"><label>Mes <input id="fin-month" type="month" class="field-input" value="'+this.esc(chosen)+'"></label>'+
      '<label>Tipo <select id="fin-kind" class="field-input"><option value="all">Todos</option><option value="income">Ingresos</option><option value="expense">Gastos</option></select></label>'+
      '<label>Estado <select id="fin-status" class="field-input"><option value="all">Todos</option><option value="draft">Borradores</option><option value="posted">Confirmados</option><option value="void">Anulados</option></select></label></div>'+
      '<div class="fin-scroll"><table class="fin-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th>Estado</th><th>Importe</th><th>Acción</th></tr></thead><tbody>'+
      (filtered.length?filtered.map(t=>'<tr><td>'+this.esc(t.occurred_on)+'</td><td>'+(t.kind==='income'?'Ingreso':'Gasto')+'</td><td>'+this.esc(categoryName[t.category_id]||'—')+'</td><td>'+this.esc(t.description||t.reference||'—')+'</td><td>'+this.esc(t.status)+'</td><td>'+this.money(t.amount)+'</td><td>'+(t.status==='draft'?'<button class="btn-secondary" data-fin-action="post" data-fin-id="'+this.esc(t.id)+'">Confirmar</button> ':'')+(t.status!=='void'?'<button class="btn-secondary" data-fin-action="void" data-fin-id="'+this.esc(t.id)+'">Anular</button>':'')+'</td></tr>').join(''):'<tr><td colspan="7">Sin movimientos para estos filtros.</td></tr>')+'</tbody></table></div>'+
      '<div class="fin-toolbar"><h3>Registrar ingreso o gasto</h3></div>'+
      '<form id="fin-new" class="fin-form"><label>Tipo<select class="field-input" name="kind" required><option value="income">Ingreso</option><option value="expense">Gasto</option></select></label>'+
      '<label>Categoría<select class="field-input" name="category_id" required>'+options(this.cats.filter(c=>c.is_active!==false&&c.kind==='income'))+'</select></label>'+
      '<label>Fecha<input class="field-input" type="date" name="occurred_on" value="'+current+'" required></label>'+
      '<label>Importe MXN<input class="field-input" type="number" name="amount" min="0.01" step="0.01" required></label>'+
      '<label>Método<select class="field-input" name="payment_method"><option value="">Sin especificar</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select></label>'+
      '<label>Concepto<input class="field-input" name="description" maxlength="500" required></label>'+
      '<label>Referencia<input class="field-input" name="reference" maxlength="200"></label>'+
      '<button class="save-btn" type="submit">Guardar borrador</button></form>'+
      '<div class="fin-toolbar"><h3>Categorías</h3></div>'+
      '<form id="fin-category" class="fin-form"><label>Nombre<input class="field-input" name="name" maxlength="100" required></label>'+
      '<label>Tipo<select class="field-input" name="kind"><option value="income">Ingreso</option><option value="expense">Gasto</option></select></label>'+
      '<button class="btn-secondary" type="submit">Crear categoría</button></form>'+
      '<p class="fin-note">Para confirmar o anular, la RPC finance_transition_transaction debe estar instalada y validada en Supabase. Los importes de membresías NO se importan automáticamente.</p>';
    document.getElementById('fin-kind').value=kind;
    document.getElementById('fin-status').value=status;
    ['fin-month','fin-kind','fin-status'].forEach(id=>document.getElementById(id).onchange=()=>this.draw());
    document.getElementById('fin-refresh').onclick=()=>this.render();
    document.getElementById('fin-export').onclick=()=>this.exportCsv(filtered,categoryName);
    const form=document.getElementById('fin-new');
    form.elements.kind.onchange=()=>{
      const k=form.elements.kind.value;
      form.elements.category_id.innerHTML=options(this.cats.filter(c=>c.is_active!==false&&c.kind===k));
    };
    form.onsubmit=e=>this.submit(e,form,'transaction');
    const categoryForm=document.getElementById('fin-category');
    categoryForm.onsubmit=e=>this.submit(e,categoryForm,'category');
    root.querySelectorAll('[data-fin-action]').forEach(btn=>btn.onclick=()=>this.transition(btn.dataset.finId,btn.dataset.finAction));
  },
  async submit(event,form,type) {
    event.preventDefault();
    if(state.role!=='master_admin')return;
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try {
      const data=Object.fromEntries(new FormData(form));
      if(type==='category'){
        data.name=String(data.name||'').trim();
        if(!data.name)throw Error('Nombre obligatorio');
        await sbReq('POST','finance_categories',{organization_id:this.organizationId,...data});
      }else{
        if(!this.cats.some(c=>c.id===data.category_id&&c.kind===data.kind))throw Error('La categoría no corresponde al tipo');
        if(!Number.isFinite(Number(data.amount))||Number(data.amount)<=0)throw Error('Importe inválido');
        await sbReq('POST','finance_transactions',{organization_id:this.organizationId,created_by:Auth.getUser().id,kind:data.kind,category_id:data.category_id,occurred_on:data.occurred_on,amount:Number(data.amount),payment_method:data.payment_method||null,description:data.description,reference:data.reference||null,status:'draft',source:'manual'});
      }
      await this.render();
      showToast(type==='category'?'Categoría creada':'Borrador registrado');
    }catch(err){alert('No se pudo guardar: '+err.message);}
    finally{button.disabled=false;}
  },
  async transition(id,action) {
    if(state.role!=='master_admin')return;
    const reason=action==='void'?prompt('Motivo de anulación (obligatorio):'):null;
    if(action==='void'&&!reason?.trim())return;
    if(!confirm(action==='post'?'¿Confirmar este movimiento?':'¿Anular este movimiento?'))return;
    try {
      await sbReq('POST','rpc/finance_transition_transaction',{p_transaction_id:id,p_action:action,p_reason:reason});
      await this.render();showToast(action==='post'?'Movimiento confirmado':'Movimiento anulado');
    }catch(err){alert('No se pudo completar la operación. Verifica que la RPC esté instalada y autorizada: '+err.message);}
  },
  exportCsv(rows,categories) {
    const columns=['Fecha','Tipo','Categoría','Concepto','Estado','Importe MXN','Método','Referencia','ID'];
    const data=rows.map(t=>[t.occurred_on,t.kind,categories[t.category_id]||'',t.description||'',t.status,t.amount,t.payment_method||'',t.reference||'',t.id]);
    const safe=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const csv='\uFEFF'+[columns,...data].map(row=>row.map(safe).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='HUB_MIND_finanzas.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
};
