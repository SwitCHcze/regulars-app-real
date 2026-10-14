/* Demo copy of the Regulars student app.
   Replaces the Regulars server with recorded responses from the real API (captured in a throwaway
   test database) plus small in-browser changes for taps. Nothing is saved or sent anywhere. */
(function () {
'use strict';
const SNAP = window.REGULARS_SNAPSHOTS;
const clone = o => JSON.parse(JSON.stringify(o));
const DEMO_LINK = '#demo';

// Vote clocks count down from "now", whenever the demo is opened.
function shiftTimes(obj, delta) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string' && /_iso$/.test(k)) obj[k] = new Date(Date.parse(v) + delta).toISOString();
    else if (v && typeof v === 'object') shiftTimes(v, delta);
  }
}
function prepare(name) {
  const s = clone(SNAP[name]);
  const captured = Date.parse(((s.participant && s.participant.session) || {}).server_now_iso || '') || Date.parse(SNAP.capturedAt);
  shiftTimes(s, Date.now() - captured);
  s.show_test_info = true;
  s.environment = 'Demo copy';
  s.email_is_real = false;
  if (s.programme) { s.programme.is_test = true; s.programme.urls = { privacy: DEMO_LINK, basic: DEMO_LINK }; }
  s.urls = { signup: DEMO_LINK, login: DEMO_LINK, logout: DEMO_LINK, staff: DEMO_LINK, report: DEMO_LINK };
  const p = s.participant;
  if (p) {
    p.links = { settings: DEMO_LINK, stay_in_touch: DEMO_LINK, feedback: null };
    if (p.session) p.session.ics_url = DEMO_LINK;
  }
  return s;
}

// You: what you typed while joining. Applied to every recorded stage.
const me = { email: 'you@student.example.test', preferred_name: 'You', interest_ids: [], unavailable_days: [], interaction_style: '', email_reminders: true, no_followup_contact: false };
let stage = 'anon';
let cur = prepare('anon');

function applyMe() {
  if (cur.user) cur.user.email = me.email;
  const p = cur.participant;
  if (!p) return;
  Object.assign(p, { email: me.email, preferred_name: me.preferred_name, interest_ids: me.interest_ids.slice(), unavailable_days: me.unavailable_days.slice(),
    interaction_style: me.interaction_style, email_reminders: me.email_reminders, no_followup_contact: me.no_followup_contact });
  const names = cur.programme.activities.filter(a => me.interest_ids.includes(a.id)).map(a => a.name);
  if (p.group) p.group.members.forEach(m => { if (m.is_me) { m.name = me.preferred_name; m.likes = names; } });
}

function setStage(name) {
  stage = name;
  cur = prepare(name === 'anon' ? 'anon' : name);
  applyMe();
}

function recount() {
  const s = cur.participant && cur.participant.session;
  if (!s) return;
  const members = cur.participant.group.members;
  members.forEach(m => { if (m.is_me) m.coming = s.rsvp || 'none'; });
  s.going_count = members.filter(m => m.coming === 'going').length;
  s.options.forEach(o => { o.votes = s.my_vote === o.id ? 1 : 0; });
}

const NOT_IN_DEMO = 'This part isn’t in the demo copy. In the real app it’s saved on the Regulars server.';
const NOT_SENT = 'Demo copy: messages aren’t sent anywhere. In the real app this goes privately to the coordinator.';

