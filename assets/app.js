// This script needs a much more optimization after including maps and icons. Need to update from time to time.
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));


const state = {
  role: 'citizen',
  lang: 'en',
  theme: undefined, // 'light' | 'dark' | undefined (system)
  // Alerts include hazard + region fields for filtering
  alerts: [
    {time:'14:05', hazard:'Heavy Rain', sev:'High', msg:'Red alert: Heavy rainfall expected next 12h', state:'Kerala', district:'Alappuzha', area:'Alappuzha, Kerala'},
    {time:'13:40', hazard:'Flood', sev:'Medium', msg:'River level rising, avoid low-lying zones', state:'Bihar', district:'Saharsa', area:'Saharsa, Bihar'},
    {time:'13:10', hazard:'Heatwave', sev:'Low', msg:'Heat advisory lifted for today', state:'Maharashtra', district:'Nagpur', area:'Nagpur, Maharashtra'}
  ],
  verifyQueue: [
    {time:'14:00', type:'Flood', loc:'Khagaria – Rampur', status:'Pending'},
    {time:'13:20', type:'Landslide', loc:'Mandi – Pandoh', status:'Pending'},
    {time:'12:50', type:'Health', loc:'Kolkata – Rajarhat', status:'Pending'}
  ],
  shelters: [
    {name:'Govt School Hall', cap:150, avail:95, contact:'080-123456'},
    {name:'Panchayat Bhawan', cap:200, avail:130, contact:'080-223344'},
    {name:'Community Centre', cap:120, avail:70, contact:'080-445566'}
  ],
  supplies: [
    {id:'#A102', type:'Dry ration', status:'En route', eta:'18:00'},
    {id:'#B341', type:'Water', status:'Loaded', eta:'16:30'},
    {id:'#M220', type:'Medicines', status:'At depot', eta:'—'}
  ],
  volunteers: [
    {name:'Name 1', skill:'First Aid', area:'Ward 11', status:'Available'},
    {name:'Name 2', skill:'Logistics', area:'Ward 9', status:'Busy'},
    {name:'Name 3', skill:'Search & Rescue', area:'Ward 13', status:'Available'}
  ],
  tasks:[]
};

// Hazards we support for filtering and reporting
// Note: keep this in sync with report-type options for consistency
const HAZARDS = [
  'Flood','Cyclone','Heatwave','Cold Wave','Landslide','Earthquake','Thunderstorm','Lightning','Drought','Forest Fire','Tsunami','Heavy Rain','Fire','Health',
  // Silent/slow-onset hazards
  'Air Pollution','Land Degradation','Sea Level Rise'
];

// Indian States/UTs list (full set); districts provided for demo states used in sample alerts
const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
];

// Minimal demo districts subset; extend as needed
const DISTRICTS_BY_STATE = {
  'Kerala': ['Alappuzha','Ernakulam','Idukki','Kollam','Kottayam','Kozhikode','Malappuram','Palakkad','Pathanamthitta','Thiruvananthapuram','Thrissur','Wayanad'],
  'Bihar': ['Saharsa','Khagaria','Patna','Gaya','Bhagalpur'],
  'Maharashtra': ['Nagpur','Pune','Mumbai City','Mumbai Suburban','Thane','Nashik'],
  'Himachal Pradesh': ['Mandi','Kullu','Kangra','Shimla'],
  'West Bengal': ['Kolkata','Howrah','Darjeeling','North 24 Parganas']
};

// Active filter state 
const filters = {
  hazards: new Set(), // if empty => no hazard filtering
  state: '',
  district: ''
};

// Simple in-memory + sessionStorage cache for loaded SVGs
const iconCache = new Map();
const iconKey = (n)=>`icon:${n}`;
function iconGetSession(n){ try{ const v=sessionStorage.getItem(iconKey(n)); if(v===null) return undefined; return v===''?null:v; }catch{ return undefined; } }
function iconSetSession(n, v){ try{ sessionStorage.setItem(iconKey(n), v ?? ''); }catch{} }

