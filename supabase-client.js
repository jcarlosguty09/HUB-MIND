// supabase-client.js — HUB MIND WOD App v2
// Sections model: one row per day, sections stored as JSON array

const SUPABASE_URL  = 'https://lvygabtezorvdcbmclxn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2eWdhYnRlem9ydmRjYm1jbHhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NTcyMTcsImV4cCI6MjA5ODMzMzIxN30.Nh0QWZPYfoB5imz6akSvKLkVUkV2oXKpP-RfxfAoiU0';

async function sbReq(method, path, body = null, prefer = 'return=representation') {
  const opts = {
    method,
    headers: {
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type':  'application/json',
      'Prefer':        prefer,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `HTTP ${res.status}`); }
  return res.status === 204 ? null : res.json();
}

const WodAPI = {
  // Returns { 'YYYY-MM-DD': [ ...sections ] }
  async getMonth(yearMonth) {
    const start = `${yearMonth}-01`;
    const d = new Date(yearMonth + '-01'); d.setMonth(d.getMonth() + 1);
    const end = d.toISOString().slice(0, 10);
    try {
      const rows = await sbReq('GET', `wod_days?select=*&date=gte.${start}&date=lt.${end}&order=date.asc`);
      const map = {};
      for (const row of rows) {
        map[row.date] = typeof row.sections === 'string' ? JSON.parse(row.sections) : (row.sections || []);
      }
      return map;
    } catch (e) { console.warn('getMonth:', e.message); return {}; }
  },

  // Save all sections for a day
  async saveDay(date, sections) {
    try {
      await sbReq('POST',
        `wod_days?on_conflict=date`,
        { date, sections: JSON.stringify(sections), updated_at: new Date().toISOString() },
        'resolution=merge-duplicates,return=representation'
      );
      return true;
    } catch (e) { console.error('saveDay:', e.message); return false; }
  },

  // History: last N days that have WODs
  async getHistory(limit = 60) {
    try {
      const rows = await sbReq('GET', `wod_days?select=*&order=date.desc&limit=${limit}`);
      return rows.map(r => ({
        date: r.date,
        sections: typeof r.sections === 'string' ? JSON.parse(r.sections) : (r.sections || []),
      }));
    } catch (e) { console.warn('getHistory:', e.message); return []; }
  },
};
