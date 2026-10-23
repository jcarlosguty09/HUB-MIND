// Native XLSX exporter: ZIP (stored) + SpreadsheetML, no CDN dependency.
const MembershipExcel = {
  xml(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); },
  crc(bytes) {
    let c = -1;
    for (const b of bytes) { c ^= b; for(let j=0;j<8;j++) c=(c>>>1)^((c&1)?0xedb88320:0); }
    return (c^-1)>>>0;
  },
  zip(files) {
    const enc = new TextEncoder(), local=[], central=[];
    let offset=0;
    const u16=n=>[n&255,(n>>>8)&255],u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
    for (const [name,data] of files) {
      const nb=enc.encode(name), db=enc.encode(data), crc=this.crc(db);
      const header=new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(db.length),...u32(db.length),...u16(nb.length),0,0]);
      local.push(header,nb,db);
      central.push(new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,...u32(crc),...u32(db.length),...u32(db.length),...u16(nb.length),0,0,0,0,0,0,0,0,0,0,...u32(offset)]),nb);
      offset+=header.length+nb.length+db.length;
    }
    const centralSize=central.reduce((n,x)=>n+x.length,0);
    const end=new Uint8Array([80,75,5,6,0,0,0,0,...u16(files.length),...u16(files.length),...u32(centralSize),...u32(offset),0,0]);
    return new Blob([...local,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  },
  sheet(rows) {
    const col=i=>{let x=i+1,s='';while(x){x--;s=String.fromCharCode(65+x%26)+s;x=Math.floor(x/26)}return s};
    const body=rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{
      const cell=col(ci)+(ri+1);
      if (typeof v==='number' && Number.isFinite(v)) return '<c r="'+cell+'"><v>'+v+'</v></c>';
      return '<c r="'+cell+'" t="inlineStr"><is><t>'+this.xml(v)+'</t></is></c>';
    }).join('')+'</row>').join('');
    const filter=rows.length?'<autoFilter ref="A1:'+col(rows[0].length-1)+rows.length+'"/>':'';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'+body+'</sheetData>'+filter+'</worksheet>';
  },
  workbook(sheets) {
    const files=[
      ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],
      ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+this.xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'</Relationships>']
    ];
    sheets.forEach((s,i)=>files.push(['xl/worksheets/sheet'+(i+1)+'.xml',this.sheet(s.rows)]));
    return this.zip(files);
  },
  async all(path) {
    const all=[];
    for(let offset=0;offset<100000;offset+=500) {
      const separator=path.includes('?')?'&':'?';
      const batch=await sbReq('GET',path+separator+'limit=500&offset='+offset);
      if(!Array.isArray(batch))throw new Error('Respuesta inesperada de Supabase');
      all.push(...batch);
      if(batch.length<500)return all;
    }
    throw new Error('La exportación supera el límite de seguridad de 100,000 registros');
  },
  async download() {
    if (!['master_admin','admin'].includes(state.role)) throw new Error('Acceso no autorizado');
    const [members,memberships,plans,ledger]=await Promise.all([
      this.all('members_admin?select=*&order=full_name.asc'),
      this.all('member_memberships?select=*&order=created_at.desc'),
      this.all('membership_plans?select=*&order=name.asc'),
      this.all('membership_credit_ledger?select=membership_id,quantity')
    ]);
    const memberMap=new Map(members.map(m=>[m.id,m]));
    const planMap=new Map(plans.map(p=>[p.id,p]));
    const balance=new Map();
    ledger.forEach(x=>balance.set(x.membership_id,(balance.get(x.membership_id)||0)+Number(x.quantity||0)));
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
    const byUser=new Map();
    memberships.forEach(m=>{if(!byUser.has(m.user_id))byUser.set(m.user_id,[]);byUser.get(m.user_id).push(m)});
    const primary=rows=>[...rows].sort((a,b)=>(b.status==='active')-(a.status==='active')||String(b.expires_at||'').localeCompare(String(a.expires_at||'')))[0];
    const effective=m=>!m?'Sin membresía':(m.expires_at&&m.expires_at<today?'Vencida':m.status);
    const summary=[['Usuario ID','Nombre','Email','Rol','Plan actual','Canal','Inicio','Vencimiento','Estado efectivo','Estado registrado','Créditos restantes','Importe registrado MXN (NO conciliado)','Membresías históricas']];
    members.forEach(u=>{
      const rows=byUser.get(u.id)||[],m=rows.length?primary(rows):null,p=planMap.get(m?.plan_id);
      summary.push([u.id,u.full_name||'',u.email||'',u.role||'',p?.name||'',m?.channel||u.membership_channel||'',m?.starts_at||'',m?.expires_at||'',effective(m),m?.status||'',m?balance.get(m.id)||0:'',m?.amount_paid===null||m?.amount_paid===undefined?'':Number(m.amount_paid),rows.length]);
    });
    const hist=[['Membresía ID','Usuario ID','Nombre','Email','Plan','Plan ID','Canal','Inicio','Vencimiento','Estado registrado','Estado efectivo','Créditos restantes','Importe registrado MXN (NO conciliado)','Fuente','Fecha de registro']];
    memberships.forEach(m=>{
      const u=memberMap.get(m.user_id)||{},p=planMap.get(m.plan_id)||{};
      hist.push([m.id,m.user_id,u.full_name||'',u.email||'',p.name||'',m.plan_id||'',m.channel||'',m.starts_at||'',m.expires_at||'',m.status||'',effective(m),balance.get(m.id)||0,m.amount_paid===null||m.amount_paid===undefined?'':Number(m.amount_paid),m.source_label||'',m.created_at||'']);
    });
    const catalog=[['Plan ID','Nombre','Código','Tipo de acceso','Límite semanal','Clases incluidas','Duración (días)','Activo']];
    plans.forEach(p=>catalog.push([p.id,p.name||'',p.code||'',p.access_type||'',p.weekly_limit??'',p.included_classes??'',p.duration_days??'',p.is_active===true?'Sí':'No']));
    const notes=[['Aclaración','Detalle'],['Importes','amount_paid es un dato histórico registrado; NO prueba de pago cobrado'],['Créditos','Saldo calculado con la suma de membership_credit_ledger.quantity'],['Estado efectivo','Se considera vencida si expires_at es anterior a la fecha actual en Ciudad de México'],['Alcance','Exportación de todos los registros visibles para el usuario autenticado según RLS']];
    const blob=this.workbook([{name:'Miembros',rows:summary},{name:'Historial',rows:hist},{name:'Planes',rows:catalog},{name:'Notas',rows:notes}]);
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='HUB_MIND_membresias_'+today+'.xlsx';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    return {members:members.length,memberships:memberships.length};
  }
};
