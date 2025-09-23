// This script needs a much more optimization after including maps and icons. Need to update from time to time.
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));


const state = {
  role: 'citizen',
  lang: 'en',
  theme: undefined, // 'light' | 'dark' | undefined (system)
  // Community chat (simple local-first demo; replace with backend/Firebase later)
  chat: {
    // messages: [{ id, user, role, text, ts }]
    messages: []
  },
  // Alerts include hazard + region fields for filtering
  alerts: [
    // Demo entries include approximate coordinates for mapping
    {time:'14:05', hazard:'Heavy Rain', sev:'High', msg:'Red alert: Heavy rainfall expected next 12h', state:'Kerala', district:'Alappuzha', area:'Alappuzha, Kerala', lat:9.4981, lng:76.3388},
    {time:'13:40', hazard:'Flood', sev:'Medium', msg:'River level rising, avoid low-lying zones', state:'Bihar', district:'Saharsa', area:'Saharsa, Bihar', lat:25.8793, lng:86.5961},
    {time:'13:10', hazard:'Heatwave', sev:'Low', msg:'Heat advisory lifted for today', state:'Maharashtra', district:'Nagpur', area:'Nagpur, Maharashtra', lat:21.1458, lng:79.0882}
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

// =======================
// Maps (Leaflet)
// =======================
let maps = { alerts: null, reports: null, risk: null, resources: null };
let layers = { alerts: null, reports: null, shelters: null };
let clusters = { alerts: null };
// Track a per-map "you are here" marker so we can update instead of duplicating
let myLocationMarkers = { alerts: null, reports: null, risk: null, resources: null };
// Track per-map live watch and whether we've centered once
let myLocationWatchIds = { alerts: null, reports: null, risk: null, resources: null };
let myLocationCentered = { alerts: false, reports: false, risk: false, resources: false };

function initMaps(){
  // Only init if Leaflet is loaded and containers exist
  if(typeof L === 'undefined') return;
  const alertsEl = document.getElementById('alerts-map');
  const reportEl = document.getElementById('report-map');
  const riskEl = document.getElementById('risk-map');
  const resourcesEl = document.getElementById('resources-map');

  const defaultCenter = [20.5937, 78.9629]; // India centroid
  const defaultZoom = 5;

  const make = (el) => {
    if(!el) return null;
    const m = L.map(el, { attributionControl: true, zoomControl: true }).setView(defaultCenter, defaultZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(m);
    return m;
  };

  if(alertsEl && !maps.alerts) maps.alerts = make(alertsEl);
  if(reportEl && !maps.reports) maps.reports = make(reportEl);
  if(riskEl && !maps.risk) maps.risk = make(riskEl);
  if(resourcesEl && !maps.resources) maps.resources = make(resourcesEl);

  // Alerts layer: prefer clustering if plugin exists
  if(maps.alerts && !layers.alerts){
    if(typeof L.markerClusterGroup === 'function'){
      clusters.alerts = L.markerClusterGroup({
        disableClusteringAtZoom: 10,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false
      }).addTo(maps.alerts);
    } else {
      layers.alerts = L.layerGroup().addTo(maps.alerts);
    }
  }
  if(maps.reports && !layers.reports) layers.reports = L.layerGroup().addTo(maps.reports);
  if(maps.resources && !layers.shelters) layers.shelters = L.layerGroup().addTo(maps.resources);
}

function colorForSeverity(sev){
  if(sev === 'Severe' || sev === 'High') return '#e11d48'; // rose-600
  if(sev === 'Medium') return '#eab308'; // amber-500
  return '#10b981'; // emerald-500
}

function renderAlertMarkers(){
  if(!maps.alerts) return;
  if(clusters.alerts){ clusters.alerts.clearLayers(); } else if(layers.alerts){ layers.alerts.clearLayers(); }
  const passes = (a)=>{
    const hazardOk = filters.hazards.size ? filters.hazards.has(a.hazard) : true;
    const stateOk = filters.state ? a.state === filters.state : true;
    const districtOk = filters.district ? a.district === filters.district : true;
    return hazardOk && stateOk && districtOk;
  };
  const filtered = state.alerts.filter(passes);
  const points = [];
  filtered.forEach(a=>{
    if(typeof a.lat === 'number' && typeof a.lng === 'number'){
      const style = { radius: 7, color: colorForSeverity(a.sev), fillColor: colorForSeverity(a.sev), fillOpacity: 0.85, weight: 1 };
      const marker = L.circleMarker([a.lat, a.lng], style).bindPopup(`<strong>${a.hazard}</strong> (${a.sev})<br>${a.msg}<br><small>${a.area}</small>`);
      if(clusters.alerts) clusters.alerts.addLayer(marker); else layers.alerts.addLayer(marker);
      points.push([a.lat, a.lng]);
    }
  });
  if(points.length >= 2){ maps.alerts.fitBounds(points, { padding: [20,20] }); }
  else if(points.length === 1){ maps.alerts.setView(points[0], 10); }
}

function renderReportMarkers(){
  if(!maps.reports || !layers.reports) return;
  layers.reports.clearLayers();
  // Mock geocoding: map a few known place names to coordinates for demo
  const seed = [
    {loc:'Khagaria', lat:25.5022, lng:86.4671},
    {loc:'Mandi', lat:31.5892, lng:76.9182},
    {loc:'Kolkata', lat:22.5726, lng:88.3639},
  ];
  const points = [];
  state.verifyQueue.forEach((r,i)=>{
    const m = seed[i % seed.length];
    if(m){
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 6,
        color: '#38bdf8',
        fillColor: '#38bdf8',
        fillOpacity: 0.85,
        weight: 1
      }).bindPopup(`<strong>${r.type}</strong> — ${r.status}<br><small>${r.loc}</small>`);
      layers.reports.addLayer(marker);
      points.push([m.lat, m.lng]);
    }
  });
  if(points.length >= 2){ maps.reports.fitBounds(points, { padding: [20,20] }); }
  else if(points.length === 1){ maps.reports.setView(points[0], 10); }
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
  // Update alert markers when list/filter changes
  renderAlertMarkers();
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
    const viewEl = document.getElementById(id);
    viewEl?.classList.add('active');
    // When a tab becomes visible, Leaflet maps need a size invalidation
    if(typeof L !== 'undefined'){
      requestAnimationFrame(()=>{
        try{
          if(id === 'alerts-view' && maps.alerts) maps.alerts.invalidateSize();
          if(id === 'report-view' && maps.reports) maps.reports.invalidateSize();
          if(id === 'map-view' && maps.risk) maps.risk.invalidateSize();
          if(id === 'resources-view' && maps.resources) maps.resources.invalidateSize();
        }catch{}
      });
    }
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

// =======================
// Community Chat (Volunteers)
// =======================
const CHAT_STORAGE_KEY = 'dm_chat_messages_v1';

function loadChat(){
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if(Array.isArray(arr)) state.chat.messages = arr;
  } catch {}
}
function persistChat(){
  try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state.chat.messages)); } catch {}
}

