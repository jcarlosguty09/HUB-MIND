// HUB MIND CRM — WhatsApp Inbox V1
(() => {
  'use strict';

  const WA = {
    conversations: [],
    filtered: [],
    activeId: null,
    activeConversation: null,
    poller: null,
    mounted: false,
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initials = name => (name || '?').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase();
  const fmtTime = value => {
    if (!value) return '';
    const d = new Date(value);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return d.toLocaleString('es-MX', sameDay ? {hour:'2-digit',minute:'2-digit'} : {day:'2-digit',month:'short'});
  };
  const fmtDateTime = value => value ? new Date(value).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
  const stageLabel = stage => ({new:'Nuevo',contacted:'Contactado',trial_scheduled:'Prueba agendada',trial_completed:'Prueba realizada',negotiating:'Negociación',won:'Ganado',lost:'Perdido'})[stage] || stage || '—';

  async function listConversations() {
    try {
      return await sbReq('GET',
        'crm_whatsapp_conversations?select=*&status=eq.open&order=last_message_at.desc.nullslast,created_at.desc'
      ) || [];
    } catch (e) {
      console.warn('WhatsAppInbox.listConversations:', e.message);
      return [];
    }
  }

  async function listMessages(conversationId) {
    try {
      return await sbReq('GET',
        'crm_whatsapp_messages?select=*&conversation_id=eq.' + encodeURIComponent(conversationId) + '&order=whatsapp_timestamp.asc,created_at.asc'
      ) || [];
    } catch (e) {
      console.warn('WhatsAppInbox.listMessages:', e.message);
      return [];
    }
  }

  async function getLead(leadId) {
    if (!leadId) return null;
    try {
      const rows = await sbReq('GET','crm_leads?select=*&id=eq.' + encodeURIComponent(leadId) + '&limit=1');
      return rows?.[0] || null;
    } catch (e) {
      console.warn('WhatsAppInbox.getLead:', e.message);
      return null;
    }
  }

  async function markRead(conversationId) {
    try {
      await sbReq('POST','rpc/crm_whatsapp_mark_read',{p_conversation_id:conversationId});
      return true;
    } catch (e) {
      console.warn('WhatsAppInbox.markRead:', e.message);
      return false;
    }
  }

  function mount() {
    if (WA.mounted) return;
    const actions = document.querySelector('#view-crm .crm-header-actions');
    if (!actions) return;

    const btn = document.createElement('button');
    btn.className = 'secondary-btn wa-inbox-btn';
    btn.id = 'crm-whatsapp-inbox-btn';
    btn.innerHTML = '<i class="ti ti-brand-whatsapp"></i> WhatsApp <span id="wa-header-count" class="wa-header-count"></span>';
    actions.prepend(btn);

    const shell = document.createElement('div');
    shell.id = 'wa-inbox-shell';
    shell.className = 'wa-inbox-shell hidden';
    shell.innerHTML = `
      <div class="wa-inbox-topbar">
        <div>
          <div class="wa-inbox-title"><i class="ti ti-brand-whatsapp"></i><span>WhatsApp Inbox</span></div>
          <div class="wa-inbox-sub">Conversaciones comerciales · Hub Mind CRM</div>
        </div>
        <button class="icon-btn" id="wa-close" aria-label="Cerrar WhatsApp"><i class="ti ti-x"></i></button>
      </div>
      <div class="wa-inbox-main">
        <aside class="wa-panel wa-list-panel">
          <div class="wa-list-head"><input id="wa-search" class="wa-search" placeholder="Buscar conversación..." autocomplete="off"></div>
          <div id="wa-list" class="wa-list"><div class="wa-state wa-loading"><div><i class="ti ti-loader-2"></i>Cargando conversaciones...</div></div></div>
        </aside>
        <main class="wa-panel wa-chat-panel">
          <div id="wa-chat-empty" class="wa-state"><div><i class="ti ti-message-circle"></i>Selecciona una conversación</div></div>
          <div id="wa-chat-content" style="display:none;min-height:0;height:100%;flex-direction:column">
            <div class="wa-chat-head">
              <button class="icon-btn wa-mobile-back" id="wa-back"><i class="ti ti-chevron-left"></i></button>
              <div class="wa-avatar" id="wa-chat-avatar">?</div>
              <div><div class="wa-chat-name" id="wa-chat-name"></div><div class="wa-chat-phone" id="wa-chat-phone"></div></div>
            </div>
            <div class="wa-messages" id="wa-messages"></div>
            <div class="wa-compose">
              <div class="wa-compose-box">
                <input class="wa-compose-input" value="" placeholder="Escribe un mensaje..." disabled>
                <button class="save-btn" disabled title="Envío se activa en WhatsApp V2"><i class="ti ti-send"></i></button>
              </div>
              <div class="wa-compose-note">Lectura activa. El envío desde CRM se habilita en la siguiente fase.</div>
            </div>
          </div>
        </main>
        <aside class="wa-panel wa-lead-panel" id="wa-lead-panel">
          <div class="wa-state"><div><i class="ti ti-user-search"></i>Selecciona una conversación para ver el lead</div></div>
        </aside>
      </div>`;
    document.body.appendChild(shell);

    btn.addEventListener('click', open);
    $('wa-close').addEventListener('click', close);
    $('wa-back').addEventListener('click', () => shell.classList.remove('wa-chat-open'));
    $('wa-search').addEventListener('input', e => filter(e.target.value));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !shell.classList.contains('hidden')) close(); });

    WA.mounted = true;
    refreshBadge();
  }

  async function open() {
    const shell = $('wa-inbox-shell');
    if (!shell) return;
    shell.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    await refreshConversations();
    clearInterval(WA.poller);
    WA.poller = setInterval(refreshQuietly, 8000);
  }

  function close() {
    $('wa-inbox-shell')?.classList.add('hidden');
    $('wa-inbox-shell')?.classList.remove('wa-chat-open');
    document.body.style.overflow = '';
    clearInterval(WA.poller);
    WA.poller = null;
  }

  async function refreshBadge() {
    const rows = await listConversations();
    const total = rows.reduce((n,c) => n + Number(c.unread_count || 0), 0);
    const badge = $('wa-header-count');
    if (badge) { badge.textContent = total ? String(total) : ''; badge.classList.toggle('visible', total > 0); }
  }

  async function refreshConversations() {
    const list = $('wa-list');
    if (list && !WA.conversations.length) list.innerHTML = '<div class="wa-state wa-loading"><div><i class="ti ti-loader-2"></i>Cargando conversaciones...</div></div>';
    WA.conversations = await listConversations();
    filter($('wa-search')?.value || '');
    await refreshBadge();
  }

  async function refreshQuietly() {
    const before = WA.conversations.find(c => c.id === WA.activeId)?.last_message_at;
    WA.conversations = await listConversations();
    filter($('wa-search')?.value || '');
    await refreshBadge();
    const after = WA.conversations.find(c => c.id === WA.activeId)?.last_message_at;
    if (WA.activeId && after && after !== before) await renderActiveMessages(false);
  }

  function filter(query) {
    const q = String(query || '').trim().toLowerCase();
    WA.filtered = !q ? [...WA.conversations] : WA.conversations.filter(c =>
      [c.contact_name,c.contact_phone,c.last_message_preview].some(v => String(v || '').toLowerCase().includes(q))
    );
    renderList();
  }

  function renderList() {
    const root = $('wa-list');
    if (!root) return;
    if (!WA.filtered.length) {
      root.innerHTML = '<div class="wa-state"><div><i class="ti ti-message-off"></i>No hay conversaciones</div></div>';
      return;
    }
    root.innerHTML = WA.filtered.map(c => `
      <button class="wa-conv ${c.id === WA.activeId ? 'active' : ''}" data-id="${esc(c.id)}">
        <div class="wa-avatar">${esc(initials(c.contact_name || c.contact_phone))}</div>
        <div class="wa-conv-main">
          <div class="wa-conv-row">
            <div class="wa-conv-name">${esc(c.contact_name || c.contact_phone || 'WhatsApp')}</div>
            <div class="wa-conv-time">${esc(fmtTime(c.last_message_at || c.created_at))}</div>
          </div>
          <div class="wa-conv-row">
            <div class="wa-conv-preview">${c.last_message_direction === 'outbound' ? 'Tú: ' : ''}${esc(c.last_message_preview || 'Sin mensajes')}</div>
            ${Number(c.unread_count) > 0 ? '<span class="wa-unread">' + Number(c.unread_count) + '</span>' : ''}
          </div>
        </div>
      </button>`).join('');
    root.querySelectorAll('.wa-conv').forEach(btn => btn.addEventListener('click', () => selectConversation(btn.dataset.id)));
  }

  async function selectConversation(id) {
    const conversation = WA.conversations.find(c => c.id === id);
    if (!conversation) return;
    WA.activeId = id;
    WA.activeConversation = conversation;
    renderList();
    $('wa-inbox-shell')?.classList.add('wa-chat-open');

    $('wa-chat-empty').style.display = 'none';
    $('wa-chat-content').style.display = 'flex';
    $('wa-chat-name').textContent = conversation.contact_name || conversation.contact_phone || 'WhatsApp';
    $('wa-chat-phone').textContent = conversation.contact_phone || '';
    $('wa-chat-avatar').textContent = initials(conversation.contact_name || conversation.contact_phone);

    $('wa-messages').innerHTML = '<div class="wa-state wa-loading"><div><i class="ti ti-loader-2"></i>Cargando mensajes...</div></div>';
    $('wa-lead-panel').innerHTML = '<div class="wa-state wa-loading"><div><i class="ti ti-loader-2"></i>Cargando lead...</div></div>';

    await Promise.all([renderActiveMessages(true), renderLead(conversation.lead_id)]);

    if (Number(conversation.unread_count || 0) > 0) {
      const ok = await markRead(id);
      if (ok) {
        conversation.unread_count = 0;
        const original = WA.conversations.find(c => c.id === id);
        if (original) original.unread_count = 0;
        renderList();
        refreshBadge();
      }
    }
  }

  async function renderActiveMessages(scrollBottom = true) {
    if (!WA.activeId) return;
    const messages = await listMessages(WA.activeId);
    const root = $('wa-messages');
    if (!root) return;
    if (!messages.length) {
      root.innerHTML = '<div class="wa-state"><div><i class="ti ti-message"></i>Esta conversación todavía no tiene mensajes</div></div>';
      return;
    }
    root.innerHTML = messages.map(m => `
      <div class="wa-bubble ${m.direction === 'outbound' ? 'outbound' : 'inbound'}">
        <div class="wa-bubble-body">${esc(m.body || '[' + (m.message_type || 'mensaje') + ']')}</div>
        <div class="wa-bubble-meta"><span>${esc(fmtDateTime(m.whatsapp_timestamp || m.created_at))}</span>${m.direction === 'outbound' && m.status ? '<span>· ' + esc(m.status) + '</span>' : ''}</div>
      </div>`).join('');
    if (scrollBottom) requestAnimationFrame(() => { root.scrollTop = root.scrollHeight; });
  }

  async function renderLead(leadId) {
    const root = $('wa-lead-panel');
    if (!root) return;
    const lead = await getLead(leadId);
    if (!lead) {
      root.innerHTML = `
        <div class="wa-lead-label">CRM</div>
        <div class="wa-lead-name">Sin lead vinculado</div>
        <div class="wa-lead-contact">Esta conversación todavía no está asociada a un prospecto del CRM.</div>
        <div class="wa-lead-grid"><div class="wa-lead-field"><span>WhatsApp</span><strong>${esc(WA.activeConversation?.contact_phone || '—')}</strong></div></div>`;
      return;
    }
    let assignee = 'Sin asignar';
    try {
      const staff = await CRMAPI.listStaff();
      assignee = staff.find(s => s.id === lead.assigned_to)?.full_name || assignee;
    } catch (_) {}
    root.innerHTML = `
      <div class="wa-lead-label">Lead vinculado</div>
      <div class="wa-lead-name">${esc(lead.full_name || 'Sin nombre')}</div>
      <div class="wa-lead-contact">${esc(lead.email || '')}</div>
      <div class="wa-lead-grid">
        <div class="wa-lead-field"><span>Etapa</span><strong>${esc(stageLabel(lead.stage))}</strong></div>
        <div class="wa-lead-field"><span>Responsable</span><strong>${esc(assignee)}</strong></div>
        <div class="wa-lead-field"><span>Próximo seguimiento</span><strong>${esc(fmtDateTime(lead.next_follow_up_at))}</strong></div>
        <div class="wa-lead-field"><span>Teléfono CRM</span><strong>${esc(lead.phone || '—')}</strong></div>
        <div class="wa-lead-field"><span>Fuente</span><strong>${esc(lead.source || '—')}</strong></div>
      </div>`;
  }

  function boot() {
    const timer = setInterval(() => {
      if (document.querySelector('#view-crm .crm-header-actions')) {
        clearInterval(timer);
        mount();
      }
    }, 250);
    setTimeout(() => clearInterval(timer), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
