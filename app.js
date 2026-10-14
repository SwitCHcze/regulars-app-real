/* ==========================================================
   REGULARS: app.js
   ----------------------------------------------------------
   The student app. Same screens, words and behaviour as the
   original prototype (prototype/app.js), but connected: what
   you see comes from the Regulars server (/api/state/), and
   every change is sent to the server first. The screen only
   changes once the server has saved it. Nothing is invented.

    1. HELPERS
    2. LIGHT AND DARK MODE
    3. TALKING TO THE SERVER
    4. MOVING BETWEEN SCREENS
    5. SETTING UP THE PROGRAMME
    6. INVITATION LINKS
    7. HOW IT WORKS
    8. SIGN-UP STEP 1: WHAT YOU'D FANCY
    9. SIGN-UP STEP 2: TIMES AND PREFERENCES
   10. SIGN-UP STEP 3: UNIVERSITY EMAIL
   11. JOINING THE WAITING LIST
   12. MEET A HOST FIRST
   13. THIS WEEK
   14. BEFORE YOU GO
   15. WALK IN TOGETHER
   16. THIS WEEK'S OTHER OPTION
   17. GROUP SCREEN
   18. PRIVATE MESSAGES
   19. INVITE SOMEONE
   20. SUPPORT SCREEN
   20b. PERKS
   21. SOMETHING TO TALK ABOUT
   22. YOUR PROFILE
   23. INSTALL AS AN APP
   24. START THE APP
   ========================================================== */