// Icons: inline SVG from assets/icons (cached via HTTP cache + sessionStorage)
async function loadIcon(name){
  if(iconCache.has(name)) return iconCache.get(name);
  const fromSess = iconGetSession(name);
  if(fromSess !== undefined){ iconCache.set(name, fromSess); return fromSess; }
  const url = `assets/icons/${name}.svg`;
  try{
    const res = await fetch(url); // allow default caching
    const text = res.ok ? await res.text() : null;
    iconCache.set(name, text);
    iconSetSession(name, text);
    return text;
  }catch{
    iconCache.set(name, null);
    iconSetSession(name, null);
    return null;
  }
}

// Apply icons to [data-icon]
async function applyIcons(root=document){
  const nodes = root.querySelectorAll('[data-icon]');
  await Promise.all(Array.from(nodes).map(async el => {
    const name = el.getAttribute('data-icon');
    if(!name) return;
    const svg = await loadIcon(name);
    if(svg){
      // Inline the SVG for styling via currentColor
      el.innerHTML = svg;
      el.classList.add('icon-inline');
      // Remove width/height if present to allow CSS sizing
      const svgEl = el.querySelector('svg');
      if(svgEl){ svgEl.removeAttribute('width'); svgEl.removeAttribute('height'); svgEl.setAttribute('aria-hidden','true'); }
    } else {
      // Graceful fallback: add a class so CSS can provide a placeholder
      el.classList.add('icon-missing');
      el.setAttribute('aria-hidden','true');
    }
  }));
}

// Render: role display + role-gated blocks
function renderRoleBadge(){
  const map = {citizen:'Citizen', authority:'Local Authority', ndrf:'NDRF / Emergency', ngo:'NGO / Volunteer'};
  const roleName = map[state.role];

  // Update main role display
  $('#role-display').textContent = 'Role: ' + roleName;

  // Update profile role display
  const profileRoleEl = $('#profile-role-display');
  if(profileRoleEl) {
    profileRoleEl.textContent = roleName;
  }

  // Toggle role-only blocks
  $$('.role-only').forEach(el=>{
    const roles = (el.className.match(/citizen|authority|ndrf|ngo/g)||[]);
    el.style.display = roles.includes(state.role) ? '' : 'none';
  });
}

// Render: dashboard KPIs
function renderStats(){
  $('#alerts-count').textContent = state.alerts.length;
  $('#high-priority-count').textContent = state.alerts.filter(a=>a.sev==='High' || a.sev==='Severe').length;
  const areas = new Set(state.alerts.map(a=>a.area));
  $('#areas-count').textContent = areas.size;
  const verified = 2; // demo
  $('#reports-count').textContent = state.verifyQueue.length + verified;
  $('#verified-count').textContent = verified;
  $('#pending-count').textContent = state.verifyQueue.length;
  $('#shelters-count').textContent = state.shelters.length;
  $('#beds-count').textContent = state.shelters.reduce((s,x)=>s+x.avail,0);
  $('#supplies-count').textContent = state.supplies.length;
}

// Render: alerts (feed + table) w/ filters
function renderAlertFeed(){
  const passes = (a)=>{
    const hazardOk = filters.hazards.size ? filters.hazards.has(a.hazard) : true;
    const stateOk = filters.state ? a.state === filters.state : true;
    const districtOk = filters.district ? a.district === filters.district : true;
    return hazardOk && stateOk && districtOk;
  };
  const filtered = state.alerts.filter(passes);

  // Recent alerts (top 5 of filtered)
  const feed = $('#alert-feed'); 
  if(feed){
    feed.innerHTML='';
    filtered.slice(0,5).forEach(a=>{
      const li = document.createElement('li');
      li.style.margin='8px 0';
      // Hazard badge helps quickly identify the type
      li.innerHTML = `<span class="kbd">${a.time}</span> <span class="chip">${a.hazard}</span> <span class="${sevClass(a.sev)}">${a.sev}</span> — ${a.msg} <span class="muted">(${a.area})</span>`;
      feed.appendChild(li);
    });
  }

  // Table rows
  const tbody = $('#alerts-table'); 
  if(tbody){
    tbody.innerHTML='';
    filtered.forEach(a=>{
      tbody.insertAdjacentHTML('beforeend', `<tr>
        <td>${a.time}</td>
        <td><span class="chip">${a.hazard}</span></td>
        <td>${a.sev}</td>
        <td>${a.msg}</td>
        <td>${a.area}</td>
      </tr>`);
    });
  }
}