function handle(path, body) {
  const p = cur.participant;
  const s = p && p.session;
  switch (path) {
    case 'state': return [200, cur];
    case 'auth/email': {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return [400, { error: 'That doesn’t look like an email address.' }];
      me.email = email;
      if (stage === 'anon') setStage('signedin');
      return [200, cur];
    }
    case 'decline': return [200, { ok: true }];
    case 'enrol':
      Object.assign(me, {
        preferred_name: String(body.preferred_name || 'You').slice(0, 40), interest_ids: body.interest_ids || [],
        unavailable_days: body.unavailable_days || [], interaction_style: body.interaction_style || '', email_reminders: body.email_reminders !== false,
      });
      setStage('waiting');
      return [200, Object.assign({}, cur, { message: 'You’re enrolled.' })];
    case 'intro': {
      const slot = cur.programme.intro_slots.find(x => String(x.id) === String(body.slot_id));
      if (body.preferred_name) me.preferred_name = String(body.preferred_name).slice(0, 40);
      const intro = { status: 'requested', status_label: 'Requested', when: slot ? slot.label : null, arranged: '', contact_window: body.contact_window || '' };
      if (p) p.intro = intro; else cur.intro = intro;
      applyMe();
      return [200, Object.assign({}, cur, { message: 'Requested. Demo copy: nobody is contacted.' })];
    }
    case 'offer':
      if (body.answer === 'accept') { setStage('active'); return [200, Object.assign({}, cur, { message: 'You’ve accepted your place.' })]; }
      setStage('waiting');
      cur.participant.skips_used = 1;
      return [200, Object.assign({}, cur, { message: 'Skipped. You’re still on the waiting list in the same place.' })];
    case 'rsvp':
      if (!s) return [400, { error: NOT_IN_DEMO }];
      s.rsvp = body.response;
      if (body.response === 'not_going') { p.week_change = clone(prepare('notgoing').participant.week_change); if (s.arrival) s.arrival = null; }
      else delete p.week_change;
      recount();
      return [200, cur];
    case 'arrival':
      if (!s) return [400, { error: NOT_IN_DEMO }];
      s.arrival = body.action === 'request' ? clone(SNAP.arrival.participant.session.arrival) : null;
      return [200, Object.assign({}, cur, { message: body.action === 'request' ? 'Asked. Demo copy: no host is contacted.' : '' })];
    case 'vote':
      if (!s) return [400, { error: NOT_IN_DEMO }];
      s.my_vote = Number(body.activity_id);
      recount();
      return [200, cur];
    case 'week/propose': {
      if (!p || !p.group) return [400, { error: NOT_IN_DEMO }];
      p.group.time_vote = prepare('weekvote').participant.group.time_vote;
      delete p.week_change;
      return [200, Object.assign({}, cur, { message: 'Asked. Your group has 24 hours to answer.' })];
    }
    case 'time/answer':
      if (p && p.group && p.group.time_vote) p.group.time_vote.my_answer = !!body.yes;
      return [200, cur];
    case 'ping':
      if (s) s.my_ping = body.kind;
      return [200, cur];
    case 'how-was':
      if (p) p.ask_how = null;
      return [200, cur];
    case 'pause':
      if (body.action === 'resume') { setStage('active'); return [200, Object.assign({}, cur, { message: 'Welcome back.' })]; }
      setStage('paused');
      return [200, cur];
    case 'leave': setStage('withdrawn'); return [200, cur];
    case 'rejoin': setStage('waiting'); return [200, cur];
    case 'profile':
      ['preferred_name', 'interest_ids', 'interaction_style', 'unavailable_days', 'email_reminders', 'no_followup_contact'].forEach(k => { if (k in body) me[k] = body[k]; });
      applyMe();
      return [200, cur];
    case 'again':
      // Kept in memory for this stage only. Nobody is told, and there's no match reveal.
      if (!p || !p.cycle || !p.cycle.again_open) return [400, { error: NOT_IN_DEMO }];
      p.cycle.my_again = { keep_group: !!body.keep_group, fresh_group: !!body.fresh_group, again_with: (body.again_with || []).map(Number) };
      p.cycle.again_answered = true;
      return [200, cur];
    case 'perk_redeem': {
      // A fresh code each time, made here. Nothing is saved and no partner is told.
      if (!p || !p.perks || !p.perks.offers.some(o => o.id === Number(body.offer_id))) return [400, { error: 'That offer isn’t available.' }];
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      return [200, { code: 'REG-' + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') }];
    }
    case 'support': case 'concern': return [400, { error: NOT_SENT }];
    default: return [400, { error: NOT_IN_DEMO }];
  }
}

const realFetch = window.fetch ? window.fetch.bind(window) : null;
window.fetch = async (url, opts = {}) => {
  const u = String(url);
  const m = u.match(/^\/api\/(.+?)\/?(\?.*)?$/);
  if (!m && !u.startsWith('/_allauth/')) return realFetch ? realFetch(url, opts) : Promise.reject(new Error('offline'));
  await new Promise(r => setTimeout(r, 220));
  let body = {};
  try { body = JSON.parse(opts.body || '{}'); } catch (e) {}
  const [status, data] = m ? handle(m[1], body) : [400, { error: NOT_IN_DEMO }];
  const out = data === cur ? Object.assign({}, cur, { message: '' }) : data;
  return new Response(JSON.stringify(out), { status, headers: { 'Content-Type': 'application/json' } });
};

// ---- The demo strip: say what this is, and jump between stages ----
const STAGES = { anon: 'Start (not signed up)', waiting: 'On the waiting list', offered: 'Offered a place', active: 'In a group, week 1', cycleend: 'Week 8: end of cycle' };
window.REGULARS_DEMO = {
  jump(name) {
    if (name === 'anon') { Object.assign(me, { email: 'you@student.example.test', preferred_name: 'You', interest_ids: [], unavailable_days: [], interaction_style: '' }); }
    else if (!me.interest_ids.length) me.interest_ids = [cur.programme.activities[0].id];
    setStage(name);
    if (window.REGULARS_DEMO_REFRESH) window.REGULARS_DEMO_REFRESH();
  },
  reset() { this.jump('anon'); document.getElementById('demoJump').value = 'anon'; },
};

function note(text) {
  const n = document.getElementById('demoNote');
  n.textContent = text;
  n.hidden = false;
  clearTimeout(note.t);
  note.t = setTimeout(() => { n.hidden = true; }, 4000);
}
window.REGULARS_DEMO.note = note;

document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('demoJump');
  sel.innerHTML = Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  sel.addEventListener('change', () => window.REGULARS_DEMO.jump(sel.value));
});
// Links to server pages (privacy notice, calendar file, staff pages) have nowhere to go here.
document.addEventListener('click', e => {
  const a = e.target.closest('a[href="#demo"]');
  if (!a) return;
  e.preventDefault();
  note('That opens a page on the Regulars server, which isn’t part of this demo copy.');
}, true);
})();