(function () {
'use strict';

/* ==========================================================
   1. HELPERS
   ========================================================== */
const $ = id => document.getElementById(id);
const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const listWords = words => words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1] : (words[0] || '');
// The first letter of a name, for the round pictures. 'Sam' -> 'S', '(Sam)' -> 'S'
const initialOf = name => ((String(name || '').match(/\p{L}/u) || ['?'])[0]).toUpperCase();
const params = new URLSearchParams(location.search);
const INVITE = document.body.dataset.invite || params.get('invite') || '';
let CSRF = document.querySelector('meta[name="csrf-token"]').content;

function iconFor(name) {
  const n = (name || '').toLowerCase();
  if (/tea|coffee|cake|food|bake|lunch|colour/.test(n)) return '☕';
  if (/study|read|library|write/.test(n)) return '📚';
  if (/game|card|puzzle|table/.test(n)) return '🎲';
  if (/walk|outdoor|park/.test(n)) return '🌳';
  if (/craft|draw|art/.test(n)) return '🎨';
  return '✨';
}

function store(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
function recall(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }

// What you chose before signing in. Kept in this browser tab only, until you join.
function loadDraft() { try { return JSON.parse(sessionStorage.getItem('regulars-draft')) || null; } catch (e) { return null; } }
function saveDraft() { try { sessionStorage.setItem('regulars-draft', JSON.stringify(draft)); } catch (e) {} }
function clearDraft() { try { sessionStorage.removeItem('regulars-draft'); } catch (e) {} }

let S = null;   // the latest state from the server
let draft = loadDraft() || { programme: null, invite: '', interest_ids: [], open: false, interaction_style: '', unavailable_days: [], needs_step_free: false, prefers_quieter: false };
if (INVITE) draft.invite = INVITE;
draft.unavailable_days = Array.isArray(draft.unavailable_days) ? draft.unavailable_days : [];   // older saved drafts

// Your picture: a colour, or a photo. Both stay on this phone; the server never receives them.
const picture = { colour: recall('regulars-colour', 'a1'), photo: recall('regulars-photo', null) };
function paintPicture(el, initial) {
  el.classList.remove('a1', 'a2', 'a3', 'a4', 'a5');
  if (picture.photo) { el.style.backgroundImage = `url(${picture.photo})`; el.textContent = ''; }
  else { el.style.backgroundImage = ''; el.classList.add(picture.colour); el.textContent = initial; }
}


/* ==========================================================
   2. LIGHT AND DARK MODE
   ========================================================== */
const root = document.documentElement;
const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : deviceDark.matches;
const themeChoice = () => root.dataset.theme || 'system';
function setTheme(choice) {
  if (choice === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', choice);
  store('regulars-theme', choice === 'system' ? null : choice);
  updateThemeButtons();
}
function updateThemeButtons() {
  const dark = isDark();
  document.querySelectorAll('[data-theme-toggle]').forEach(b => {
    b.querySelector('.i-moon').hidden = dark;
    b.querySelector('.i-sun').hidden = !dark;
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  });
  document.querySelectorAll('[data-theme-choice]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeChoice === themeChoice()));
}
const savedTheme = recall('regulars-theme', null);
if (savedTheme === 'light' || savedTheme === 'dark') root.setAttribute('data-theme', savedTheme);
document.addEventListener('click', e => { if (e.target.closest('[data-theme-toggle]')) setTheme(isDark() ? 'light' : 'dark'); });
deviceDark.addEventListener?.('change', updateThemeButtons);


/* ==========================================================
   3. TALKING TO THE SERVER
   ----------------------------------------------------------
   Nothing is shown as saved until the server says so. If
   you're offline, nothing is sent and the app says so.
   ========================================================== */
const online = () => navigator.onLine !== false;
function updateOffline() { $('offbar').hidden = online(); }
window.addEventListener('online', updateOffline);
window.addEventListener('offline', updateOffline);

let toastTimer = null;
function toast(text, isError) {
  if (!text) return;
  const t = $('toast');
  t.textContent = text;
  t.classList.toggle('error', !!isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, isError ? 7000 : 3500);
}

async function fetchState() {
  const q = new URLSearchParams();
  if (draft.invite) q.set('invite', draft.invite);
  else if (draft.programme) q.set('programme', draft.programme);
  const res = await fetch('/api/state/' + (q.toString() ? '?' + q : ''), { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('The Regulars server isn’t responding. Please try again.');
  S = await res.json();
  CSRF = S.csrf || CSRF;   // Django issues a new token when you sign in
  return S;
}

// Low-level POST. Returns { ok, status, data }.
async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF, Accept: 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, data };
}

let busy = false;
// A change to your Regulars record. On success the server sends back the fresh state
// (returned as well, for the few replies that carry something else, like a perk code).
async function send(path, body) {
  if (!online()) { toast('You’re offline, so nothing was sent. Try again when you’re connected.', true); return false; }
  if (busy) return false;
  busy = true;
  document.body.classList.add('busy');
  try {
    const r = await post(`/api/${path}/`, body);
    if (r.status === 401) { toast('Please sign in again.', true); return false; }
    if (!r.ok) { toast((r.data && r.data.error) || 'That didn’t work. Nothing was changed.', true); return false; }
    if (r.data && r.data.programme !== undefined) { S = r.data; CSRF = S.csrf || CSRF; }
    if (r.data && r.data.message) toast(r.data.message);
    return r.data || {};
  } catch (e) {
    toast('Couldn’t reach the Regulars server. Nothing was changed.', true);
    return false;
  } finally {
    busy = false;
    document.body.classList.remove('busy');
  }
}


/* ==========================================================
   4. MOVING BETWEEN SCREENS
   ========================================================== */
const ALL_SCREENS = ['sc-loading', 'sc-welcome', 'sc-how', 'sc-pick', 'sc-fit', 'sc-verify', 'sc-match', 'sc-choices', 'sc-intro', 'sc-week', 'sc-group', 'sc-vote', 'sc-support', 'sc-perks', 'sc-redeem', 'sc-again', 'sc-ask', 'sc-me'];
const TAB_SCREENS = ['sc-week', 'sc-group', 'sc-vote', 'sc-support', 'sc-perks'];
const MEMBER_SCREENS = ['sc-me', 'sc-choices', 'sc-redeem', 'sc-again'];   // also need you to have joined
let currentScreen = 'sc-loading';
let lastTab = 'sc-week';

const RENDER = {
  'sc-welcome': renderWelcome, 'sc-how': renderHow, 'sc-pick': renderPick, 'sc-fit': renderFit, 'sc-verify': renderVerify,
  'sc-intro': renderIntro, 'sc-choices': renderChoices, 'sc-week': renderWeek, 'sc-group': renderGroup, 'sc-vote': renderVote, 'sc-support': renderSupport, 'sc-perks': renderPerks, 'sc-redeem': renderRedeem, 'sc-again': renderAgain, 'sc-me': renderProfile,
};

function go(id, { focus = true } = {}) {
  // The tabs only make sense once you've joined.
  if ((TAB_SCREENS.includes(id) || MEMBER_SCREENS.includes(id)) && !(S && S.participant)) id = 'sc-welcome';
  // Perks are only for verified members (the server leaves them out for everyone else).
  if ((id === 'sc-perks' || id === 'sc-redeem') && !S.participant.perks) id = 'sc-week';
  if (id === 'sc-again' && !againOpen(S.participant)) id = 'sc-week';
  ALL_SCREENS.forEach(s => $(s).hidden = s !== id);
  currentScreen = id;
  if (TAB_SCREENS.includes(id)) lastTab = id;
  const hasTabs = TAB_SCREENS.includes(id) || ['sc-me', 'sc-ask', 'sc-redeem', 'sc-again'].includes(id);
  $('appbar').hidden = !hasTabs;
  $('tabs').hidden = !hasTabs;
  const tab = { 'sc-redeem': 'sc-perks', 'sc-again': 'sc-week' }[id] || id;
  document.querySelectorAll('#tabs [data-tab]').forEach(t => t.dataset.tab === tab ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'));
  if (RENDER[id]) RENDER[id]();
  updateTopBar();
  if (focus) {
    $('view').scrollTop = 0;
    const heading = $(id).querySelector('h1, h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
}
const rerender = () => { if (RENDER[currentScreen]) RENDER[currentScreen](); updateTopBar(); };

document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (!b || b.disabled) return;
  e.preventDefault();
  go(b.dataset.go);
});
document.querySelectorAll('#tabs [data-tab]').forEach(tab => tab.onclick = () => go(tab.dataset.tab));

// Your picture in the top bar (tap it to open your profile).
function updateTopBar() {
  updateVoteDot();
  const p = S && S.participant;
  $('perksTab').hidden = !(p && p.perks);
  paintPicture($('meAv'), initialOf(p && p.preferred_name));
  // The week of this meetup, or (once the meetups are over) the week the cycle reached.
  const week = p && ((p.session && p.session.week) || (p.cycle && p.cycle.week));
  $('weekLabel').hidden = !week;
  if (week) { $('weekNo').textContent = week; $('weekOf').textContent = S.programme.weeks; }
}


/* ==========================================================
   5. SETTING UP THE PROGRAMME
   ----------------------------------------------------------
   Colours, names and activities come from the programme the
   coordinator set up – nothing is built into the app.
   ========================================================== */
const programme = () => S && S.programme;

// The university's own free ways to meet people (shown on the Support tab).
// Portsmouth's list, checked on myport.port.ac.uk in October 2026. Times change each term.
const UNI_PROGRAMS = {
  portsmouth: [
    { name: 'Chaplaincy Lounge', about: 'A comfy room with free tea and coffee. Eat lunch, read or play games. Open to everyone, religious or not.', when: 'Mon to Thu 9am to 5pm, Fri 9am to 4pm · Chaplaincy Centre, St Paul’s Road', link: 'https://myport.port.ac.uk/student-services/chaplaincy' },
    { name: 'Thursday crafts and games', about: 'Free crafts and games, made to bring people together. Just turn up.', when: 'Every Thursday afternoon · Chaplaincy Centre', link: 'https://myport.port.ac.uk/student-services/chaplaincy' },
    { name: 'Beyond Borders Café', about: 'Meet students from all over the world, share your story, and have free snacks.', when: 'Once a month on a Friday · free, book on Eventbrite', link: 'https://myport.port.ac.uk/life-at-uni/international-students/social-activities' },
    { name: 'Res Life events', about: 'Speed friending, quiz nights, film nights and games nights, run by students in their second and third year.', when: 'All year · for students in halls · reslife@port.ac.uk', link: 'https://myport.port.ac.uk/student-services/res-life' },
    { name: 'Volunteering', about: 'Help out in the local community. A good way to meet people while doing something useful.', when: 'Book a chat with the Careers and Employability Centre', link: 'https://myport.port.ac.uk/my-course/careers-support/building-work-experience/volunteering' },
  ],
};

function applyProgramme() {
  const prog = programme();
  root.dataset.uni = prog ? prog.institution.theme : 'regulars';
  const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
  document.querySelector('meta[name="theme-color"]').content = accent || '#2E47D6';
  $('aboutProgramme').textContent = prog ? `${prog.name} · ${prog.institution.name}` : 'No programme is open right now.';
  if (prog) $('basicLink').href = prog.urls.basic;
  if (S.urls.report) $('partnerLink').href = S.urls.report;
  const tag = $('envTag');
  tag.hidden = !S.show_test_info || S.is_production;
  tag.textContent = `${S.environment} · ${S.email_is_real ? 'real email' : 'emails not delivered'}` + (prog && prog.is_test ? ' · test programme' : '');
}

function slotLine(slot) { return `${slot.day}, ${slot.time} · ${slot.venue.name}`; }


/* ==========================================================
   6. INVITATION LINKS
   ----------------------------------------------------------
   Real invitation links (/i/<code>/, made by the coordinator)
   show their own message. A link shared by a friend says who
   shared it. Links never contain anything about the student
   opening them, and nobody is signed up automatically.
   ========================================================== */
const CHANNEL_LINES = {
  accommodation_onboarding: () => `From your accommodation team at ${programme().institution.name}.`,
  residential_life: () => `From Res Life at ${programme().institution.name}.`,
  teaching_library: () => `Shared at ${programme().institution.name}. Open to every student.`,
  student_support: () => `Shared by student support at ${programme().institution.name}. Open to every student.`,
  email: () => `From ${programme().institution.name}.`,
  poster_qr: () => `Regulars at ${programme().institution.name}.`,
};
const friendFrom = (params.get('via') === 'friend' && (params.get('from') || '').replace(/[^\p{L}' -]/gu, '').trim().slice(0, 20)) || null;

function viaText() {
  const inv = S.invitation;
  if (inv) {
    if (!inv.usable) return 'This invitation has expired or isn’t active. Nothing about you has been recorded.';
    const line = CHANNEL_LINES[inv.channel] ? CHANNEL_LINES[inv.channel]() + ' ' : '';
    return line + inv.message + (inv.host ? `\nYour host: ${inv.host.name}` : '');
  }
  if (params.get('via') === 'friend') return `${friendFrom || 'A friend'} thought you might like this. They won’t be told whether you join.`;
  return '';
}

function renderWelcome() {
  const prog = programme();
  const via = viaText();
  $('viaText').hidden = !via;
  $('viaText').textContent = via;
  $('welcomeExamples').textContent = prog && prog.activities.length ? listWords(prog.activities.map(a => a.name)) + '.' : '';
  let html = '';
  if (!prog) html = '<p class="hint on-accent-hint">No Regulars programme is open for enrolment at the moment. It only opens once a university has agreed to run it, hosts are trained and venues are approved.</p>';
  else if (S.participant) html = '<button class="btn" data-go="sc-week">Open my week</button>';
  else if (!prog.enrolment_open) html = '<p class="hint on-accent-hint">This programme isn’t taking new people right now.</p>';
  else {
    html = '<button class="btn" data-go="sc-how">See how it works</button><small>No sign-up needed to look around.</small>';
    if (S.invitation && S.invitation.usable) html += '<button class="btn install" id="declineInvite">No thanks</button>';
  }
  $('welcomeActions').innerHTML = html;
  $('signedInAs').hidden = !S.user;
  if (S.user) $('signedInAs').innerHTML = `Signed in as ${esc(S.user.email)}` + (S.user.staff ? ` · <a href="${S.urls.staff}">Operations</a>` : '');
}

document.addEventListener('click', async e => {
  if (e.target.id !== 'declineInvite') return;
  if (!online()) return toast('You’re offline, so nothing was sent.', true);
  await post('/api/decline/', { code: draft.invite });
  $('welcomeActions').innerHTML = '<p class="hint on-accent-hint">No problem. Nothing about you has been recorded and nobody will contact you.</p>';
});


/* ==========================================================
   7. HOW IT WORKS
   ========================================================== */
function agreeHTML() {
  const p = programme();
  if (!p) return '';
  return `<ul class="steps-list">
    <li><b>Who runs it:</b> ${esc(p.delivery_team || 'the Regulars team')} for ${esc(p.institution.name)}.</li>
    <li><b>What your group sees:</b> your first name, what you’d fancy, and whether you’ve said you’re coming.</li>
    <li><b>Missing a week</b> is fine, no reason needed. If you miss ${p.followup_after_missed} in a row without saying, the coordinator may check in once (you can say no to that). After a notice and ${p.release_notice_days} days without a reply, your place may go to someone waiting. You can always come back.</li>
    <li><b>Stopping:</b> take a break for up to ${p.pause_max_weeks} weeks or leave any time from your profile; turn off reminder emails from any email.</li>
    <li><b>Concerns</b> go only to the designated safety lead. If someone may be at risk of serious harm, they may need to involve others – they’ll tell you if they can.</li>
    ${p.monitoring_hours ? `<li><b>When messages are read:</b> ${esc(p.monitoring_hours)}. It isn’t an emergency service.</li>` : ''}
    <li>This first pilot is for students aged 18 or over.</li>
  </ul><p><a class="linkout" href="${p.urls.privacy}" target="_blank" rel="noopener">Full privacy notice ↗</a></p>`;
}

function renderHow() {
  const p = programme();
  if (!p) return go('sc-welcome');
  $('howWeeks').textContent = p.weeks;
  $('howStep2').textContent = `Up to ${p.target_group_size} students who can make the same weekly time as you, with a named host. A group starts once at least ${p.min_group_size} have said yes.`;
  const inv = S.invitation && S.invitation.usable ? S.invitation : null;
  const act = (inv && inv.activity) || p.activities[0];
  const slot = (inv && p.slots.find(s => s.id === inv.slot_id)) || p.slots[0];
  $('howExample').hidden = !(act && slot);
  if (act && slot) {
    $('howExample').innerHTML = `<span class="label">${inv ? 'The meet-up you were invited to' : 'Example of a first meetup'}</span>
      <div class="ex-head"><span aria-hidden="true">${iconFor(act.name)}</span><div><b>${esc(act.name)}</b><small>${esc(slotLine(slot))}</small></div></div>
      <ul class="facts"><li>Up to ${p.target_group_size} people</li><li>A Regulars host says hi at the door</li><li>Free</li></ul>
      <p>${esc(act.first_five_minutes)} Leave whenever you like.</p>`;
  }
  $('agreeText').innerHTML = agreeHTML();
  $('howIntro').hidden = !(p.enrolment_open && (!inv || inv.intro_offered));
  $('howJoin').disabled = !p.enrolment_open;
}


/* ==========================================================
   8. SIGN-UP STEP 1: WHAT YOU'D FANCY
   ----------------------------------------------------------
   The programme's approved activities. As soon as you tap
   something, you see real examples of what a meetup could be.
   ========================================================== */
function choiceBtn(look, id, label, about, pressed) {
  if (look === 'act') return `<button type="button" class="act" data-id="${id}" aria-pressed="${pressed}"><span aria-hidden="true">${iconFor(label)}</span>${esc(label)}</button>`;
  return `<button type="button" class="tier" data-id="${id}" aria-pressed="${pressed}"><b>${esc(label)}</b>${about ? `<small>${esc(about)}</small>` : ''}</button>`;
}

function renderPick() {
  const p = programme();
  if (!p) return go('sc-welcome');
  $('pickActs').innerHTML = p.activities.map(a => choiceBtn('act', a.id, a.name, '', draft.interest_ids.includes(a.id))).join('')
    + `<button type="button" class="act" data-id="open" aria-pressed="${draft.open}"><span aria-hidden="true">✨</span>Surprise me</button>`;
  const chosen = draft.open || draft.interest_ids.length > 0;
  $('pickNext').disabled = !chosen;
  $('pickExamples').hidden = !chosen;
  if (!chosen) return;
  const acts = draft.open ? p.activities : p.activities.filter(a => draft.interest_ids.includes(a.id));
  const examples = [];
  acts.forEach(a => p.slots.forEach(s => examples.push({ a, s })));
  $('pickExampleList').innerHTML = examples.slice(0, 3).map(({ a, s }) =>
    `<div class="ex-head"><span aria-hidden="true">${iconFor(a.name)}</span><div><b>${esc(a.name)}</b><small>${esc(slotLine(s))} · Free</small></div></div>`).join('');
}
$('pickActs').addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (!b) return;
  if (b.dataset.id === 'open') { draft.open = !draft.open; if (draft.open) draft.interest_ids = []; }
  else {
    const id = Number(b.dataset.id);
    draft.open = false;   // "Surprise me" doesn't mix with the others
    draft.interest_ids = draft.interest_ids.includes(id) ? draft.interest_ids.filter(x => x !== id) : [...draft.interest_ids, id];
  }
  saveDraft();
  renderPick();
});


/* ==========================================================
   9. SIGN-UP STEP 2: DAYS AND PREFERENCES
   ----------------------------------------------------------
   As in the original: tap a day that never works to rule it
   out; every other day stays. No times or places are
   suggested here – the coordinator finds a group on a day
   you kept.
   ========================================================== */
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const daysHTML = ruledOut => WEEK.map((day, i) =>
  `<button type="button" class="day" data-day="${i}" aria-pressed="${ruledOut.includes(i)}" aria-label="${day}${ruledOut.includes(i) ? ': never works' : ''}">${day.slice(0, 3)}</button>`).join('');
const toggleDay = (list, day) => list.includes(day) ? list.filter(d => d !== day) : [...list, day].sort();
// Regulars only meets on days that have a weekly time; keep at least one of those.
const meetingDays = () => [...new Set(programme().slots.map(s => WEEK.indexOf(s.day)))];
const keepsAMeetingDay = ruledOut => meetingDays().some(d => !ruledOut.includes(d));
const DAYS_ERROR = 'Keep at least one more day – Regulars doesn’t meet on any of the days you’ve left.';

const STYLE_ABOUT = { quiet: 'Doing something side by side is enough', little: 'Some chat, no pressure', chatty: 'Up for a proper chat', structured: 'Something to focus on, like a game' };
const stylesHTML = selected => programme().styles.map(s => choiceBtn('tier', s.id, s.label, STYLE_ABOUT[s.id], selected === s.id)).join('');

function renderFit() {
  const p = programme();
  if (!p) return go('sc-welcome');
  $('fitDays').innerHTML = daysHTML(draft.unavailable_days);
  $('fitStyle').innerHTML = stylesHTML(draft.interaction_style);
  $('fitAccessQ').hidden = !p.access_preferences_enabled;
  $('fitAccess').innerHTML = choiceBtn('tier', 'stepfree', 'Step-free access', '', draft.needs_step_free) + choiceBtn('tier', 'quieter', 'Quieter places', '', draft.prefers_quieter);
  $('fitErr').hidden = true;
}
$('fitDays').addEventListener('click', e => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  draft.unavailable_days = toggleDay(draft.unavailable_days, Number(b.dataset.day));
  saveDraft(); renderFit();
  $('fitDays').querySelector(`[data-day="${b.dataset.day}"]`).focus();
});
$('fitStyle').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  draft.interaction_style = draft.interaction_style === b.dataset.id ? '' : b.dataset.id;   // tap again to unselect
  saveDraft(); renderFit();
});
$('fitAccess').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  if (b.dataset.id === 'stepfree') draft.needs_step_free = !draft.needs_step_free; else draft.prefers_quieter = !draft.prefers_quieter;
  saveDraft(); renderFit();
});
$('fitNext').onclick = () => {
  if (!keepsAMeetingDay(draft.unavailable_days)) { $('fitErr').textContent = DAYS_ERROR; $('fitErr').hidden = false; return; }
  go('sc-verify');
};


/* ==========================================================
   10. SIGN-UP STEP 3: UNIVERSITY EMAIL
   ----------------------------------------------------------
   The only personal detail we need. We email a one-time code:
   entering it shows you can read that mailbox (it isn't a
   check of your enrolment). No password, no student ID.
   ========================================================== */
let codeStage = 'email';   // 'email' -> 'code' -> 'totp' (staff accounts only)

// 'maya.okafor@uni.ac.uk' -> 'Maya'
function nameFromEmail(email) {
  const name = email.split('@')[0].split(/[._\-+0-9]/)[0];
  return name ? name[0].toUpperCase() + name.slice(1) : '';
}
const emailDomainOk = email => (programme().institution.email_domains || []).includes((email.split('@')[1] || '').toLowerCase());

let nameTyped = false;
$('obEmail').addEventListener('input', () => {
  const email = $('obEmail').value.trim().toLowerCase();
  const ok = emailDomainOk(email);
  $('uniOk').hidden = !ok;
  if (ok) $('uniOkName').textContent = programme().institution.name;
  if (!nameTyped) $('obName').value = nameFromEmail(email);
  paintVerifyPictures();
});
$('obName').addEventListener('input', () => { nameTyped = true; paintVerifyPictures(); });

function paintVerifyPictures() {
  const initial = initialOf($('obName').value || $('obEmail').value);
  document.querySelectorAll('#avs [data-colour]').forEach(b => { b.textContent = initial; b.setAttribute('aria-pressed', !picture.photo && b.dataset.colour === picture.colour); });
  $('upLbl').setAttribute('aria-pressed', !!picture.photo);
  $('upLbl').style.backgroundImage = picture.photo ? `url(${picture.photo})` : '';
}

function renderVerify() {
  const p = programme();
  if (!p) return go('sc-welcome');
  draft.programme = p.slug;
  saveDraft();
  const open = p.enrolment_open;
  $('verifyClosed').hidden = open;
  $('joinBtn').disabled = !open;
  const signedIn = !!S.user;
  $('emailFld').hidden = signedIn;
  $('signedAs').hidden = !signedIn;
  if (signedIn) { $('signedAs').textContent = `Signed in as ${S.user.email}. Nobody in your group sees it.`; codeStage = 'done'; }
  else if (codeStage === 'done') codeStage = 'email';
  if (signedIn && !$('obName').value) $('obName').value = nameFromEmail(S.user.email);
  $('codeFld').hidden = codeStage !== 'code';
  $('totpFld').hidden = codeStage !== 'totp';
  $('obEmail').disabled = codeStage === 'code' || codeStage === 'totp';
  const codes = S.email_code_signin;
  $('joinBtn').textContent = codeStage === 'code' ? 'Confirm code' : codeStage === 'totp' ? 'Confirm' : (signedIn || !codes) ? 'Find my group' : 'Email me a code';
  $('verifyHint').hidden = signedIn || !codes;
  $('agreeText2').innerHTML = agreeHTML();
  paintVerifyPictures();
}
$('agreeOpen').addEventListener('click', e => { e.preventDefault(); $('agreeFold').open = true; $('agreeFold').scrollIntoView({ block: 'center' }); });

function verifyError(message) {
  $('verifyErr').hidden = !message;
  $('verifyErr').textContent = message || '';
}

function checkDetails() {
  if (!$('obName').value.trim()) return 'Tell us what your group should call you.';
  if (!keepsAMeetingDay(draft.unavailable_days)) return 'Go back one step: ' + DAYS_ERROR;
  if (!$('obAge').checked) return 'This first pilot is for students aged 18 or over. The coordinator can tell you about other options.';
  if (!$('obAgree').checked) return 'Please read and agree to how the programme works.';
  return '';
}

$('sc-verify').addEventListener('submit', async e => {
  e.preventDefault();
  if (!online()) return verifyError('You’re offline, so nothing was sent.');
  const problem = checkDetails();
  if (problem) return verifyError(problem);
  verifyError('');
  const email = $('obEmail').value.trim().toLowerCase();

  if (codeStage === 'email' && !S.email_code_signin) {
    // No emailed code: typing an approved university email signs you in (students only).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return verifyError('Use your university email.');
    const r = await post('/api/auth/email/', { email });
    if (!r.ok) return verifyError((r.data && r.data.error) || 'That didn’t work. Please try again.');
    S = r.data; CSRF = S.csrf || CSRF;
    codeStage = 'done';
    if (S.participant) { clearDraft(); go('sc-week'); return; }   // already joined earlier
    await join();
    return;
  }
  if (codeStage === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return verifyError('Use your university email.');
    const start = await post('/api/auth/start/', { email });
    if (!start.ok) return verifyError((start.data && start.data.error) || 'That didn’t work. Please try again.');
    const req = await post('/_allauth/browser/v1/auth/code/request', { email });
    if (req.status === 429) return verifyError('Too many codes requested. Please wait a few minutes.');
    if (!(req.status === 401 || req.ok)) return verifyError('We couldn’t send a code. Please try again.');
    codeStage = 'code';
    $('codeHint').textContent = `We’ve sent a code to ${email}.` + (S.show_test_info && !S.email_is_real ? ' (Test environment: it’s written to var/sent-emails/, not delivered.)' : '');
    renderVerify();
    $('obCode').focus();
    return;
  }
  if (codeStage === 'code') {
    const r = await post('/_allauth/browser/v1/auth/code/confirm', { code: $('obCode').value.trim().toUpperCase() });
    if (r.status === 401 && JSON.stringify(r.data || {}).includes('mfa_authenticate')) { codeStage = 'totp'; renderVerify(); $('obTotp').focus(); return; }
    if (!r.ok) return verifyError(r.status === 400 ? 'That code isn’t right, or it has expired. Check the email and try again.' : 'That didn’t work. Ask for a new code.');
  }
  if (codeStage === 'totp') {
    const r = await post('/_allauth/browser/v1/auth/2fa/authenticate', { code: $('obTotp').value.trim() });
    if (!r.ok) return verifyError('That authenticator code isn’t right.');
  }
  // Signed in: join the waiting list.
  await fetchState();
  codeStage = 'done';
  await join();
});

async function join() {
  go('sc-match');
  $('obWait').hidden = false;
  $('obDone').hidden = true;
  const ok = await send('enrol', {
    programme: draft.programme, invite: draft.invite, preferred_name: $('obName').value.trim(), unavailable_days: draft.unavailable_days,
    interest_ids: draft.interest_ids, interaction_style: draft.interaction_style, needs_step_free: draft.needs_step_free,
    prefers_quieter: draft.prefers_quieter, email_reminders: true, age_18_plus: true, agreed: true,
  });
  if (!ok) {
    if (S && S.participant) { clearDraft(); go('sc-week'); return; }   // already enrolled
    go('sc-verify');
    return;
  }
  clearDraft();
  showJoined();
}

// ---- Your picture (optional, stays on this phone) ----
function selectColour(c) {
  picture.colour = c; picture.photo = null;
  store('regulars-colour', c); store('regulars-photo', null);
}
['avs', 'meAvs'].forEach(boxId => $(boxId).addEventListener('click', e => {
  const b = e.target.closest('button[data-colour]'); if (!b) return;
  selectColour(b.dataset.colour);
  if (boxId === 'avs') paintVerifyPictures(); else renderProfile();
  updateTopBar();
}));

// Uploading a photo (the "+" button). It is shrunk and kept on this phone only.
function photoPicker(labelId, inputId, whenLoaded) {
  $(labelId).addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $(inputId).click(); } });
  $(inputId).addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file || !/^image\//.test(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 160, canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const scale = Math.max(size / img.width, size / img.height);
        canvas.getContext('2d').drawImage(img, (size - img.width * scale) / 2, (size - img.height * scale) / 2, img.width * scale, img.height * scale);
        picture.photo = canvas.toDataURL('image/jpeg', 0.8);
        store('regulars-photo', picture.photo);
        whenLoaded();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
