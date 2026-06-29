// supabase-client.js — HUB MIND WOD App

const SUPABASE_URL  = 'https://lvygabtezorvdcbmclxn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2eWdhYnRlem9ydmRjYm1jbHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NTcyMTcsImV4cCI6MjA5ODMzMzIxN30.Nh0QWZPYfoB5imz6akSvKLkVUkV2oXKpP-RfxfAoiU0';

const DB = {
  async _req(method, path, body = null) {
    const opts = {
      method,
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  },

  async get(table, query = '') {
    return this._req('GET', `${table}?${query}`);
  },

  async insert(table, data) {
    return this._req('POST', table, data);
  },

  async upsert(table, data, onConflict = '') {
    const path = onConflict
      ? `${table}?on_conflict=${encodeURIComponent(onConflict)}`
      : table;
    const opts = {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(data),
    };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  },

  async delete(table, query = '') {
    return this._req('DELETE', `${table}?${query}`, null);
  },
};

const WodAPI = {
  async getMonth(yearMonth) {
    const start = `${yearMonth}-01`;
    const d = new Date(yearMonth + '-01');
    d.setMonth(d.getMonth() + 1);
    const end = d.toISOString().slice(0, 10);
    try {
      const rows = await DB.get(
        'wods',
        `select=*&date=gte.${start}&date=lt.${end}&order=date.asc`
      );
      const map = {};
      for (const row of rows) {
        if (!map[row.date]) map[row.date] = {};
        map[row.date][row.class_type] = row.content;
      }
      return map;
    } catch (e) {
      console.warn('WodAPI.getMonth error:', e.message);
      return {};
    }
  },

  async save(date, classType, content) {
    try {
      await DB.upsert(
        'wods',
        { date, class_type: classType, content, updated_at: new Date().toISOString() },
        'date,class_type'
      );
      return true;
    } catch (e) {
      console.error('WodAPI.save error:', e.message);
      return false;
    }
  },

  async getHistory(limit = 60) {
    try {
      const rows = await DB.get(
        'wods',
        `select=*&order=date.desc,class_type.asc&limit=${limit}`
      );
      return rows;
    } catch (e) {
      console.warn('WodAPI.getHistory error:', e.message);
      return [];
    }
  },

  async getDate(date) {
    try {
      const rows = await DB.get('wods', `select=*&date=eq.${date}`);
      const map = {};
      for (const row of rows) map[row.class_type] = row.content;
      return map;
    } catch (e) {
      console.warn('WodAPI.getDate error:', e.message);
      return {};
    }
  },
};