// Render: shelters (dashboard + resources)
function renderShelters(){
  const tb1 = $('#shelter-list'); 
  tb1.innerHTML='';
  const tb2 = $('#resources-shelters'); 
  tb2.innerHTML='';

  state.shelters.forEach(s=>{
    tb1.insertAdjacentHTML('beforeend', `<tr><td>${s.name}</td><td>${s.cap}</td><td>${s.avail}</td><td>1.2 km</td></tr>`);
    tb2.insertAdjacentHTML('beforeend', `<tr><td>${s.name}</td><td>${s.cap}</td><td>${s.avail}</td><td>${s.contact}</td></tr>`);
  });
}

// Render: supplies (resources)
function renderSupplies(){
  const tb = $('#resources-supplies'); 
  if(!tb) return; // Only render if element exists (role-based visibility)
  tb.innerHTML='';
  state.supplies.forEach(x=>{
    tb.insertAdjacentHTML('beforeend', `<tr><td>${x.id}</td><td>${x.type}</td><td>${x.status}</td><td>${x.eta}</td></tr>`);
  });
}

// Render: verify table
function renderVerify(){
  const tb = $('#verify-list'); 
  if(!tb) return; // Only render if element exists (role-based visibility)
  tb.innerHTML='';
  state.verifyQueue.forEach((r,i)=>{
    tb.insertAdjacentHTML('beforeend', `<tr>
      <td>${r.time}</td><td>${r.type}</td><td>${r.loc}</td><td>${r.status}</td>
      <td>
        <button class="btn brand" data-act="approve" data-idx="${i}">Approve</button>
        <button class="btn" data-act="reject" data-idx="${i}">Reject</button>
      </td></tr>`);
  });
}

// Render: volunteers + dropdown
function renderVolunteers(){
  const tb = $('#volunteer-list'); 
  tb.innerHTML='';
  const sel = $('#task-volunteer'); 
  if(sel) {
    sel.innerHTML='<option value="">Select</option>';
  }

  state.volunteers.forEach(v=>{
    tb.insertAdjacentHTML('beforeend', `<tr><td>${v.name}</td><td>${v.skill}</td><td>${v.area}</td><td>${v.status}</td></tr>`);
    if(sel) {
      const opt = document.createElement('option'); 
      opt.value=v.name; 
      opt.textContent=v.name; 
      sel.appendChild(opt);
    }
  });
  renderTasks();
}

// Render: tasks list
function renderTasks(){
  const tb = $('#task-list'); 
  if(!tb) return; 
  tb.innerHTML='';
  state.tasks.forEach(t=>{
    tb.insertAdjacentHTML('beforeend', `<tr><td>${t.title}</td><td>${t.assignee}</td><td>${t.status}</td></tr>`);
  });
}

// Util: severity -> class
function sevClass(s){
  return s==='Severe' || s==='High' ? 'danger' : (s==='Medium' ? 'warn' : 'ok');
}

// Init: profile dropdown (focus trap, Esc)
function initProfileDropdown() {
  const profileToggle = $('#profile-toggle');
  const profileDropdown = $('#profile-dropdown');
  const profileClose = $('#profile-close');

  if (!profileToggle || !profileDropdown) return;

  // Open/close the dropdown, move focus inside on open
  profileToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.toggle('active');
    if(profileDropdown.classList.contains('active')){
      // Move focus to first focusable element for screen readers
      const firstFocusable = profileDropdown.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      firstFocusable?.focus();
    } else {
      // Restore focus to the trigger when closing
      profileToggle.focus();
    }
  });

  // Close button explicitly closes and returns focus to trigger
  profileClose.addEventListener('click', () => {
    profileDropdown.classList.remove('active');
    profileToggle.focus();
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!profileDropdown.contains(e.target) && !profileToggle.contains(e.target)) {
      profileDropdown.classList.remove('active');
    }
  });

  // Trap focus within dropdown when active and close on Escape
  profileDropdown.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      profileDropdown.classList.remove('active');
      profileToggle.focus();
    }
    if(e.key === 'Tab' && profileDropdown.classList.contains('active')){
      const focusables = Array.from(profileDropdown.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
      if(focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  });
}