photoPicker('upLbl', 'obPhoto', () => { paintVerifyPictures(); updateTopBar(); });
photoPicker('meUpLbl', 'mePhoto', () => { renderProfile(); updateTopBar(); });


/* ==========================================================
   11. JOINING THE WAITING LIST
   ----------------------------------------------------------
   No pretend matching. A coordinator forms groups when
   enough people can make the same time; you'll be offered a
   place and choose whether to accept.
   ========================================================== */
function showJoined() {
  const p = S.participant;
  const prog = programme();
  $('obWait').hidden = true;
  $('obDone').hidden = false;
  const waiting = p.status === 'awaiting_group';
  $('obTitle').textContent = waiting ? 'You’re on the waiting list' : p.status === 'awaiting_verification' ? 'Almost there' : 'You’re in';
  $('obSub').textContent = waiting ? `A group starts when at least ${prog.min_group_size} people can make the same weekly time and a host is free. We won’t put you in an empty group.`
    : p.status === 'awaiting_verification' ? 'Your email isn’t on the list of approved university mailboxes, so the coordinator will check another way and contact you.' : '';
  $('obNext').innerHTML = [
    prog.next_matching_review ? `Groups are next reviewed on ${esc(prog.next_matching_review)}.` : 'The coordinator reviews the waiting list regularly.',
    'When a group is ready you’ll get an email offering a place. It’s only yours if you accept.',
    'Want to say hello first? You can meet a host while you wait.',
  ].map(t => `<li>${t}</li>`).join('');
  const ruledOut = p.unavailable_days.map(d => WEEK[d]);
  const likes = prog.activities.filter(a => p.interest_ids.includes(a.id)).map(a => a.name);
  const style = prog.styles.find(s => s.id === p.interaction_style);
  $('obWhy').innerHTML = [likes.length ? `What you’d fancy: ${listWords(likes)}` : 'Open to anything', ruledOut.length ? `Days that never work: ${listWords(ruledOut)}` : 'Any day could work', style ? `How much chat: ${style.label}` : null]
    .filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('');
  const heading = $('obDone').querySelector('h2'); heading.tabIndex = -1; heading.focus();
}
$('enter').onclick = () => go('sc-week');


/* ==========================================================
   12. MEET A HOST FIRST
   ========================================================== */
function renderIntro() {
  const p = programme();
  if (!p) return go('sc-welcome');
  const existing = (S.participant && S.participant.intro) || S.intro;
  const body = $('introBody');
  if (!S.user) {
    body.innerHTML = `<div class="card"><p>To arrange a hello we need a way to reach you. Choose what you’d fancy and your times, then sign in with your university email on the last step – you can ask for an introduction from there.</p>
      <button type="button" class="btn primary" data-go="sc-pick">Choose what you’d fancy</button></div>`;
    return;
  }
  if (existing) {
    body.innerHTML = `<div class="card"><span class="label">Your introduction</span><b>${esc(existing.status_label)}</b>
      ${existing.when ? `<p>${esc(existing.when)} · about 15 minutes</p>` : ''}${existing.arranged ? `<p>${esc(existing.arranged)}</p>` : ''}
      ${existing.status === 'requested' ? `<p class="hint">Nobody has arranged a time yet. The coordinator will contact you within: “${esc(existing.contact_window)}”.${p.monitoring_hours ? ' ' + esc(p.monitoring_hours) + '.' : ''}</p>` : ''}</div>
      <button type="button" class="btn primary" data-go="${S.participant ? 'sc-week' : 'sc-pick'}">${S.participant ? 'Back to my week' : 'Look at joining'}</button>`;
    return;
  }
  const slots = p.intro_slots.map(s => `<label class="check-row"><input type="radio" name="introSlot" value="${s.id}"> <span>${esc(s.label)}</span></label>`).join('');
  body.innerHTML = `<div class="fld"><label for="introName">What should we call you?</label><input id="introName" maxlength="40" value="${esc((S.participant && S.participant.preferred_name) || nameFromEmail(S.user.email))}"></div>
    ${slots ? `<fieldset class="q"><legend>Pick a time (about 15 minutes)</legend>${slots}</fieldset>` : '<p class="hint">No introduction times are open right now.</p>'}
    <div class="fld"><label for="introWindow">Or tell us when you’re happy to be contacted</label><input id="introWindow" maxlength="200" placeholder="e.g. weekdays 12–2pm by email"></div>
    <p class="err" id="introErr" hidden></p>
    <button class="btn primary" type="submit">Request an introduction</button>`;
}
$('sc-intro').addEventListener('submit', async e => {
  e.preventDefault();
  const slot = document.querySelector('input[name="introSlot"]:checked');
  const name = ($('introName') || {}).value || '';
  const windowText = ($('introWindow') || {}).value || '';
  const problem = !name.trim() ? 'Tell us what to call you.' : (!slot && !windowText.trim()) ? 'Choose a time, or tell us when you’re happy to be contacted.' : '';
  if ($('introErr')) { $('introErr').hidden = !problem; $('introErr').textContent = problem; }
  if (problem) return;
  if (await send('intro', { programme: programme().slug, invite: draft.invite, preferred_name: name, slot_id: slot ? slot.value : null, contact_window: windowText })) renderIntro();
});