function renderChat(){
  const list = document.getElementById('chat-messages');
  if(!list) return;
  list.innerHTML = '';
  state.chat.messages.slice(-200).forEach(m => {
    const li = document.createElement('li');
    li.className = 'chat-msg';
    const who = document.createElement('span'); who.className = 'who'; who.textContent = m.user || 'Anon';
    const time = document.createElement('span'); time.className = 'time'; time.textContent = new Date(m.ts).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    const role = document.createElement('span'); role.className = 'time'; role.textContent = m.role ? `• ${m.role.toUpperCase()}` : '';
    const bubble = document.createElement('div'); bubble.className = 'chat-bubble'; bubble.textContent = m.text;
    if(m.role === 'authority' || m.role === 'ndrf') bubble.classList.add('official');
    if(m.user === 'Me') bubble.classList.add('me');
    li.appendChild(who); li.appendChild(role); li.appendChild(time); li.appendChild(bubble);
    list.appendChild(li);
  });
  // Scroll to bottom smoothly
  const body = document.getElementById('chat-body');
  body && (body.scrollTop = body.scrollHeight);
}

function pushChatMessage(text, { fromMe = false } = {}){
  const msg = {
    id: Math.random().toString(36).slice(2),
    user: fromMe ? 'Me' : 'Volunteer',
    role: fromMe ? state.role : 'ngo',
    text: text.trim(),
    ts: Date.now()
  };
  state.chat.messages.push(msg);
  // Keep a hard cap to avoid unbounded growth
  if(state.chat.messages.length > 500) state.chat.messages = state.chat.messages.slice(-500);
  persistChat();
  renderChat();
}

function clearChatAll(){
  state.chat.messages = [];
  persistChat();
  renderChat();
}