// Init: education tabs (toggle phases)
function initEducationTabs() {
  const educationTabs = $$('.education-tab');
  const educationPhases = $$('.education-phase');

  educationTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const phase = tab.dataset.phase;

      // Update tab states
      educationTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update phase visibility
      educationPhases.forEach(p => p.classList.remove('active'));
      const targetPhase = document.getElementById(phase + '-disaster');
      if (targetPhase) {
        targetPhase.classList.add('active');
      }
    });
  });
}

// Init: video hover/focus previews
function initVideoInteractions() {
  const vids = $$('.video-thumb');
  vids.forEach(v => {
    // Hint to mobile browsers to allow inline playback
    try{ v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline',''); }catch{}
    v.muted = true; // ensure hover preview is silent
    // Start/stop on hover and keyboard focus
    v.addEventListener('mouseenter', ()=>{ v.play().catch(()=>{}); });
    v.addEventListener('mouseleave', ()=>{ v.pause(); v.currentTime = 0; });
    v.addEventListener('focus', ()=>{ v.play().catch(()=>{}); });
    v.addEventListener('blur', ()=>{ v.pause(); v.currentTime = 0; });
  });
}

// Assets filters
// (assets gallery removed for simplified setup)

// Init: primary tabs (keyboard + click)
function initTabs(){
  const tablist = document.querySelector('.tabs [role="tablist"]');
  if(!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

  // Helper to activate a tab and its panel
  function activate(tab){
    tabs.forEach(t=>{
      const selected = t === tab;
      t.classList.toggle('active', selected);
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1; // roving tabindex for keyboard focus
    });
    const id = tab.getAttribute('aria-controls');
    $$('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    tab.focus();
  }

  // Click activates
  tabs.forEach(t=> t.addEventListener('click', ()=> activate(t)));

  // Arrow/Home/End navigation within tabs
  tablist.addEventListener('keydown', (e)=>{
    const i = tabs.indexOf(document.activeElement);
    if(i < 0) return;
    let j = i;
    if(e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    if(e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    if(e.key === 'Home') j = 0;
    if(e.key === 'End') j = tabs.length - 1;
    if(j !== i){ e.preventDefault(); activate(tabs[j]); }
  });

  // Initialize tabindex state
  tabs.forEach(t=> t.tabIndex = t.classList.contains('active') ? 0 : -1);
}

$$('#app .btn[data-nav]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const view = btn.getAttribute('data-nav');
    const tabId = view.split('-')[0] + '-tab';
    const targetTab = document.getElementById(tabId);
    if(targetTab) {
      targetTab.click();
    }
  });
});

// Prefs: localStorage 'prefs'
function loadPrefs(){
  try{ return JSON.parse(localStorage.getItem('prefs')||'{}'); }catch{ return {}; }
}
function savePrefs(){
  const prefs = { role: state.role, lang: state.lang, contrast: document.body.classList.contains('contrast'), theme: state.theme };
  localStorage.setItem('prefs', JSON.stringify(prefs));
}

// Theme management
function applyTheme(theme){
  const root = document.documentElement; // <html>
  // Clean slate
  root.classList.remove('theme-light','theme-dark');
  if(theme === 'light'){
    root.classList.add('theme-light');
  } else if(theme === 'dark'){
    root.classList.add('theme-dark');
  }
  // Reflect in toggle control
  const btn = document.getElementById('theme-toggle');
  if(btn){
    const isLight = theme === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    btn.title = `Switch to ${isLight ? 'dark' : 'light'} theme`;
    btn.setAttribute('aria-label', `Toggle color theme (current: ${isLight ? 'light' : 'dark'})`);
  }
}

// Toggle between light and dark explicitly (ignoring system after first toggle)
document.getElementById('theme-toggle')?.addEventListener('click', ()=>{
  const next = state.theme === 'light' ? 'dark' : 'light';
  state.theme = next;
  applyTheme(state.theme);
  savePrefs();
});

$('#role-select').addEventListener('change', (e)=>{ 
  state.role = e.target.value; 
  renderRoleBadge();
  // Re-render components that depend on role
  renderSupplies();
  renderVerify();
  savePrefs(); // DEBUG: persist role change
});

$('#lang-select').addEventListener('change', (e)=>{ 
  state.lang = e.target.value; 
  /* placeholder for i18n swap */ 
  savePrefs(); // DEBUG: persist lang change
});

// Actions: forms + buttons
$('#submit-report').addEventListener('click', ()=>{
  const type=$('#report-type').value;
  const desc=$('#report-description').value.trim();
  const loc=$('#report-location').value.trim();

  if(!desc || !loc){ 
    $('#report-message').textContent='Please add description and location.'; 
    return; 
  }

  state.verifyQueue.unshift({
    time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), 
    type, 
    loc, 
    status:'Pending'
  });

  $('#report-description').value=''; 
  $('#report-location').value=''; 
  $('#report-contact').value=''; 
  $('#report-message').textContent='Report submitted for verification.';
  renderStats(); 
  renderVerify();
});

// Broadcast alert (authority/NDRF)
$('#send-alert').addEventListener('click', ()=>{
  const msg=$('#alert-message').value.trim(); 
  if(!msg) return;

  // Read structured fields from the broadcast form
  const sev=$('#alert-severity').value;
  const hazard = $('#alert-hazard')?.value || 'Flood';
  const stateName = $('#alert-state')?.value || '';
  const districtName = $('#alert-district')?.value || '';
  const area = districtName ? `${districtName}, ${stateName||''}`.trim() : (stateName || '—');

  // Add to the top (newest first)
  state.alerts.unshift({
    time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), 
    hazard,
    sev, 
    msg, 
    state: stateName || '',
    district: districtName || '',
    area
  });

  // Clear inputs and re-render
  $('#alert-message').value=''; 
  renderStats(); 
  renderAlertFeed();
  alert('Alert broadcasted (demo).');
});