/* ==========================================================
   13. THIS WEEK
   ----------------------------------------------------------
   The main screen answers three questions straight away:
   what are we doing, when and where, and what do I do next.
   ========================================================== */
const STATUS_CARDS = {
  awaiting_verification: () => `<div class="card warn"><b>Waiting for an eligibility check</b><p>Your email isn’t on the list of approved university mailboxes, so the coordinator needs to check another way. You don’t need to do anything; they’ll contact you.</p></div>`,
  awaiting_group: p => {
    const prog = programme();
    const ruledOut = p.unavailable_days.map(d => WEEK[d]);
    return `<div class="card"><span class="label">Waiting list</span><b>Waiting for a suitable group</b>
      <p>On the waiting list since ${esc(p.waiting_since)}. A group forms when at least ${prog.min_group_size} people can make the same weekly time and a host is free. We won’t put you in an empty group.</p>
      <p>${prog.next_matching_review ? `<b>Next review of groups:</b> ${esc(prog.next_matching_review)}.` : 'The coordinator hasn’t set the next review date yet.'}</p>
      <p class="hint">${ruledOut.length ? `Days you ruled out: ${esc(listWords(ruledOut))}.` : 'You said any day could work.'} Fewer ruled-out days make a match more likely – change them in your profile.</p>
      ${p.intro ? '' : '<button class="btn lime" data-go="sc-intro">Meet a host while you wait</button>'}</div>`;
  },
  withdrawn: () => `<div class="card"><b>You’ve left Regulars</b><p>No more reminders. If you’d like to come back, you’ll go on the waiting list – your old group may not have space.</p><button class="btn primary" data-act="rejoin">Rejoin the waiting list</button></div>`,
};

function offerHTML(o) {
  return `<section class="plan" aria-labelledby="offer-h">
    <span class="label">You’ve been offered a place</span>
    <h2 id="offer-h">${esc(o.group)}</h2>
    <div class="pwhen"><b>${esc(o.slot.day)}s, ${esc(o.slot.time)}</b><span>${esc(o.slot.venue.name)}</span><small>Meeting point: ${esc(o.slot.venue.meeting_point)}${o.host ? ` · Host: ${esc(o.host.name)}` : ''}</small></div>
    <ul class="facts on-accent"><li>${o.accepted} of at least ${o.minimum} said yes so far</li>${o.options.map(a => `<li>${esc(a.name)}</li>`).join('')}<li>Free</li></ul>
    <p class="msg">${o.accepted < o.minimum ? `The group starts once at least ${o.minimum} people say yes; the first date is confirmed then. ` : ''}Please reply by ${esc(o.expires)}.</p>
    <div class="row"><button class="btn lime" data-act="offer" data-answer="accept" data-id="${o.membership_id}">I’m in</button>
    <button class="btn ghost" data-go="sc-choices">Not this one</button></div>
    ${voteLine()}</section>`;
}

function voteLine() {
  const v = S.participant.offer_choices && S.participant.offer_choices.vote;
  return v ? '' : '<p class="msg">Not the right time? You can look for another group, ask this group to move, or skip it.</p>';
}

/* ---- The group question: timer and live answers (same card as the original prototype) ----
   The clock counts down to the real closing time from the server. Dots show how many of the
   group have answered (yes = filled, no = grey). Who answered what is never shown. */
let serverOffset = 0;   // server clock minus this device's clock
// One simple card: timer, the question, dots (yes = filled, no = grey) and Yes/No for members.
// When it's decided: the result and a button back to the meetup.
function voteCardHTML(v, { member = false, asker = false } = {}) {
  if (v.server_now_iso) serverOffset = new Date(v.server_now_iso) - Date.now();
  if (v.status !== 'open') {
    const passed = v.status === 'passed';
    const button = asker && !passed
      ? '<button class="btn primary" data-go="sc-choices">See your options</button>'
      : '<button class="btn primary" data-act="see-meetup">See the meetup</button>';
    return `<div class="card vote done" data-vote="${v.id}"><span class="label">Group vote</span>
      <p class="v-head">${passed ? `✓ Moving to ${esc(v.to_short)}` : v.scope === 'session' ? 'This week stays as planned' : `Staying ${esc(v.from_short)}`}</p>${button}</div>`;
  }
  const dots = Array.from({ length: v.eligible }, (_, i) => `<i class="${i < v.yes ? 'on' : i < v.yes + v.no ? 'no' : ''}"></i>`).join('');
  const buttons = member ? `<div class="row">
      <button class="btn ${v.my_answer === true ? 'primary' : 'ghost'}" data-act="vote-yes" data-id="${v.id}" aria-pressed="${v.my_answer === true}">Yes</button>
      <button class="btn ${v.my_answer === false ? 'primary' : 'ghost'}" data-act="vote-no" data-id="${v.id}" aria-pressed="${v.my_answer === false}">No</button></div>` : '';
  return `<div class="card vote" data-vote="${v.id}">
    <div class="v-top"><span class="label">Group vote</span><span class="v-clock" data-closes="${esc(v.closes_iso)}" data-opened="${esc(v.opened_iso)}">--:--:--</span></div>
    <div class="v-bar" aria-hidden="true"><i data-bar></i></div>
    <p class="v-head">${v.scope === 'session' ? 'Move this week’s meetup' : 'Move the group'} to ${esc(v.to_short)}?</p>
    <div class="v-row"><span class="v-dots" aria-hidden="true">${dots}</span><span>${v.yes} yes · ${v.needed} needed</span></div>
    ${buttons}</div>`;
}

function formatClock(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map(n => String(n).padStart(2, '0')).join(':');
}

let refreshingVote = false;
function tickVotes() {
  const now = Date.now() + serverOffset;
  document.querySelectorAll('[data-starts]').forEach(el => {
    const starts = new Date(el.dataset.starts).getTime(), ends = new Date(el.dataset.ends).getTime();
    const mins = Math.ceil((starts - now) / 60000);
    el.textContent = now >= ends ? 'Finished' : now >= starts ? 'Happening now'
      : mins >= 60 ? `Starts in ${Math.floor(mins / 60)} h ${mins % 60} min` : `Starts in ${mins} min`;
  });
  document.querySelectorAll('[data-closes]').forEach(el => {
    const closes = new Date(el.dataset.closes).getTime(), opened = new Date(el.dataset.opened).getTime();
    const left = closes - now;
    el.textContent = formatClock(left);
    const bar = el.closest('.vote').querySelector('[data-bar]');
    if (bar) bar.style.width = Math.max(0, Math.min(100, left / (closes - opened) * 100)) + '%';
    if (left <= 0 && !refreshingVote) { refreshingVote = true; refreshFromServer().finally(() => { refreshingVote = false; }); }
  });
}
setInterval(tickVotes, 1000);

function hasOpenVote() {
  const p = S && S.participant;
  if (!p) return false;
  const mine = p.offer_choices && p.offer_choices.vote;
  return !!((mine && mine.status === 'open') || (p.group && p.group.time_vote));
}
async function refreshFromServer() {
  if (busy || !online()) return;
  try { await fetchState(); applyProgramme(); if (!['sc-verify', 'sc-ask', 'sc-intro'].includes(currentScreen)) { rerender(); tickVotes(); } } catch (e) {}
}
// While a vote is open, pick up the group's answers as they come in.
setInterval(() => { if (document.visibilityState === 'visible' && hasOpenVote()) refreshFromServer(); }, 8000);

// The option that goes ahead: decided 24 hours before; until then, most preferred (a tie keeps the first).
function leading(s) {
  if (s.activity) return s.activity;
  const [first, second] = s.options;
  return second && second.votes > first.votes ? second : first;
}

function renderWeek() {
  const p = S.participant;
  const prog = programme();
  $('hello').textContent = p.preferred_name ? `Hi ${p.preferred_name}` : 'Hi there';
  $('testNote').hidden = !(S.show_test_info && prog.is_test);
  const s = p.session;
  const inGroup = !!p.group && (p.status === 'active' || p.status === 'paused');
  let card = '';
  if (STATUS_CARDS[p.status]) card = STATUS_CARDS[p.status](p);
  if (p.status === 'offered' && p.offer) {
    card = offerHTML(p.offer);
    const mine = p.offer_choices && p.offer_choices.vote;
    if (mine) card += voteCardHTML(mine, { asker: true });
  }
  if (p.status === 'paused' && p.paused_until) card = `<div class="card warn"><b>Taking a break until ${esc(p.paused_until)}</b><p>${p.group ? 'Your place is kept and reminders are off.' : 'You’re not being matched to a group during the break. Your place on the waiting list is kept.'}</p><button class="btn primary" data-act="resume">Come back now</button></div>`;
  if (p.status === 'paused' && !p.paused_until && !p.group) card = `<div class="card"><b>You don’t have a group at the moment</b><p>Your place went to someone waiting after we didn’t hear back. You can come back any time; your old group may not have space.</p><button class="btn primary" data-act="rejoin">Rejoin the waiting list</button></div>`;
  if (inGroup && p.group.status === 'forming') card += `<div class="card"><b>Your group is forming</b><p>${p.group.accepted} of at least ${p.group.minimum} people have said yes. Your first meetup date is confirmed once the group reaches ${p.group.minimum}.</p></div>`;
  const cycleDone = p.cycle && p.cycle.week >= p.cycle.weeks;
  if (inGroup && p.group.status !== 'forming' && !s) card += cycleDone
    ? `<div class="card"><b>That was your group’s last meetup this term</b><p>Thanks for coming along, whenever you could.</p></div>`
    : '<div class="card"><b>No more meetups scheduled</b><p>There’s nothing else in the calendar for your group.</p></div>';
  const tv = inGroup && p.group.time_vote;
  if (tv) card += tv.status === 'open'
    ? `<div class="card vote-mini"><div><span class="label">Group vote</span><b>Move ${tv.scope === 'session' ? 'this week’s meetup' : 'the group'} to ${esc(tv.to_short)}?</b><small class="muted">${tv.yes} yes · ${tv.needed} needed</small></div><button class="minibtn" data-go="sc-vote">${tv.my_answer === null && !tv.asked_by_me ? 'Vote' : 'Open'}</button></div>`
    : voteCardHTML(tv, { member: false });
  if (inGroup && p.group.day_conflict) card += `<div class="card warn"><b>Your group now meets ${esc(p.group.slot.day)}s at ${esc(p.group.slot.time)}</b>
    <p>That’s a day you said never works. You keep your place – or, with no penalty:</p>
    <div class="row"><button class="btn ghost" data-go="sc-choices">Find another group</button><button class="btn ghost" data-act="waiting">Back to the waiting list (same place)</button></div></div>`;
  if (p.release_notice) card += '<div class="card warn"><b>Would you like to keep your place?</b><p>We haven’t seen you for a while. That’s fine – just say whether you’re coming next time and your place is kept.</p></div>';
  if (p.programme_ending) card += `<div class="card soft-note"><b>The programme is ending soon</b><p>Want to stay in touch with people from your group? You can share your email with others who also choose to.</p><a class="linkout" href="${p.links.stay_in_touch}">Stay in touch (optional) ↗</a>${p.links.feedback ? ` <a class="linkout" href="${p.links.feedback}">Three short feedback questions ↗</a>` : ''}</div>`;
  if (p.intro && p.status !== 'awaiting_group') card += `<div class="card soft-note"><b>Your introduction:</b> ${esc(p.intro.status_label)}${p.intro.when ? ' – ' + esc(p.intro.when) : ''}</div>`;
  $('statusCard').innerHTML = card;
  renderCheckIn(p);
  renderNextStep(p);
  tickVotes();

  const show = !!(s && inGroup);
  $('helloSub').textContent = show ? (p.status === 'paused' ? 'You’re taking a break. Your place is kept.' : s.first_time ? 'Your first meetup is this week. Here’s everything you need.' : 'Here’s your week.') : '';
  ['planHero', 'beforeSec'].forEach(id => $(id).hidden = !show);
  $('otherOpt').hidden = !show || s.status === 'cancelled' || !!s.activity || s.options.length < 2;
  $('remindCard').hidden = !p.group;
  $('remSwitch').checked = p.email_reminders;
  renderWent(p);
  if (!show) { $('buddyCard').hidden = true; $('altCard').hidden = true; $('todayCard').innerHTML = ''; return; }
  renderToday(s, p);
  renderPlan(s, p);
  renderBefore(s, p);
  renderOtherOption(s);
  renderBuddy(s);
  if (s.rsvp !== 'not_going') $('altCard').hidden = true;
  $('icsLink').hidden = s.status === 'cancelled';
  $('icsLink').href = s.ics_url;
}