function initChat(){
  loadChat();
  renderChat();
  const toggle = document.getElementById('chat-toggle');
  const panel = document.getElementById('chat-panel');
  const closeBtn = document.getElementById('chat-close');
  const sendBtn = document.getElementById('chat-send');
  const input = document.getElementById('chat-text');
  const clearBtn = document.getElementById('chat-clear');

  if(!toggle || !panel) return;

  const applyAria = (isOpen) => {
    toggle?.setAttribute('aria-expanded', String(isOpen));
    panel?.setAttribute('aria-hidden', String(!isOpen));
  };
  const open = () => { panel.classList.add('active'); panel.style.display = 'flex'; applyAria(true); input?.focus(); };
  const close = () => { panel.classList.remove('active'); panel.style.display = 'none'; applyAria(false); toggle?.focus(); };
  // Initialize aria state
  applyAria(false);
  panel.style.display = 'none';

  toggle.addEventListener('click', () => {
    const nowOpen = !panel.classList.contains('active');
    if(nowOpen) open(); else close();
  });
  closeBtn?.addEventListener('click', close);

  // Close when pressing Escape inside the panel
  panel.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') close(); });

  // Send message
  function handleSend(){
    const val = input?.value.trim();
    if(!val) return;
    pushChatMessage(val, { fromMe: true });
    input.value = '';
  }
  sendBtn?.addEventListener('click', handleSend);
  input?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); handleSend(); } });

  // Clear (only for authority/ndrf roles), UI gated via .role-only classes, but double gate in JS
  clearBtn?.addEventListener('click', ()=>{
    if(state.role === 'authority' || state.role === 'ndrf'){
      if(confirm('Clear chat for everyone? This removes all messages.')) clearChatAll();
    }
  });

  // Demo: if empty, seed a welcome message
  if(state.chat.messages.length === 0){
    state.chat.messages.push({ id:'seed1', user:'System', role:'authority', text:'Welcome to the community chat. Coordinate respectfully. Officials may moderate.', ts: Date.now() });
    persistChat();
    renderChat();
  }

  // Hide chat when leaving Volunteers tab
  const tabs = document.querySelectorAll('.tabs [role="tab"]');
  tabs.forEach(t => t.addEventListener('click', () => {
    const controls = t.getAttribute('aria-controls');
    if(controls !== 'volunteers-view' && panel.classList.contains('active')){
      close();
    }
  }));
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
  renderReportMarkers();
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
  renderReportMarkers();
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
  initChat(); // Community chat

  // Apply icons directly from assets/icons
  applyIcons(document);

  // (lightbox removed in simplified setup)

  // Initialize hazard and region filters/selects
  initHazardFilters();
  initRegionFilters();

  // Initialize maps and render initial markers
  initMaps();
  renderAlertMarkers();
  renderReportMarkers();
  renderShelterMarkers();
  // Optional: center one map to user location for demo
  geolocateAndCenter(maps.alerts || maps.resources || maps.reports, { silent: true });

  // Locate me buttons
  document.getElementById('locate-alerts')?.addEventListener('click', ()=> geolocateAndCenter(maps.alerts));
  document.getElementById('locate-reports')?.addEventListener('click', ()=> geolocateAndCenter(maps.reports));
  document.getElementById('locate-risk')?.addEventListener('click', ()=> geolocateAndCenter(maps.risk));
  document.getElementById('locate-resources')?.addEventListener('click', ()=> geolocateAndCenter(maps.resources));
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

// Resources: plot shelters with availability color
function renderShelterMarkers(){
  if(!maps.resources || !layers.shelters) return;
  layers.shelters.clearLayers();
  const points = [];
  // Demo: assign rough coordinates based on name index
  const rough = [
    [28.6139, 77.2090], // Delhi
    [19.0760, 72.8777], // Mumbai
    [13.0827, 80.2707], // Chennai
    [22.5726, 88.3639], // Kolkata
  ];
  state.shelters.forEach((s, i)=>{
    const [lat,lng] = rough[i % rough.length];
    const ratio = s.avail / Math.max(1, s.cap);
    const color = ratio > 0.6 ? '#10b981' : (ratio > 0.3 ? '#eab308' : '#e11d48');
    const m = L.circleMarker([lat,lng], { radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 1 })
      .bindPopup(`<strong>${s.name}</strong><br>Capacity: ${s.cap}<br>Available: ${s.avail}<br>Contact: ${s.contact}`);
    layers.shelters.addLayer(m);
    points.push([lat,lng]);
  });
  if(points.length >= 2) maps.resources.fitBounds(points, { padding: [20,20] });
  else if(points.length === 1) maps.resources.setView(points[0], 12);
}

// Helpers for geolocation UI near the map
function mapKeyFor(map){ return Object.keys(maps).find(k => maps[k] === map) || null; }
function mapHelpEl(map){
  try{
    const container = typeof map.getContainer === 'function' ? map.getContainer() : map._container;
    const body = container?.parentElement;
    return body?.querySelector('.help');
  }catch{ return null; }
}
function setMapHelp(map, text){ const el = mapHelpEl(map); if(el){ el.textContent = text; } }