// Assign task → state.tasks
document.addEventListener('click', (e) => {
  if(e.target.id === 'assign-task') {
    const title = $('#task-title')?.value.trim();
    const assignee = $('#task-volunteer')?.value;

    if(!title || !assignee) return;

    state.tasks.push({
      title: title,
      assignee: assignee,
      status: 'Assigned'
    });

    $('#task-title').value = '';
    $('#task-volunteer').value = '';
    renderTasks();
  }
});

// Verify approve/reject (delegated)
document.addEventListener('click', (e)=>{
  const btn=e.target.closest('button[data-act]'); 
  if(!btn) return;

  const i=+btn.dataset.idx;
  const act=btn.dataset.act;

  if(act==='approve'){ 
    state.verifyQueue[i].status='Verified'; 
  }
  if(act==='reject'){ 
    state.verifyQueue.splice(i,1); 
  }

  renderStats(); 
  renderVerify();
});

// A11y toggles: contrast, kb hints, large text
$('#contrast-toggle').addEventListener('click', (e)=>{
  // Toggle visual contrast and remember state
  const pressed = e.target.getAttribute('aria-pressed')==='true';
  e.target.setAttribute('aria-pressed', String(!pressed));
  document.body.classList.toggle('contrast', !pressed);
  document.body.style.filter = !pressed ? 'contrast(1.1) saturate(1.1)' : '';
  savePrefs(); // DEBUG: persist contrast toggle
});

$('#high-contrast').addEventListener('change', (e)=>{ 
  // Sync checkbox with button and remember
  document.body.classList.toggle('contrast', e.target.checked);
  document.body.style.filter = e.target.checked ? 'contrast(1.15) saturate(1.1)' : '';
  const contrastToggle = $('#contrast-toggle');
  if(contrastToggle) { contrastToggle.setAttribute('aria-pressed', String(e.target.checked)); }
  savePrefs(); // DEBUG: persist checkbox toggle
});

$('#keyboard-hints').addEventListener('change', (e)=>{ 
  document.body.classList.toggle('show-kb', e.target.checked) 
});

$('#large-text').addEventListener('change', (e)=>{ 
  document.body.style.fontSize = e.target.checked ? '18px' : '' 
});