function renderPlan(s, p) {
  const cancelled = s.status === 'cancelled';
  const plan = leading(s);
  $('planLabel').textContent = s.started ? 'Happening now' : s.first_time ? `Week ${s.week} · Your first meetup` : `Week ${s.week} · This week`;
  $('planIcon').textContent = cancelled ? '' : iconFor(plan.name);
  $('planName').textContent = cancelled ? 'Cancelled this week' : plan.name;
  $('planWhen').textContent = `${s.start.day} ${s.start.date}, ${s.start.time}`;
  $('planWhere').textContent = cancelled ? s.cancelled_reason : s.venue.name;
  $('planMeet').textContent = cancelled ? (s.alternative ? `Instead: ${s.alternative}` : 'Your place in the group isn’t affected.')
    : `Meeting point: ${s.venue.meeting_point}` + (s.host ? ` · Host: ${s.host.name}` : ' · Host to be confirmed');
  $('planFacts').innerHTML = cancelled ? '' : ['Free', `Up to ${p.group.capacity} people`, s.host ? 'A host says hi' : null, plan.conversation_optional ? 'Quiet is fine' : null]
    .filter(Boolean).map(f => `<li>${f}</li>`).join('');
  $('planButtons').hidden = cancelled || s.started;
  $('in').setAttribute('aria-pressed', s.rsvp === 'going');
  $('out').setAttribute('aria-pressed', s.rsvp === 'not_going');
  $('goingN').textContent = s.going_count;
  $('goingOf').textContent = p.group.members.length;
  const names = p.group.members.filter(m => m.coming === 'going').map(m => m.is_me ? 'you' : m.name);
  const nameLine = names.length > 3 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} others` : listWords(names);
  $('goingNames').textContent = names.length ? nameLine.charAt(0).toUpperCase() + nameLine.slice(1) : 'Nobody has said yet';
  $('weekFaces').innerHTML = p.group.members.filter(m => m.coming === 'going').map(m => m.is_me
    ? '<span class="me" role="img" aria-label="You" data-me></span>'
    : `<span role="img" aria-label="${esc(m.name)}">${esc(initialOf(m.name))}</span>`).join('');
  const me = $('weekFaces').querySelector('[data-me]');
  if (me) paintPicture(me, initialOf(p.preferred_name));
}

// "I'm in" or "Can't make it". No limits, no warnings, no reason needed.
async function reply(answer) {
  const s = S.participant.session;
  if (!await send('rsvp', { session_id: s.id, response: answer })) return;
  renderWeek();
  if (answer === 'going') { $('msg').textContent = ''; $('altCard').hidden = true; showGoingCard(); return; }
  $('msg').textContent = 'No problem. Your group will see “Not this week”. No reason needed.';
  $('altCard').hidden = false;
}
$('in').onclick = () => reply('going');
$('out').onclick = () => reply('not_going');
$('altSkip').onclick = () => { $('altCard').hidden = true; $('msg').textContent = 'Okay. Your group knows you can’t come this time. See you next week.'; };

// The full-screen card that shows when you say "I'm in". Tap it to close.
function showGoingCard() {
  const s = S.participant.session;
  $('gTime').innerHTML = `${esc(s.start.day)}<br>${esc(s.start.time)}`;
  $('gPlace').textContent = `${s.venue.name} · ${s.venue.meeting_point}`;
  $('gCount').textContent = `${s.going_count} of ${S.participant.group.members.length}`;
  $('view').scrollTop = 0;
  $('going').hidden = false;
  $('appbar').hidden = true;
  $('tabs').hidden = true;
  $('going').focus();
}
$('going').onclick = () => {
  $('going').hidden = true; $('appbar').hidden = false; $('tabs').hidden = false;
  $('buddyCard').hidden ? $('in').focus() : $('buddyCard').scrollIntoView({ block: 'center' });
};

let howFollowUp = false;   // after "Not for me": offer a private chat with the coordinator
function renderWent(p) {
  const card = $('wentCard');
  const a = p.ask_how;
  card.classList.add('how');
  if (!a && howFollowUp) {
    card.hidden = false;
    card.innerHTML = `<b>Sorry it wasn’t right</b><p class="hint">If you’d like, tell the coordinator privately – a different group or time might suit you better.</p>
      <div class="row"><button class="btn primary" data-ask="change_group">Talk privately</button><button class="btn ghost" data-act="how-dismiss">No thanks</button></div>`;
    return;
  }
  card.hidden = !a;
  if (a) card.innerHTML = `<b>How was ${esc(a.day)}?</b>
    <div class="row"><button class="btn ghost" data-act="how" data-value="glad">Glad I went</button><button class="btn ghost" data-act="how" data-value="okay">Okay</button>
    <button class="btn ghost" data-act="how" data-value="not_for_me">Not for me</button><button class="btn ghost" data-act="how" data-value="didnt_go">I didn’t go</button></div>
    <p class="hint">Only the coordinator sees totals – never who said what.</p>`;
}


/* ==========================================================
   13b. NOT THIS ONE
   ----------------------------------------------------------
   1. Another group with a place on a day you kept.
   2. Ask this group to move: more than half of the group must
      say yes within 24 hours (no reply = keep). If yes, the
      group moves and you're in.
   3. If not, look for one more group (1 again).
   4. If there's none: skip it. Your first 2 skips keep your
      place on the waiting list; after that, a skip moves you to
      the back.
   ========================================================== */
function groupRow(g, act, label) {
  return `<div class="alt"><div class="ex-head"><span aria-hidden="true">👥</span><div><b>${esc(g.slot.day)}s, ${esc(g.slot.time)}</b><small>${esc(g.slot.venue.name)} · ${g.people} of ${g.capacity} places taken</small></div></div>
    <button class="minibtn" data-act="${act}" data-id="${g.group_id}">${label}</button></div>`;
}

function renderChoices() {
  const p = S.participant;
  const o = p.offer, ch = p.offer_choices;
  // Member whose group moved to a day they ruled out
  if (!o && p.group && p.group.day_conflict) {
    $('chTitle').textContent = 'Find another group';
    $('chSub').textContent = `Your group now meets ${p.group.slot.day}s at ${p.group.slot.time}. You keep your place unless you choose to move.`;
    const alts = p.group.day_conflict.alternatives;
    $('chBody').innerHTML = `<div class="card"><span class="label">Groups with a place on your days</span>${alts.length ? alts.map(g => groupRow(g, 'move', 'Move here')).join('') : '<p class="hint">No other group has a place on the days you kept right now.</p>'}</div>
      <div class="card"><span class="label">Or</span><p>Go back to the waiting list in your original place. You’ll be offered a group when one fits.</p><button class="btn ghost" data-act="waiting">Back to the waiting list</button></div>`;
    return;
  }
  if (!o) return go('sc-week');
  $('chTitle').textContent = 'This group doesn’t work for you?';
  $('chSub').textContent = `${o.group}: ${o.slot.day}s, ${o.slot.time}. Here’s what you can do instead.`;
  const v = ch.vote;
  const voteOpen = v && v.status === 'open';
  let html = '';
  // 1 (and 3 after a "no"): another group
  html += `<div class="card"><span class="label">${v && v.status === 'failed' ? 'One more look · another group' : '1 · Another group'}</span>
    ${ch.alternatives.length ? ch.alternatives.map(g => groupRow(g, 'switch', 'Take this place')).join('') : '<p class="hint">No other group has a free place on the days you kept right now.</p>'}</div>`;
  // 2: ask the group to move – once asked, the timer and the group's answers
  if (v && !voteOpen) html += voteCardHTML(v, { asker: true });
  if (!voteOpen) {
    html += `<div class="card"><span class="label">2 · Ask this group to move${v ? ' (ask again)' : ''}</span>`;
    html += ch.time_options.length
      ? '<p>Pick a time that works for you. If more than half of the group say yes within 24 hours, the group moves and you’re in.</p>'
        + ch.time_options.map(t => `<div class="alt"><b>${esc(t.label)}</b><button class="minibtn" data-act="propose" data-id="${t.slot_id}">Ask the group</button></div>`).join('')
      : '<p class="hint">There’s no other approved time on your days with the host free.</p>';
    html += '</div>';
  }
  // 4: skip
  const left = p.skips_allowed - p.skips_used;
  html += `<div class="card"><span class="label">3 · Skip this offer</span>
    <p>${left > 0 ? `You stay on the waiting list in the same place. This uses ${p.skips_used + 1 === 1 ? 'the first' : 'the second'} of your ${p.skips_allowed} skips.` : `You’ve used your ${p.skips_allowed} skips, so skipping again moves you to the back of the waiting list.`}</p>
    <button class="btn ghost" data-act="offer" data-answer="decline" data-id="${o.membership_id}">Skip this offer</button></div>`;
  // While the group is deciding, the timer and answers come first.
  if (voteOpen) html = voteCardHTML(v, { asker: true }) + html;
  $('chBody').innerHTML = html;
  tickVotes();
}

/* ==========================================================
   13c. VOTE TAB
   ----------------------------------------------------------
   Everything the group decides together: the open vote (timer,
   answers, Yes/No) and, after "Can't make it", suggesting
   another time for that week's meetup. More than half of the
   group must say yes within 24 hours; no reply = keep.
   ========================================================== */
function renderVote() {
  const p = S.participant;
  const tv = p.group && p.group.time_vote;
  const mine = p.offer_choices && p.offer_choices.vote;
  let html = '';
  if (tv) html += voteCardHTML(tv, { member: tv.status === 'open' && !tv.asked_by_me });
  else if (mine) html += voteCardHTML(mine, { asker: true });
  const wc = p.week_change;
  if (wc) {
    html += `<div class="card"><span class="label">Can’t make this week</span><b>Suggest another time for this week</b>
      <p class="hint">Only this week’s meetup moves, and only if more than half of the group say yes within 24 hours.</p>`
      + (wc.options.length
        ? wc.options.map(o => `<div class="alt"><b>${esc(o.label)}</b><button class="minibtn" data-act="week-propose" data-session="${wc.session_id}" data-id="${o.slot_id}">Suggest</button></div>`).join('')
        : '<p class="hint">There’s no other approved time this week that works.</p>')
      + '</div>';
  }
  if (!html) {
    const s = p.session;
    html = `<div class="card"><b>No votes right now</b><p class="hint">${s && s.status !== 'cancelled' && !s.started
      ? 'Can’t make this week’s meetup? Tap “Can’t make it” on This week, then suggest another time here.'
      : 'When your group decides something together, it shows up here.'}</p></div>`;
  }
  $('voteBody').innerHTML = html;
  tickVotes();
}

// A red dot on the Vote tab when there's a vote you haven't answered.
function updateVoteDot() {
  const tv = S && S.participant && S.participant.group && S.participant.group.time_vote;
  $('voteDot').hidden = !(tv && tv.status === 'open' && tv.my_answer === null && !tv.asked_by_me);
}

/* ==========================================================
   13d. ONE CLEAR NEXT STEP, ON THE DAY
   13e. END OF THE CYCLE: AGAIN?
   ========================================================== */
// One line at the top of This week: what to do now, with at most one button.
function renderNextStep(p) {
  const s = p.session;
  const tv = p.group && p.group.time_vote;
  let text = '', small = '', button = '';
  if (p.status === 'offered') { text = 'Accept your place'; small = 'Or tap “Not this one” for other options.'; button = '<button class="minibtn" data-act="to-top">See offer</button>'; }
  else if (tv && tv.status === 'open' && tv.my_answer === null && !tv.asked_by_me) { text = 'Your group is voting'; small = `Move ${tv.scope === 'session' ? 'this week’s meetup' : 'the group'} to ${tv.to_short}?`; button = '<button class="minibtn" data-go="sc-vote">Vote</button>'; }
  else if (p.ask_how || howFollowUp) { /* the “How was it?” card right below is the next step */ }
  else if (p.status === 'paused') { text = p.paused_until ? `You’re taking a break until ${p.paused_until}` : 'You don’t have a group right now'; button = p.paused_until ? '<button class="minibtn" data-act="resume">Come back</button>' : '<button class="minibtn" data-act="rejoin">Rejoin</button>'; }
  else if (p.status === 'awaiting_group') { text = 'Nothing to do – you’re on the waiting list'; small = 'We’ll email you when a group is ready.'; }
  else if (p.status === 'awaiting_verification') { text = 'Nothing to do yet'; small = 'The coordinator will check your details.'; }
  else if (s && s.status !== 'cancelled' && !s.started) {
    const when = `${s.start.day} ${s.start.time}`;
    if (!s.rsvp) { text = `Are you coming ${s.is_today ? 'today' : 'on ' + s.start.day}?`; small = when; button = '<button class="minibtn" data-act="to-plan">Reply</button>'; }
    else if (s.rsvp === 'going') { text = `All set – see you ${s.is_today ? 'today at ' + s.start.time : when}`; small = s.host ? `${s.host.name} will be there.` : ''; }
    else { text = `You’re skipping ${s.start.day}`; small = 'See you next week.'; }
  }
  $('nextStep').innerHTML = text ? `<div class="next" role="status"><div><b>${esc(text)}</b>${small ? `<small>${esc(small)}</small>` : ''}</div>${button}</div>` : '';
}

// On meetup day: countdown, where, how to recognise the host, and two one-tap messages for the host.
function renderToday(s, p) {
  const box = $('todayCard');
  if (!s.is_today || s.status === 'cancelled' || s.rsvp === 'not_going') { box.innerHTML = ''; return; }
  if (s.server_now_iso) serverOffset = new Date(s.server_now_iso) - Date.now();
  const sent = s.my_ping === 'here' ? 'Your host can see you’re here.' : s.my_ping === 'late' ? 'Your host knows you’re running late.' : '';
  box.innerHTML = `<section class="today" aria-labelledby="today-h">
    <span class="label">Today</span>
    <p class="t-count" id="today-h" data-starts="${esc(s.start.iso)}" data-ends="${esc(s.end.iso)}">${esc(s.start.time)}</p>
    <p><b>${esc(s.venue.meeting_point)}</b> · ${esc(s.venue.name)}${s.host ? `<br>Look for ${esc(s.host.name)}${s.host.recognise ? ` – ${esc(s.host.recognise)}` : ''}` : ''}</p>
    <div class="row">
      <a class="btn ghost" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.venue.name + ", " + s.venue.area)}" target="_blank" rel="noopener">Directions</a>
      ${s.ping_open ? `<button class="btn primary" data-act="here">I’m here</button>` : `<a class="btn primary" href="${s.ics_url}">Add to calendar</a>`}
    </div>
    ${s.ping_open ? `<button class="btn ghost" data-act="late">Running 10 min late</button>` : ''}
    ${sent ? `<p class="sent" role="status">✓ ${sent}</p>` : ''}
  </section>`;
  tickVotes();
}

/* ==========================================================
   13e. END OF THE CYCLE: AGAIN?
   ----------------------------------------------------------
   After week 8, a private question: who would you happily be
   in a group with again? Answers are only used when the next
   term's groups are formed. Nobody is told who said what, and
   there is no "it's a match" moment: if two people both say
   yes, they're just more likely to be grouped together.
   ========================================================== */
const againOpen = p => !!(p && p.group && p.cycle && p.cycle.again_open);
let againDraft = null;   // your answers while the screen is open
let againSaved = false;

// Cards at the top of This week for the two check-ins: the 2-week taster and "again?".
function renderCheckIn(p) {
  const c = p.cycle;
  let html = '';
  againDraft = null; againSaved = false;   // the again screen starts from what's saved
  if (againOpen(p)) html = c.again_answered
    ? `<div class="card soft-note"><b>Thanks. We’ll use this when we form next term’s groups.</b><p class="hint">You can change your answers until the end of the week.</p><button class="minibtn ghostmini selfstart" data-go="sc-again">Change my answers</button></div>`
    : `<section class="card check" aria-labelledby="again-h"><span class="label">End of the ${esc(c.weeks)} weeks</span>
      <p class="v-head" id="again-h">That’s the ${esc(c.weeks)} weeks. Fancy doing this again with any of them?</p>
      <p class="hint">Only you see your answers.</p>
      <button class="btn primary" data-go="sc-again">Have a think</button></section>`;
  $('checkCard').innerHTML = html;
}

function renderAgain() {
  const p = S.participant, c = p.cycle;
  if (!againDraft) {
    const mine = c.my_again || {};
    againDraft = { keep_group: !!mine.keep_group, fresh_group: !!mine.fresh_group, again_with: (mine.again_with || []).slice() };
  }
  $('againMembers').innerHTML = p.group.members.filter(m => !m.is_me).map(m =>
    `<label class="sw"><span class="sw-who"><span class="av" aria-hidden="true">${esc(initialOf(m.name))}</span><span><b>${esc(m.name)}</b><small>Happy to be in a group with them again</small></span></span>
    <input type="checkbox" role="switch" data-member="${esc(m.id)}"${againDraft.again_with.includes(m.id) ? ' checked' : ''}></label>`).join('');
  $('againNext').innerHTML = choiceBtn('tier', 'keep_group', 'Keep this group going as it is', 'The same people, if enough of you would like that', againDraft.keep_group)
    + choiceBtn('tier', 'fresh_group', 'I’d like a fresh group next time', 'New faces, same easy things', againDraft.fresh_group);
  $('againDone').textContent = againSaved ? 'Thanks. We’ll use this when we form next term’s groups.' : '';
}
$('againMembers').addEventListener('change', e => {
  const id = Number(e.target.dataset.member);
  againDraft.again_with = e.target.checked ? [...againDraft.again_with, id] : againDraft.again_with.filter(x => x !== id);
});
$('againNext').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  const key = b.dataset.id, other = key === 'keep_group' ? 'fresh_group' : 'keep_group';
  againDraft[key] = !againDraft[key];   // tap again to unselect
  if (againDraft[key]) againDraft[other] = false;   // one or the other, or neither
  renderAgain();
  $('againNext').querySelector(`[data-id="${key}"]`).focus();
});
$('sc-again').addEventListener('submit', async e => {
  e.preventDefault();
  if (!await send('again', againDraft)) return;
  againSaved = true;
  renderAgain();
});


/* ==========================================================
   14. BEFORE YOU GO
   ----------------------------------------------------------
   Walking in is often harder than signing up. This card
   answers what a nervous first-timer wonders about. Access
   details are only what someone has actually checked.
   ========================================================== */
function renderBefore(s, p) {
  const v = s.venue;
  const plan = leading(s);
  $('beforeTitle').textContent = s.first_time ? 'Before your first meetup' : 'Before you go';
  $('fMeet').textContent = `${v.name}, ${v.area}. Meeting point: ${v.meeting_point}.`;
  $('dirLink').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v.area);
  $('dirLink').textContent = `Directions to ${v.name} ↗`;
  $('fArrive').textContent = plan.first_five_minutes;
  $('fWho').textContent = `Up to ${p.group.capacity} people from your group, the same each week.` + (s.host ? ` ${s.host.name}, a Regulars host (a trained student), is there to say hi and get things started${s.host.recognise ? ` – ${s.host.recognise}` : ''}.` : ' A Regulars host will be confirmed.') + ` About ${s.duration} minutes.`;
  $('fAccess').textContent = v.checked_on
    ? `Step-free: ${v.step_free}. Accessible toilet: ${v.accessible_toilet}. Seating: ${v.seating}. ${v.noise}. Checked ${v.checked_on}.`
    : 'Not checked yet for this venue. Ask the coordinator privately and they’ll find out before you go.';
  $('fFallbackRow').hidden = !s.fallback_note;
  $('fFallback').textContent = s.fallback_note;
}


/* ==========================================================
   15. WALK IN TOGETHER
   ----------------------------------------------------------
   Once you've said "I'm in", you can ask your host to meet
   you at the meeting point. It's only promised once the host
   has actually said yes. Nobody else is told.
   ========================================================== */
function renderBuddy(s) {
  const a = s.arrival;
  const show = s.status !== 'cancelled' && !s.started && (s.rsvp === 'going' || a);
  $('buddyCard').hidden = !show;
  if (!show) return;
  if (!a || a.status === 'declined') {
    $('buddyBody').innerHTML = `<p class="fs15">Walking in is often the hardest bit. ${s.host ? esc(s.host.name) : 'Your host'} can meet you at the meeting point about 10 minutes before, so you arrive together. Nobody else is told.</p>
      ${a && a.status === 'declined' ? '<p class="hint">Your host couldn’t do it last time; the coordinator was told.</p>' : ''}
      <div class="row"><button class="btn primary" data-act="arrival">Meet the host</button></div>`;
  } else if (a.status === 'accepted') {
    $('buddyBody').innerHTML = `<div class="slot"><b>✓ ${esc(s.host ? s.host.name : 'Your host')} will meet you ${a.minutes_before} minutes before</b><small>${esc(a.meet_point)} · Recognise them: ${esc(a.recognise)} · If they’re delayed: ${esc(a.fallback)}</small></div>
      <button class="btn ghost" data-act="arrival-cancel" data-id="${a.id}">Cancel</button>`;
  } else {
    $('buddyBody').innerHTML = `<div class="slot"><b>Asked – waiting for your host to say yes</b><small>Don’t rely on it until this says ✓. You’ll get an email when they do.</small></div>
      <button class="btn ghost" data-act="arrival-cancel" data-id="${a.id}">Cancel</button>`;
  }
}


/* ==========================================================
   16. THIS WEEK'S OTHER OPTION
   ----------------------------------------------------------
   Same time and place either way. Whichever most of the group
   prefers goes ahead; a tie or no answers keeps the first.
   Counts are real replies – none are invented.
   ========================================================== */
function renderOtherOption(s) {
  if (s.activity || s.options.length < 2) return;
  const lead = leading(s);
  const other = s.options.find(a => a.id !== lead.id);
  const iPreferIt = s.my_vote === other.id;
  $('otherBody').innerHTML = `<div class="ex-head"><span aria-hidden="true">${iconFor(other.name)}</span><div><b>${esc(other.name)}</b><small>${esc(s.start.day)}, ${esc(s.start.time)} · same place</small></div></div>
    <div class="whobar"><span class="hint">${lead.votes} prefer this week’s plan, ${other.votes} prefer this</span>
    <button class="minibtn ${iPreferIt ? 'on' : ''}" data-act="vote" data-id="${iPreferIt ? lead.id : other.id}" aria-pressed="${iPreferIt}">${iPreferIt ? '✓ You prefer this' : 'I’d prefer this'}</button></div>`;
  $('otherHint').textContent = `Whichever most of the group prefers goes ahead. If it’s a tie, or nobody minds, ${s.default_activity} does. Choices close 24 hours before.`;
}

// One handler for every server action button.
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const s = S.participant && S.participant.session;
  const act = b.dataset.act;
  let ok = false;
  if (act === 'offer') { ok = await send('offer', { membership_id: Number(b.dataset.id), answer: b.dataset.answer }); if (ok) $('view').scrollTop = 0; }
  else if (act === 'vote') ok = await send('vote', { session_id: s.id, activity_id: Number(b.dataset.id) });
  else if (act === 'arrival') ok = await send('arrival', { session_id: s.id, action: 'request' });
  else if (act === 'arrival-cancel') ok = await send('arrival', { session_id: s.id, action: 'cancel', request_id: Number(b.dataset.id) });
  else if (act === 'how') { const id = S.participant.ask_how.session_id; ok = await send('how-was', { session_id: id, answer: b.dataset.value }); if (ok) howFollowUp = b.dataset.value === 'not_for_me'; }
  else if (act === 'how-dismiss') { howFollowUp = false; ok = true; }
  else if (act === 'here' || act === 'late') ok = await send('ping', { session_id: S.participant.session.id, kind: act });
  else if (act === 'resume') ok = await send('pause', { action: 'resume' });
  else if (act === 'pause') ok = await send('pause', { weeks: Number(b.dataset.weeks) });
  else if (act === 'week-propose') { ok = await send('week/propose', { session_id: Number(b.dataset.session), slot_id: Number(b.dataset.id) }); }
  else if (act === 'to-plan') { $('planHero').scrollIntoView({ block: 'start' }); return; }
  else if (act === 'to-top') { $('statusCard').scrollIntoView({ block: 'start' }); return; }
  else if (act === 'see-meetup') { go('sc-week'); const hero = $('planHero'); if (!hero.hidden) hero.scrollIntoView({ block: 'start' }); return; }
  else if (act === 'rejoin') ok = await send('rejoin', {});
  else if (act === 'switch') { ok = await send('offer/switch', { membership_id: S.participant.offer.membership_id, group_id: Number(b.dataset.id) }); if (ok) return go('sc-week'); }
  else if (act === 'propose') { ok = await send('time/propose', { membership_id: S.participant.offer.membership_id, slot_id: Number(b.dataset.id) }); if (ok) return go('sc-week'); }
  else if (act === 'vote-yes' || act === 'vote-no') {
    ok = await send('time/answer', { vote_id: Number(b.dataset.id), yes: act === 'vote-yes' });
    if (ok) { rerender(); const card = document.querySelector(`[data-vote="${b.dataset.id}"]`); if (card) card.scrollIntoView({ block: 'center' }); return; }
  }
  else if (act === 'move') { ok = await send('place/move', { group_id: Number(b.dataset.id) }); if (ok) return go('sc-week'); }
  else if (act === 'waiting') { ok = await send('place/waiting', {}); if (ok) return go('sc-week'); }
  if (ok && act === 'offer' && currentScreen === 'sc-choices') return go('sc-week');
  if (ok && currentScreen === 'sc-choices' && !(S.participant.offer || (S.participant.group && S.participant.group.day_conflict))) return go('sc-week');
  if (ok) rerender();
});

$('remSwitch').addEventListener('change', async e => { if (!await send('profile', { email_reminders: e.target.checked })) e.target.checked = !e.target.checked; });


/* ==========================================================
   17. GROUP SCREEN
   ----------------------------------------------------------
   Everyone in your group and whether they're coming. Each
   person shows only their first name, initial and what they'd
   fancy. No course, no email, no where-they-live.
   ========================================================== */
function statusPill(coming) {
  return coming === 'going' ? '<span class="pill good">Coming</span>'
    : coming === 'not_going' ? '<span class="pill wait">Not this week</span>'
    : coming === 'break' ? '<span class="pill wait">Taking a break</span>'
    : '<span class="pill wait">Not replied</span>';
}

function renderGroup() {
  const p = S.participant;
  const g = p.group;
  const prog = programme();
  $('membersCard').hidden = !g;
  if (!g) {
    $('groupSub').textContent = p.offer ? 'You’ve been offered a place – see “This week”.' : 'You’re not in a group yet. When one is ready, you’ll be offered a place.';
    $('membersNote').textContent = '';
  } else {
    $('groupSub').textContent = `${g.slot.day}s, ${g.slot.time} at ${g.slot.venue.name}. The same people every week, for ${prog.weeks} weeks.`;
    $('members').innerHTML = g.members.map(m => `<li>${m.is_me ? '<span class="av" data-me></span>' : `<span class="av">${esc(initialOf(m.name))}</span>`}<div class="who"><b>${esc(m.is_me ? 'You' : m.name)}</b><small>${esc(m.likes.join(', ') || 'Open to anything')}</small></div>${p.session ? statusPill(m.coming) : ''}</li>`).join('');
    const me = $('members').querySelector('[data-me]');
    if (me) paintPicture(me, initialOf(p.preferred_name));
    $('membersNote').textContent = p.session ? `Replies are for ${p.session.start.day} ${p.session.start.date}.` : '';
  }
  $('ruleBreak').textContent = `Take a break for up to ${prog.pause_max_weeks} weeks in your profile. Your place is kept.`;
  $('ruleMissed').textContent = `It happens. After ${prog.followup_after_missed} in a row without saying, you may get one friendly message – unless you’ve asked us not to. Nobody else is told.`;
  $('ruleNotice').textContent = 'If we haven’t seen or heard from you for a while, we’ll ask if you’d like to keep your place.';
  $('ruleRelease').textContent = `If you don’t reply within ${prog.release_notice_days} days, your place may go to someone waiting, so the group stays big enough. A person decides, never the app, and nobody is told why.`;
}


/* ==========================================================
   18. PRIVATE MESSAGES
   ----------------------------------------------------------
   Questions for the coordinator, asking for a different
   group, or reporting a concern (which only the designated
   safety lead can read). Never seen by the group.
   ========================================================== */
const ASK = {
  question: { title: 'Ask something privately', sub: 'Only the programme coordinators see this, not your group or host. Anything is fine: what to bring, step-free access, whether it’s OK to come late or leave early.', kind: 'question', needsText: true },
  change_group: { title: 'Ask for a different group', sub: 'Only the Regulars team sees this. Your group isn’t told why you’ve moved, and you can keep coming until a new group is ready.',
    quick: ['The times don’t suit me', 'I’d like something quieter', 'It’s not quite clicking', 'I’d rather not say'], kind: 'change_group', needsText: false },
  access: { title: 'Something would make it easier to come', sub: 'Tell the coordinator what would help, like step-free access or somewhere quieter. Share only what you’re comfortable with.', kind: 'access', needsText: true },
  data: { title: 'A request about your data', sub: 'Ask for a copy of what we hold, a correction, or deletion. The coordinator will reply.', kind: 'data', needsText: true },
  concern: { title: 'Tell us what happened', sub: 'If someone made you feel unsafe or uncomfortable, tell us. Only the designated safety lead sees this. We keep it private, but if someone may be at risk of serious harm they may need to involve others – they’ll tell you if they can. If you’re in danger right now, call 999.',
    quick: ['Something made me uncomfortable', 'I felt unsafe', 'I’m worried about someone', 'Someone broke the group agreement'], safety: true, needsText: true },
};
const CONCERN_CATEGORY = { 'Something made me uncomfortable': 'uncomfortable', 'I felt unsafe': 'unsafe', 'I’m worried about someone': 'concern_person', 'Someone broke the group agreement': 'conduct' };
let askKind = 'question', askReturnTo = 'sc-week', askReason = null;

function openAsk(kind) {
  askKind = kind; askReturnTo = currentScreen; askReason = null;
  const a = ASK[kind];
  $('askTitle').textContent = a.title;
  $('askSub').textContent = a.sub + (programme().monitoring_hours ? ` Messages are read ${programme().monitoring_hours}.` : '');
  $('askQuick').hidden = !a.quick;
  $('askQuick').innerHTML = (a.quick || []).map(t => `<button type="button" class="tier" aria-pressed="false"><b>${esc(t)}</b></button>`).join('');
  $('askOptional').hidden = a.needsText;
  $('askText').value = '';
  $('askDone').textContent = '';
  $('askSend').disabled = false;
  go('sc-ask');
}
document.addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b) openAsk(b.dataset.ask); });
$('askQuick').addEventListener('click', e => {
  const b = e.target.closest('.tier'); if (!b) return;
  askReason = b.textContent;
  $('askQuick').querySelectorAll('.tier').forEach(x => x.setAttribute('aria-pressed', x === b));
});
$('sc-ask').addEventListener('submit', async e => {
  e.preventDefault();
  const a = ASK[askKind];
  const text = $('askText').value.trim();
  if (a.needsText && !text && !a.quick) { $('askDone').textContent = 'Write a few words first.'; return; }
  if (!text && !askReason) { $('askDone').textContent = 'Pick a reason or write a few words. “I’d rather not say” is fine.'; return; }
  const message = [askReason, text].filter(Boolean).join(' – ');
  const ok = a.safety ? await send('concern', { category: CONCERN_CATEGORY[askReason] || 'other', details: message }) : await send('support', { kind: a.kind, message });
  if (!ok) return;
  $('askSend').disabled = true;
  $('askDone').textContent = a.safety ? 'Received. Only the safety lead can read it. If anyone is in danger right now, call 999.' : 'Sent. A person from the Regulars team will reply.';
});
$('askBack').onclick = () => go(askReturnTo);


/* ==========================================================
   19. INVITE SOMEONE
   ----------------------------------------------------------
   A plain link to share with one person. No rewards, no
   counts, no leaderboards, and the inviter is never told
   whether the other person joined.
   ========================================================== */
$('shareInvite').onclick = () => {
  // Demo copy: there's no real link to share. The real app shares this message with a link to Regulars.
  $('shareMsg').textContent = 'In the real app this shares a link to Regulars with the message: “Check out my app Regulars, hope you will like it! :)”';
};


/* ==========================================================
   20. SUPPORT SCREEN
   ----------------------------------------------------------
   Where to get help. The university's own section shows only
   information the coordinator has checked and approved.
   ========================================================== */
function renderSupport() {
  const prog = programme();
  $('uniSupportRow').hidden = !prog.support_info;
  if (prog.support_info) { $('uniSupport').textContent = prog.support_info; $('uniSupportChecked').textContent = prog.support_verified; }
  $('monitorHours').textContent = prog.monitoring_hours ? `Messages are read ${prog.monitoring_hours}. This isn’t an emergency service.` : 'This isn’t an emergency service.';
  const programs = UNI_PROGRAMS[prog.institution.theme] || [];
  $('uniProgramsCard').hidden = !programs.length;
  $('uniShort').textContent = prog.institution.name;
  $('uniPrograms').innerHTML = programs.map(pr => `<div class="rule r4"><div><b>${esc(pr.name)}</b><p>${esc(pr.about)}</p><p class="hint">${esc(pr.when)}</p><a class="linkout" href="${pr.link}" target="_blank" rel="noopener">More info ↗</a></div></div>`).join('');
}


/* ==========================================================
   20b. PERKS
   ----------------------------------------------------------
   Discounts at local partner places, for verified members.
   Your group's venue comes first, so the focus stays on
   meeting up. No countdowns, no "only 3 left", nothing to use
   up. Partners never see your name: the till sees a code,
   your first name and your initial.
   ========================================================== */
const PERK_TYPES = { cafe: 'Cafe', food: 'Food', games: 'Games bar', climbing: 'Climbing', cinema: 'Cinema' };
const PERK_FILTERS = [['all', 'All'], ['food', 'Food and drink'], ['games', 'Games'], ['active', 'Active'], ['other', 'Other']];
const perkFilterOf = type => ({ cafe: 'food', food: 'food', games: 'games', climbing: 'active' })[type] || 'other';
const perkTypeLabel = type => PERK_TYPES[type] || (type ? type[0].toUpperCase() + type.slice(1) : 'Other');
let perkFilter = 'all';
let redeeming = null;   // { offer, code } while the redeem view is open

function perkCard(o) {
  return `<button type="button" class="perk${o.is_group_venue ? ' venue' : ''}" data-perk="${esc(o.id)}">
    <span class="perk-top"><b>${esc(o.business)}</b><span class="pill wait">${esc(perkTypeLabel(o.type))}</span></span>
    <span class="perk-offer">${esc(o.offer)}</span>
    <small>${esc([o.area, o.conditions].filter(Boolean).join(' · '))}</small>
  </button>`;
}

function renderPerks() {
  const perks = S.participant.perks;
  const venue = perks.offers.find(o => o.id === perks.group_venue_offer_id);
  const others = perks.offers.filter(o => o !== venue);
  const shown = others.filter(o => perkFilter === 'all' || perkFilterOf(o.type) === perkFilter);
  let html = '';
  if (venue) html += `<div class="sec"><h3 class="sec-title">Your group’s venue</h3>${perkCard(venue)}</div>`;
  if (!others.length) html += `<div class="card"><p class="hint">No offers here yet. We’re adding places near campus.</p></div>`;
  else {
    html += `<div class="sec"><h3 class="sec-title">${venue ? 'More places near campus' : 'Places near campus'}</h3>
      <div class="chips" role="group" aria-label="Show offers by type">${PERK_FILTERS.map(([id, label]) => `<button type="button" class="chip" data-filter="${id}" aria-pressed="${perkFilter === id}">${label}</button>`).join('')}</div>
      ${shown.length ? shown.map(perkCard).join('') : '<p class="hint">Nothing of this type yet. We’re adding places near campus.</p>'}</div>`;
  }
  $('perksBody').innerHTML = html;
}
$('perksBody').addEventListener('click', async e => {
  const chip = e.target.closest('[data-filter]');
  if (chip) { perkFilter = chip.dataset.filter; renderPerks(); $('perksBody').querySelector(`[data-filter="${perkFilter}"]`).focus(); return; }
  const card = e.target.closest('[data-perk]');
  if (!card) return;
  const offer = S.participant.perks.offers.find(o => String(o.id) === card.dataset.perk);
  const r = await send('perk_redeem', { offer_id: offer.id });
  if (!r || !r.code) return;
  redeeming = { offer, code: r.code };
  go('sc-redeem');
});

function renderRedeem() {
  if (!redeeming) return go('sc-perks');
  const { offer, code } = redeeming;
  const name = S.participant.preferred_name;
  $('redeemBody').innerHTML = `<div class="title"><span class="label">${esc(perkTypeLabel(offer.type))}</span><h2>${esc(offer.business)}</h2><p>${esc(offer.offer)}</p></div>
    <div class="card redeem">
      <p class="redeem-code" aria-label="Code: ${esc(code.split('').join(' '))}">${esc(code)}</p>
      <div class="redeem-who"><span class="av ${picture.colour}" aria-hidden="true">${esc(initialOf(name))}</span><b>${esc(name)}</b></div>
      <p class="v-head center">Show this at the till.</p>
      ${offer.conditions ? `<p class="hint center">${esc(offer.conditions)}</p>` : ''}
    </div>`;
}


/* ==========================================================
   21. SOMETHING TO TALK ABOUT
   ----------------------------------------------------------
   Easy questions for when you don't know what to say.
   Nothing too personal, and nothing about your course.
   ========================================================== */
const CONVERSATION_STARTERS = [
  'What’s the best thing you’ve eaten this week?', 'What did you get up to last weekend?', 'What’s a film or show you could watch again and again?',
  'What’s the best place you’ve found in the city so far?', 'What’s something you’re looking forward to?', 'If you could learn any skill in a week, what would it be?',
  'What music have you had on repeat lately?', 'What’s your go-to comfort food?', 'Cats or dogs, and why?', 'What did you want to be when you were little?',
  'What’s a small thing that made you smile recently?', 'Where’s somewhere you’d love to travel to?',
];
let talkIndex = 0;
const showConversationStarter = () => { $('talkQ').textContent = CONVERSATION_STARTERS[talkIndex % CONVERSATION_STARTERS.length]; };
$('talkNext').onclick = () => { talkIndex++; showConversationStarter(); };


/* ==========================================================
   22. YOUR PROFILE
   ----------------------------------------------------------
   Tap your picture in the top bar. Every change is saved on
   the server straight away (your picture stays on this phone).
   ========================================================== */
function renderProfile() {
  const p = S.participant;
  const prog = programme();
  const initial = initialOf(p.preferred_name);
  paintPicture($('meBig'), initial);
  $('meTitle').textContent = p.preferred_name || 'Your profile';
  $('meUni').textContent = prog.institution.name;
  if (document.activeElement !== $('meName')) $('meName').value = p.preferred_name;
  document.querySelectorAll('#meAvs [data-colour]').forEach(b => { b.textContent = initial; b.setAttribute('aria-pressed', !picture.photo && b.dataset.colour === picture.colour); });
  $('meUpLbl').setAttribute('aria-pressed', !!picture.photo);
  $('meUpLbl').style.backgroundImage = picture.photo ? `url(${picture.photo})` : '';
  $('meActs').innerHTML = prog.activities.map(a => choiceBtn('act', a.id, a.name, '', p.interest_ids.includes(a.id))).join('');
  $('meStyle').innerHTML = stylesHTML(p.interaction_style);
  $('meDays').innerHTML = daysHTML(p.unavailable_days);
  $('meRemind').checked = p.email_reminders;
  $('meNoFollow').checked = p.no_followup_contact;
  $('meEmail').textContent = p.email || S.user.email;
  $('meUniName').textContent = prog.institution.name;
  $('meStatus').textContent = p.status_label;
  $('mePrivacy').href = prog.urls.privacy;
  $('leaveBtn').hidden = p.status === 'withdrawn';
  renderPause(p, prog);
  updateThemeButtons();
}

// Taking a break: No break / Skip next week / Skip 2 weeks (… up to the programme's limit).
function renderPause(p, prog) {
  const paused = p.status === 'paused' && !!p.paused_until;
  const canPause = p.status === 'active' || p.status === 'awaiting_group' || paused;
  const options = [`<button class="tier" ${paused ? 'data-act="resume"' : ''} aria-pressed="${!paused}"><b>No break</b></button>`]
    .concat(Array.from({ length: prog.pause_max_weeks }, (_, i) => `<button class="tier" ${paused ? 'disabled' : `data-act="pause" data-weeks="${i + 1}"`} aria-pressed="false"><b>${i === 0 ? 'Skip next week' : `Skip ${i + 1} weeks`}</b></button>`));
  $('pauseOpts').innerHTML = canPause ? options.join('') : '';
  $('pauseNote').textContent = !canPause ? 'You can take a break once you’re in a group or on the waiting list.'
    : paused ? `Taking a break until ${p.paused_until}. Your place is kept, and reminders start again then. Tap “No break” to come back now.`
    : 'Need a week or two off? Your place in the group is kept, reminders stop, and missed weeks don’t count.';
}

let savedTimer = null;
function showSaved() { $('meSaved').textContent = '✓ Saved'; clearTimeout(savedTimer); savedTimer = setTimeout(() => { $('meSaved').textContent = ''; }, 1800); }
async function saveProfile(data) { const ok = await send('profile', data); renderProfile(); updateTopBar(); if (ok) showSaved(); }

$('meBack').onclick = () => go(lastTab);
let nameTimer = null;
$('meName').addEventListener('input', () => {   // saves once you stop typing for a moment
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => { const v = $('meName').value.trim(); if (v && v !== S.participant.preferred_name) saveProfile({ preferred_name: v }); }, 700);
});
$('meActs').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  const id = Number(b.dataset.id), cur = S.participant.interest_ids;
  saveProfile({ interest_ids: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] });
});
$('meStyle').addEventListener('click', e => {
  const b = e.target.closest('[data-id]'); if (!b) return;
  saveProfile({ interaction_style: S.participant.interaction_style === b.dataset.id ? '' : b.dataset.id });
});
$('meDays').addEventListener('click', e => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  const next = toggleDay(S.participant.unavailable_days, Number(b.dataset.day));
  if (!keepsAMeetingDay(next)) return toast(DAYS_ERROR, true);
  saveProfile({ unavailable_days: next });
});
$('meRemind').addEventListener('change', e => saveProfile({ email_reminders: e.target.checked }));
$('meNoFollow').addEventListener('change', e => saveProfile({ no_followup_contact: e.target.checked }));
$('themeOpts').addEventListener('click', e => { const b = e.target.closest('[data-theme-choice]'); if (b) { setTheme(b.dataset.themeChoice); showSaved(); } });
$('meData').addEventListener('click', e => { e.preventDefault(); openAsk('data'); });

// Leave and sign out: tap twice, so it can't happen by accident.
$('leaveBtn').onclick = async () => {
  if ($('leaveBtn').dataset.armed !== '1') { $('leaveBtn').dataset.armed = '1'; $('leaveBtn').textContent = 'Tap again to leave (no reason needed)'; return; }
  $('leaveBtn').dataset.armed = ''; $('leaveBtn').textContent = 'Leave Regulars';
  if (await send('leave', { confirm: true })) go('sc-week');
};
$('signOut').onclick = () => {
  if ($('signOut').textContent !== 'Tap again to sign out') { $('signOut').textContent = 'Tap again to sign out'; return; }
  $('signOut').textContent = 'Sign out';
  window.REGULARS_DEMO.reset();   // demo copy: start again
};


/* ==========================================================
   23. INSTALL AS AN APP
   ----------------------------------------------------------
   Students can add Regulars to their phone's home screen.
   ========================================================== */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('installBtn').hidden = true; };
const onIPhone = /iphone|ipad|ipod/i.test(navigator.userAgent);
const alreadyInstalled = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
$('iosHint').hidden = !(onIPhone && !alreadyInstalled);
// Demo copy: no service worker.


/* ==========================================================
   24. START THE APP
   ========================================================== */
async function start() {
  updateThemeButtons();
  updateOffline();
  showConversationStarter();
  try { await fetchState(); }
  catch (e) { $('sc-loading').innerHTML = `<div class="finding"><h2>Can’t reach Regulars</h2><p>${esc(e.message)}</p></div>`; return; }
  applyProgramme();
  if (S.participant) { clearDraft(); go('sc-week'); return; }
  // Signed in with choices already made (e.g. came back after a reload): finish joining.
  if (S.user && draft.programme && programme() && programme().enrolment_open) { go('sc-verify'); return; }
  go('sc-welcome');
}

// Refresh from the server when you come back to the app, so it never shows stale plans.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S || busy || !online()) return;
  try { await fetchState(); applyProgramme(); if (currentScreen !== 'sc-verify' && currentScreen !== 'sc-ask') rerender(); } catch (e) {}
});

// Demo copy: reload from the stand-in server after jumping to another stage.
window.REGULARS_DEMO_REFRESH = async () => {
  clearDraft();
  draft = { programme: null, invite: '', interest_ids: [], open: false, interaction_style: '', unavailable_days: [], needs_step_free: false, prefers_quieter: false };
  codeStage = 'email'; nameTyped = false; howFollowUp = false; redeeming = null; perkFilter = 'all';
  await fetchState(); applyProgramme();
  go(S.participant ? 'sc-week' : 'sc-welcome');
};
start();
})();