function updateMyLocationMarker(map, coords){
  if(typeof L === 'undefined') return;
  const key = mapKeyFor(map);
  if(!key) return;
  const { latitude, longitude } = coords;
  const latlng = [latitude, longitude];
  if(myLocationMarkers[key]){
    try{ myLocationMarkers[key].setLatLng(latlng); }catch{}
  } else {
    myLocationMarkers[key] = L.circleMarker(latlng, {
      radius: 6,
      color: '#2563eb',
      fillColor: '#3b82f6',
      fillOpacity: 0.95,
      weight: 2
    }).bindPopup('You are here').addTo(map);
  }
}

function startLocationWatch(map){
  const key = mapKeyFor(map);
  if(!key) return;
  // Clear previous watch if any
  if(myLocationWatchIds[key] !== null){
    try{ navigator.geolocation.clearWatch(myLocationWatchIds[key]); }catch{}
    myLocationWatchIds[key] = null;
  }
  myLocationCentered[key] = false;
  const id = navigator.geolocation.watchPosition((pos)=>{
    updateMyLocationMarker(map, pos.coords);
    if(!myLocationCentered[key]){ map.setView([pos.coords.latitude, pos.coords.longitude], 13); myLocationCentered[key] = true; }
  }, (err)=>{
    console.warn('watchPosition error', err);
    const code = err && err.code;
    if(code === 1){ // PERMISSION_DENIED
      setMapHelp(map, 'Location permission denied. Click the lock icon in the address bar, allow Location, and try again.');
    } else if(code === 2){
      setMapHelp(map, 'Location unavailable. Ensure GPS/location services are enabled and try again.');
    } else if(code === 3){
      setMapHelp(map, 'Location request timed out. Try again.');
    } else {
      setMapHelp(map, 'Unable to access your location.');
    }
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  myLocationWatchIds[key] = id;
}

// Geolocation helper to center a map and trigger browser permission prompt on click
function geolocateAndCenter(map, { silent = false } = {}){
  if(!map){ if(!silent) setMapHelp(map, 'Map is not ready yet.'); return; }
  if(!('geolocation' in navigator)){ if(!silent) setMapHelp(map, 'Geolocation is not supported by your browser.'); return; }

  // Check secure context (required by browsers)
  const isLocalhost = ['localhost','127.0.0.1','::1'].includes(location.hostname);
  const isSecure = (window.isSecureContext === true) || location.protocol === 'https:' || isLocalhost;
  if(!isSecure){ setMapHelp(map, 'Location is blocked on insecure pages. Serve over HTTPS or http://localhost and try again.'); return; }

  const triggerPromptViaGetCurrentPosition = ()=>{
    setMapHelp(map, 'Requesting location…');
    navigator.geolocation.getCurrentPosition((pos)=>{
      // Center once and start live updates
      updateMyLocationMarker(map, pos.coords);
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      startLocationWatch(map);
      setMapHelp(map, 'Live location enabled.');
    }, (err)=>{
      if(silent){ console.warn('Geolocation failed:', err); return; }
      const code = err && err.code;
      if(code === 1){
        setMapHelp(map, 'Location permission denied. Use site settings to allow Location and click "Locate me" again.');
      } else if(code === 2){
        setMapHelp(map, 'Location unavailable. Ensure GPS/location services are enabled.');
      } else if(code === 3){
        setMapHelp(map, 'Location request timed out. Try again.');
      } else {
        setMapHelp(map, 'Unable to access your location.');
      }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  };

  // Use Permissions API when available to decide the best flow
  if(navigator.permissions && navigator.permissions.query){
    try{
      navigator.permissions.query({ name: 'geolocation' }).then((status)=>{
        if(status.state === 'granted'){
          startLocationWatch(map);
          setMapHelp(map, 'Live location enabled.');
        } else if(status.state === 'prompt'){
          // Only show the browser permission prompt when not in silent mode
          if(silent){
            setMapHelp(map, 'Click "Locate me" to enable live location.');
            return;
          }
          triggerPromptViaGetCurrentPosition();
        } else { // denied
          if(!silent) setMapHelp(map, 'Location permission is blocked. Click the lock icon → Site settings → Allow Location, then try again.');
        }
      }).catch(()=> triggerPromptViaGetCurrentPosition());
    }catch{ triggerPromptViaGetCurrentPosition(); }
  } else {
    // Fallback: only attempt prompt when not silent
    if(!silent) triggerPromptViaGetCurrentPosition();
  }
}