// Bootstrap: on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  // Load and apply saved preferences (role, lang, contrast)
  const prefs = loadPrefs();
  if(prefs.role){ state.role = prefs.role; const rs=$('#role-select'); if(rs) rs.value = prefs.role; }
  if(prefs.lang){ state.lang = prefs.lang; const ls=$('#lang-select'); if(ls) ls.value = prefs.lang; }
  // Theme: prefer saved; else follow system
  const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if(prefs.theme === 'light' || prefs.theme === 'dark'){
    state.theme = prefs.theme;
  } else {
    state.theme = mq && mq.matches ? 'dark' : 'light';
  }
  applyTheme(state.theme);
  // If user never chose a theme, we can update on system changes dynamically
  if(!(prefs.theme === 'light' || prefs.theme === 'dark') && mq && typeof mq.addEventListener === 'function'){
    mq.addEventListener('change', (e)=>{
      // Only react if user hasn't set explicit theme later
      const saved = loadPrefs();
      if(saved.theme === 'light' || saved.theme === 'dark') return;
      state.theme = e.matches ? 'dark' : 'light';
      applyTheme(state.theme);
    });
  }
  if(prefs.contrast){ document.body.classList.add('contrast'); const ct=$('#contrast-toggle'); ct?.setAttribute('aria-pressed','true'); const hc=$('#high-contrast'); if(hc) hc.checked = true; }
  renderRoleBadge();
  renderStats();
  renderAlertFeed();
  renderShelters();
  renderSupplies();
  renderVerify();
  renderVolunteers();

  // Initialize new functionality
  initProfileDropdown();
  initEducationTabs();
  initVideoInteractions();
  initTabs(); // Keyboard-friendly tabs

  // Apply icons directly from assets/icons
  applyIcons(document);

  // (lightbox removed in simplified setup)

  // Initialize hazard and region filters/selects
  initHazardFilters();
  initRegionFilters();
});

// Init: hazard filters + broadcast select
function initHazardFilters(){
  const container = document.getElementById('hazard-filters');
  const selBroadcast = document.getElementById('alert-hazard');
  if(container){
    container.innerHTML = '';
    HAZARDS.forEach(h=>{
      const id = `haz-${h.toLowerCase().replace(/\s+/g,'-')}`;
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" id="${id}" value="${h}"> ${h}`;
      // On change, update filter set and re-render
      label.querySelector('input').addEventListener('change', (e)=>{
        const checked = e.target.checked;
        if(checked) filters.hazards.add(h); else filters.hazards.delete(h);
        renderAlertFeed();
      });
      container.appendChild(label);
    });
  }
  if(selBroadcast){
    selBroadcast.innerHTML = HAZARDS.map(h=>`<option>${h}</option>`).join('');
  }
  // Clear filters button
  const clearBtn = document.getElementById('clear-filters');
  if(clearBtn){
    clearBtn.addEventListener('click', ()=>{
      filters.hazards.clear(); filters.state=''; filters.district='';
      // Uncheck all hazard checkboxes
      container?.querySelectorAll('input[type="checkbox"]').forEach(i=> i.checked=false);
      // Reset selects
      const fs = document.getElementById('filter-state'); if(fs) fs.value='';
      const fd = document.getElementById('filter-district'); if(fd) fd.innerHTML = `<option value="">All districts</option>`;
      renderAlertFeed();
    });
  }
}

// Init: state/district selects
function initRegionFilters(){
  const fs = document.getElementById('filter-state');
  const fd = document.getElementById('filter-district');
  const as = document.getElementById('alert-state');
  const ad = document.getElementById('alert-district');

  // Helper to fill a select with options (first option is placeholder)
  const fillSelect = (sel, placeholder, values=[])=>{
    if(!sel) return;
    const opts = [`<option value="">${placeholder}</option>`].concat(values.map(v=>`<option>${v}</option>`));
    sel.innerHTML = opts.join('');
  };

  // Initialize states
  fillSelect(fs, 'All states/UT', STATES);
  fillSelect(as, 'Select state/UT', STATES);
  // Initialize districts
  fillSelect(fd, 'All districts');
  fillSelect(ad, 'Select district');

  // When a state is chosen in filters, update districts and filter state
  fs?.addEventListener('change', (e)=>{
    filters.state = e.target.value || '';
    const districts = DISTRICTS_BY_STATE[filters.state] || [];
    fillSelect(fd, 'All districts', districts);
    filters.district = '';
    renderAlertFeed();
  });

  // Filter by district
  fd?.addEventListener('change', (e)=>{
    filters.district = e.target.value || '';
    renderAlertFeed();
  });

  // Broadcast side: when choosing a state, populate district list
  as?.addEventListener('change', (e)=>{
    const st = e.target.value || '';
    const districts = DISTRICTS_BY_STATE[st] || [];
    fillSelect(ad, 'Select district', districts);
  });
}