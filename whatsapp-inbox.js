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
    activeMessages: [],
    serviceWindowOpen: false,
    serviceWindowUntil: null,
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
  const statusIndicator = message => {
    if (message.direction !== 'outbound') return '';
    const status = String(message.status || '').toLowerCase();
    const title = status === 'read' ? 'Leído' :
      status === 'delivered' ? 'Entregado' :
      status === 'sent' ? 'Enviado' :
      status === 'failed' ? ('Error al enviar' + (message.error_message ? ': ' + message.error_message : '')) :
      status || 'Estado pendiente';
    if (status === 'failed') {
      return '<span class="wa-msg-status failed" title="' + esc(title) + '">⚠</span>';
    }
    if (status === 'read') {
      return '<span class="wa-msg-status read" title="' + esc(title) + '">✓✓</span>';
    }
    if (status === 'delivered') {
      return '<span class="wa-msg-status delivered" title="' + esc(title) + '">✓✓</span>';
    }
    if (status === 'sent') {
      return '<span class="wa-msg-status sent" title="' + esc(title) + '">✓</span>';
    }
    return '';
  };

  const getServiceWindow = messages => {
    const inbound = [...messages].reverse().find(m => m.direction === 'inbound');
    if (!inbound) return { open:false, until:null };
    const base = new Date(inbound.whatsapp_timestamp || inbound.created_at).getTime();
    const until = base + 24 * 60 * 60 * 1000;
    return { open: Date.now() < until, until };
  };

  const formatWindowUntil = value => value
    ? new Date(value).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
    : '';

  function updateComposerWindow(messages) {
    const shell = $('wa-inbox-shell');
    if (!shell) return;
    const input = shell.querySelector('.wa-compose-input');
    const button = shell.querySelector('.wa-compose .save-btn');
    const note = shell.querySelector('.wa-compose-note');
    const badge = $('wa-window-status');
    const info = getServiceWindow(messages);
    WA.serviceWindowOpen = info.open;
    WA.serviceWindowUntil = info.until;

    if (badge) {
      badge.className = 'wa-window-status ' + (info.open ? 'open' : 'closed');
      badge.innerHTML = info.open
        ? '<i class="ti ti-clock-check"></i> Ventana 24 h abierta'
        : '<i class="ti ti-clock-x"></i> Ventana 24 h cerrada';
      badge.title = info.open && info.until ? 'Texto libre hasta ' + formatWindowUntil(info.until) : 'Se requiere plantilla aprobada para reiniciar la conversación.';
    }
    if (input && button) {
      input.disabled = !info.open;
      button.disabled = !info.open;
      input.placeholder = info.open ? 'Escribe un mensaje...' : 'Ventana cerrada · usa una plantilla';
    }
    if (note) {
      note.textContent = info.open
        ? 'Texto libre disponible hasta ' + formatWindowUntil(info.until) + ' · Enter para enviar.'
        : 'Han pasado más de 24 h desde el último mensaje del cliente. Para volver a contactar se necesita una plantilla aprobada.';
    }
  }

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
              <div class="wa-chat-identity"><div class="wa-chat-name" id="wa-chat-name"></div><div class="wa-chat-phone" id="wa-chat-phone"></div></div>
              <div id="wa-window-status" class="wa-window-status closed"><i class="ti ti-clock-x"></i> Ventana 24 h cerrada</div>
            </div>
            <div class="wa-messages" id="wa-messages"></div>
            <div class="wa-compose">
              <div class="wa-compose-box">
                <input class="wa-compose-input" value="" placeholder="Escribe un mensaje..." autocomplete="off">
                <button class="save-btn" title="Enviar mensaje"><i class="ti ti-send"></i></button>
              </div>
              <div class="wa-compose-note">Enter para enviar · Los mensajes salen desde el WhatsApp de Hub Mind.</div>
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

    const composeInput = shell.querySelector('.wa-compose-input');
    const composeButton = shell.querySelector('.wa-compose .save-btn');
    if (composeInput && composeButton) {
      composeInput.disabled = false;
      composeButton.disabled = false;
      composeButton.title = 'Enviar mensaje';
      composeInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendActiveMessage();
        }
      });
      composeButton.addEventListener('click', sendActiveMessage);
    }

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
    if (WA.activeId) await renderActiveMessages(after !== before);
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

  async function sendActiveMessage() {
    const conversationId = WA.activeId;
    const input = document.querySelector('#wa-inbox-shell .wa-compose-input');
    const button = document.querySelector('#wa-inbox-shell .wa-compose .save-btn');
    const body = String(input?.value || '').trim();

    if (!conversationId || !body || !input || !button) return;
    if (!WA.serviceWindowOpen) {
      alert('La ventana de atención de 24 horas está cerrada. Para contactar de nuevo a este lead necesitamos usar una plantilla aprobada de WhatsApp.');
      return;
    }
    if (body.length > 4096) {
      alert('El mensaje no puede superar 4096 caracteres.');
      return;
    }

    const token = Auth.getToken();
    if (!token) {
      alert('Tu sesión expiró. Inicia sesión nuevamente.');
      return;
    }

    input.disabled = true;
    button.disabled = true;
    const previousHtml = button.innerHTML;
    button.innerHTML = '<i class="ti ti-loader-2"></i>';

    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/whatsapp-send', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          body,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.meta_error || data.error || 'No se pudo enviar el mensaje');
      }

      input.value = '';
      await renderActiveMessages(true);
      await refreshConversations();
    } catch (e) {
      console.error('WhatsAppInbox.sendActiveMessage:', e);
      alert('No se pudo enviar el WhatsApp: ' + e.message);
    } finally {
      button.innerHTML = previousHtml;
      updateComposerWindow(WA.activeMessages);
      if (WA.serviceWindowOpen) input.focus();
    }
  }

  async function renderActiveMessages(scrollBottom = true) {
    if (!WA.activeId) return;
    const messages = await listMessages(WA.activeId);
    WA.activeMessages = messages;
    updateComposerWindow(messages);
    const root = $('wa-messages');
    if (!root) return;
    if (!messages.length) {
      root.innerHTML = '<div class="wa-state"><div><i class="ti ti-message"></i>Esta conversación todavía no tiene mensajes</div></div>';
      return;
    }
    root.innerHTML = messages.map(m => `
      <div class="wa-bubble ${m.direction === 'outbound' ? 'outbound' : 'inbound'}">
        <div class="wa-bubble-body">${esc(m.body || '[' + (m.message_type || 'mensaje') + ']')}</div>
        <div class="wa-bubble-meta"><span>${esc(fmtDateTime(m.whatsapp_timestamp || m.created_at))}</span>${statusIndicator(m)}</div>
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
