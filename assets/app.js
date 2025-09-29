// This script needs a much more optimization after including maps and icons. Need to update from time to time.
const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

function apiBase(){
  const base = window.API_BASE || '';
  return base ? base.replace(/\/$/, '') : '';
}

let supabaseModulePromise = null;
async function getSupabaseModule(){
  if(!supabaseModulePromise){
    supabaseModulePromise = import('./supabase.js').catch(()=>null);
  }
  return supabaseModulePromise;
}

async function getSupabaseToken(){
  try{
    const mod = await getSupabaseModule();
    if(!mod) return null;
    const { data } = await mod.supabase.auth.getSession();
    return data?.session?.access_token || null;
  }catch{
    return null;
  }
}

const VOLUNTEER_TABLE = 'volunteer_applications';

function coerceSkillList(value){
  if(Array.isArray(value)){
    return value.map((skill)=> String(skill || '').trim()).filter(Boolean);
  }
  if(typeof value === 'string'){
    return value.split(',').map((skill)=> skill.trim()).filter(Boolean);
  }
  if(typeof value === 'object' && value !== null && Array.isArray(value.skills)){
    return coerceSkillList(value.skills);
  }
  return [];
}

function mapVolunteerRow(row){
  if(!row) return null;
  const fullName = row.full_name || row.fullName || row.name || '';
  const normalizedSkills = coerceSkillList(row.skills ?? row.skill ?? row.skills_list);
  return {
    id: row.id,
    fullName,
    name: fullName,
    email: row.email || '',
    phone: row.phone || '',
    skills: normalizedSkills,
    availability: row.availability || '',
    preferredLocation: row.preferred_location || row.preferredLocation || row.location || '',
    motivation: row.motivation || '',
    status: row.status || 'pending',
    createdAt: row.created_at || row.createdAt || row.ts || null,
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    reviewedBy: row.reviewed_by || row.reviewedBy || null,
    notes: row.notes || '',
    createdBy: row.created_by || row.createdBy || null,
    actionStatus: row.action_status || row.actionStatus || null
  };
}

function supabaseErrorMessage(error, fallback = 'Unexpected error'){
  if(!error) return fallback;
  return error.message || error.error_description || error.details || error.hint || fallback;
}

let volunteerRealtimeUnsub = null;
let volunteerRefreshTimeoutId = null;

async function apiFetch(path, { method = 'GET', headers = {}, body, auth = false, signal } = {}){
  const base = apiBase();
  // Allow relative paths when base is not configured for local development
  const url = base 
    ? `${base}${path.startsWith('/') ? path : `/${path}`}`
    : path.startsWith('/') ? path : `/${path}`;
  const init = { method, headers: { ...headers }, credentials: 'include', signal };
  if(body instanceof FormData){
    init.body = body;
  } else if(body !== undefined){
    init.headers['Content-Type'] = init.headers['Content-Type'] || 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  if(auth){
    const token = await getSupabaseToken();
    if(!token){
      throw new Error('Authorization required but no active session found.');
    }
    init.headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, init);
  return res;
}

async function fetchJson(path, options){
  const res = await apiFetch(path, options);
  const data = await res.json().catch(()=>null);
  if(!res.ok){
    const error = (data && (data.error || data.message)) || res.statusText;
    const err = new Error(error);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}


const state = {
  role: 'citizen',
  lang: 'en',
  theme: undefined, // 'light' | 'dark' | undefined (system)
  // Community chat (simple local-first demo; replaced with Supabase backend)
  chat: {
    // messages: [{ id, user, role, text, ts }]
    messages: []
  },
  // Alerts include hazard + region fields for filtering
  alerts: [
    // Demo entries include approximate coordinates for mapping
    {time:'14:05', hazard:'Heavy Rain', sev:'High', msg:'Red alert: Heavy rainfall expected next 12h', state:'Kerala', district:'Alappuzha', area:'Alappuzha, Kerala', lat:9.4981, lng:76.3388},
    {time:'13:40', hazard:'Flood', sev:'Medium', msg:'River level rising, avoid low-lying zones', state:'Bihar', district:'Saharsa', area:'Saharsa, Bihar', lat:25.8793, lng:86.5961},
    {time:'13:18', hazard:'Earthquake', sev:'Severe', msg:'4.9 magnitude tremor felt. Inspect structures for damage.', state:'Sikkim', district:'Mangan', area:'North Sikkim', lat:27.6106, lng:88.4647},
    {time:'13:10', hazard:'Heatwave', sev:'Low', msg:'Heat advisory lifted for today', state:'Maharashtra', district:'Nagpur', area:'Nagpur, Maharashtra', lat:21.1458, lng:79.0882},
    {time:'12:48', hazard:'Drought', sev:'Medium', msg:'Reservoir levels below 30%. Initiate water rationing advisories.', state:'Karnataka', district:'Koppal', area:'Koppal, Karnataka', lat:15.3540, lng:76.1558}
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
  volunteers: [],
  volunteerApplications: [],
  tasks:[],
  resourceCenters: [
    { name: 'Community Kitchen', type: 'food', lat: 19.0760, lng: 72.8777, details: 'Hot meals three times a day', contact: '+91-22-5551-0101' },
    { name: 'Field Medical Camp', type: 'medicine', lat: 28.6139, lng: 77.2090, details: '24/7 paramedic support', contact: '+91-11-2201-4422' },
    { name: 'Temporary Relief Depot', type: 'supply', lat: 12.9716, lng: 77.5946, details: 'Dry ration and water stock', contact: '+91-80-3300-9988' },
    { name: 'Cyclone Shelter Complex', type: 'shelter', lat: 21.4942, lng: 86.9313, details: 'Reinforced shelter with 600 bed capacity', contact: '+91-674-228-1122' }
  ],
  hazardHotspots: [
    { name: 'Seismic Zone V Monitoring Post', type: 'earthquake', lat: 28.2740, lng: 83.9721, details: 'Seismic sensors watching Himalayan fault line', advisory: 'Inspect lifeline infrastructure, be ready for aftershocks.' },
    { name: 'Bundelkhand Drought Watch', type: 'drought', lat: 25.4358, lng: 80.3319, details: 'Remote sensing indicates soil moisture deficit', advisory: 'Trigger tanker supply plans and community messaging.' },
    { name: 'Mega Relief Warehouse', type: 'food', lat: 22.3072, lng: 73.1812, details: 'Bulk food grains and ready-to-eat meals', advisory: 'Coordinate last mile delivery partners.' },
    { name: 'Mobile Field Hospital', type: 'medicine', lat: 13.3392, lng: 77.1135, details: 'Surgical unit with trauma specialists', advisory: 'Pre-register critical cases and blood donors.' },
    { name: 'Multi-purpose Cyclone Shelter', type: 'shelter', lat: 19.8122, lng: 85.8283, details: 'Raised platform shelter with resilient power', advisory: 'Activate evac shuttles for coastal hamlets.' }
  ],
  hospitals: [
    { name: 'General Hospital', type: 'hospital', lat: 28.6139, lng: 77.2090, details: '24/7 emergency services', contact: '+91-11-2201-4422' },
    { name: 'City Hospital', type: 'hospital', lat: 19.0760, lng: 72.8777, details: 'Multi-specialty hospital', contact: '+91-22-5551-0101' }
  ],
  food_resources: [
    { name: 'Community Kitchen', type: 'food', lat: 12.9716, lng: 77.5946, details: 'Hot meals three times a day', contact: '+91-80-3300-9988' },
    { name: 'Food Bank', type: 'food', lat: 21.1458, lng: 79.0882, details: 'Dry ration distribution', contact: '+91-712-555-1234' }
  ]
};

function isAdminRole(role = state.role){
  return role === 'authority' || role === 'ndrf';
}

const VOLUNTEER_SKILLS = [
  { id: 'first-aid', label: 'First Aid & CPR' },
  { id: 'logistics', label: 'Logistics & Supply Chain' },
  { id: 'search-rescue', label: 'Search & Rescue' },
  { id: 'medical', label: 'Medical / Nursing' },
  { id: 'counselling', label: 'Psychological Support' },
  { id: 'tech-maps', label: 'GIS / Mapping' },
  { id: 'communications', label: 'Radio / Communications' },
  { id: 'community', label: 'Community Outreach' }
];

const MAP_ICON_ASSETS = {
  location: 'location.png',
  shelter: 'shelter.png',
  food: 'food.png',
  supply: 'food.png',
  medical: 'hospital.png',
  medicine: 'hospital.png',
  hospital: 'hospital.png',
  school: 'school.png',
  drought: 'drought.png',
  flood: 'flood.png',
  earthquake: 'earthquake.png'
};

const HAZARD_ICON_LOOKUP = {
  Flood: 'flood',
  'Heavy Rain': 'flood',
  Cyclone: 'flood',
  Tsunami: 'flood',
  Storm: 'flood',
  Drought: 'drought',
  Heatwave: 'drought',
  'Cold Wave': 'drought',
  Earthquake: 'earthquake',
  Landslide: 'earthquake',
  Avalanche: 'earthquake',
  Health: 'medical',
  Fire: 'supply',
  'Forest Fire': 'supply'
};

const mapIconCache = new Map();
function getMapIcon(name) {
  if (typeof L === 'undefined') return null;
  const asset = MAP_ICON_ASSETS[name] || MAP_ICON_ASSETS.location;
  const cacheKey = asset;
  if (mapIconCache.has(cacheKey)) return mapIconCache.get(cacheKey);
  const icon = L.icon({
    iconUrl: `assets/map_icon/${asset}`,
    iconSize: [36, 36],
    iconAnchor: [18, 34],
    popupAnchor: [0, -28],
    className: 'map-marker-icon'
  });
  mapIconCache.set(cacheKey, icon);
  return icon;
}

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
let layers = { alerts: null, reports: null, shelters: null, resourceCenters: null, riskHotspots: null };
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
  if(maps.resources && !layers.resourceCenters) layers.resourceCenters = L.layerGroup().addTo(maps.resources);
  if(maps.risk && !layers.riskHotspots) layers.riskHotspots = L.layerGroup().addTo(maps.risk);
  if(maps.risk && !layers.drought) layers.drought = L.layerGroup().addTo(maps.risk);
  if(maps.risk && !layers.earthquake) layers.earthquake = L.layerGroup().addTo(maps.risk);
  if(maps.risk && !layers.flood) layers.flood = L.layerGroup().addTo(maps.risk);
  if(maps.risk && !layers.shelter) layers.shelter = L.layerGroup().addTo(maps.risk);
  if(maps.risk && !layers.hospital) layers.hospital = L.layerGroup().addTo(maps.risk);
  if(maps.risk && !layers.food) layers.food = L.layerGroup().addTo(maps.risk);
}

function initLayerToggles() {
  $$('.layer-toggle').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const layerName = checkbox.dataset.layer;
      if (layerName === 'heatmap') {
        if (checkbox.checked) {
          renderHeatmap();
        } else {
          if (layers.heatmap) {
            layers.heatmap.clearLayers();
          }
        }
      } else if (layers[layerName]) {
        if (checkbox.checked) {
          maps.risk.addLayer(layers[layerName]);
        } else {
          maps.risk.removeLayer(layers[layerName]);
        }
      }
    });
  });
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
      const hz = (window.I18n ? I18n.t('hazards.'+a.hazard) : a.hazard);
      const sevKey = 'severity.' + String(a.sev||'').toLowerCase();
      const sev = (window.I18n ? I18n.t(sevKey) : a.sev);
      const iconKey = HAZARD_ICON_LOOKUP[a.hazard] || 'location';
      const icon = getMapIcon(iconKey);
      const marker = L.marker([a.lat, a.lng], { icon: icon || undefined, title: hz })
        .bindPopup(`<strong>${hz}</strong> (${sev})<br>${a.msg}<br><small>${a.area}</small>`);
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
      const iconKey = HAZARD_ICON_LOOKUP[r.type] || 'location';
      const icon = getMapIcon(iconKey);
      const marker = L.marker([m.lat, m.lng], { icon: icon || undefined })
        .bindPopup(() => {
        const typeLabel = (window.I18n ? I18n.t('hazards.'+r.type) : r.type);
        const statusKey = 'status.' + String(r.status||'').toLowerCase();
        const statusLabel = (window.I18n ? (I18n.t(statusKey) || r.status) : r.status);
        return `<strong>${typeLabel}</strong> — ${statusLabel}<br><small>${r.loc}</small>`;
      });
      layers.reports.addLayer(marker);
      points.push([m.lat, m.lng]);
    }
  });
  if(points.length >= 2){ maps.reports.fitBounds(points, { padding: [20,20] }); }
  else if(points.length === 1){ maps.reports.setView(points[0], 10); }
}

// Read a locked role (set during auth) and constrain UI accordingly
function getLockedRole(){
  try{
    const lr = localStorage.getItem('dm_role');
    const locked = localStorage.getItem('dm_role_locked') === '1';
    return locked && lr ? lr : null;
  }catch{ return null; }
}

// Render: role display + role-gated blocks
function renderRoleBadge(){
  const T = (k)=> (window.I18n ? I18n.t(k) : k);
  const map = {citizen:T('role.citizen'), authority:T('role.authority'), ndrf:T('role.ndrf'), ngo:T('role.ngo')};
  const roleName = map[state.role];

  // Update main role display
  const rd = $('#role-display');
  if(rd){ rd.textContent = `${T('role.label')}: ${roleName}`; }

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

  // If role is locked, disable the role selector to prevent switching
  const rs = document.getElementById('role-select');
  const locked = !!getLockedRole();
  if(rs){
    rs.disabled = locked;
    // Keep the select value synced with state
    rs.value = state.role;
    rs.title = locked ? 'Role is assigned based on your account' : 'Select user role';
    // Optionally hide the control when locked to avoid confusion
    rs.style.display = locked ? 'none' : '';
  }

  if(isAdminRole(state.role)){
    loadPendingVolunteerApplications({ silent: true });
    initDrawing();
  } else if(state.volunteerApplications.length){
    state.volunteerApplications = [];
    renderVolunteerApplications();
  }
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
      const hz = (window.I18n ? I18n.t('hazards.'+a.hazard) : a.hazard);
      const sevKey = 'severity.' + String(a.sev||'').toLowerCase();
      const sev = (window.I18n ? I18n.t(sevKey) : a.sev);
      li.innerHTML = `<span class="kbd">${a.time}</span> <span class="chip">${hz}</span> <span class="${sevClass(a.sev)}">${sev}</span> — ${a.msg} <span class="muted">(${a.area})</span>`;
      feed.appendChild(li);
    });
  }

  // Table rows
  const tbody = $('#alerts-table'); 
  if(tbody){
    tbody.innerHTML='';
    filtered.forEach(a=>{
      const hz = (window.I18n ? I18n.t('hazards.'+a.hazard) : a.hazard);
      const sevKey = 'severity.' + String(a.sev||'').toLowerCase();
      const sev = (window.I18n ? I18n.t(sevKey) : a.sev);
      tbody.insertAdjacentHTML('beforeend', `<tr>
        <td>${a.time}</td>
        <td><span class="chip">${hz}</span></td>
        <td>${sev}</td>
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
    const typeLabel = (window.I18n ? I18n.t('hazards.'+r.type) : r.type);
    const statusKey = 'status.' + String(r.status||'').toLowerCase();
    const statusLabel = (window.I18n ? (I18n.t(statusKey) || r.status) : r.status);
    const isPending = !r.status || /pending/i.test(r.status);
    tb.insertAdjacentHTML('beforeend', `<tr>
      <td>${r.time}</td><td>${typeLabel}</td><td>${r.loc}</td><td>${statusLabel || (window.I18n ? I18n.t('status.pending') : 'Pending')}</td>
      <td>
        ${isPending ? `
          <button class="btn brand" data-act="approve" data-idx="${i}">${window.I18n ? I18n.t('btn.approve') : 'Approve'}</button>
          <button class="btn danger" data-act="reject" data-idx="${i}">${window.I18n ? I18n.t('btn.reject') : 'Reject'}</button>
        ` : `<span class="muted">${window.I18n ? I18n.t('status.reviewed') || 'Reviewed' : 'Reviewed'}</span>`}
      </td></tr>`);
  });
}

// Render: volunteers + dropdown
function renderVolunteers(){
  const tb = $('#volunteer-list');
  if(!tb) return;
  tb.innerHTML='';
  const volunteers = Array.isArray(state.volunteers) ? state.volunteers : [];
  const sel = $('#task-volunteer');
  if(sel) {
    sel.innerHTML=`<option value="">${window.I18n ? I18n.t('common.select') : 'Select'}</option>`;
  }

  if(volunteers.length === 0){
    tb.insertAdjacentHTML('beforeend', `<tr><td colspan="4" class="muted">${window.I18n ? (I18n.t('volunteer.board.empty') || 'No approved volunteers yet.') : 'Volunteer approvals pending review.'}</td></tr>`);
    renderTasks();
    return;
  }

  volunteers.forEach(v=>{
    const skills = Array.isArray(v.skills) ? v.skills : (v.skill ? [v.skill] : []);
    const skillLabel = skills.length ? skills.join(', ') : (window.I18n ? I18n.t('common.na') || '—' : '—');
    const areaRaw = v.preferredLocation || v.area || '';
    const areaLabel = areaRaw ? areaRaw : (window.I18n ? (I18n.t('common.na') || '—') : '—');
    // Normalize status display - show "Approved" instead of raw status
    const rawStatus = String(v.status || '').toLowerCase();
    let statusLabel = 'Volunteer';
    if(rawStatus.includes('approved') || rawStatus.includes('active')) {
      statusLabel = window.I18n ? (I18n.t('status.approved') || 'Approved') : 'Approved';
    } else if(rawStatus.includes('pending')) {
      statusLabel = window.I18n ? (I18n.t('status.pending') || 'Pending') : 'Pending';
    } else if(v.status) {
      statusLabel = String(v.status).charAt(0).toUpperCase() + String(v.status).slice(1).toLowerCase();
    }
    tb.insertAdjacentHTML('beforeend', `<tr><td>${v.name || v.fullName || '—'}</td><td>${skillLabel}</td><td>${areaLabel}</td><td>${statusLabel}</td></tr>`);
    if(sel) {
      const opt = document.createElement('option');
      opt.value = v.name || v.fullName || '';
      opt.textContent = v.name || v.fullName || '';
      if(opt.value) sel.appendChild(opt);
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
    const statusKey = 'status.' + String(t.status||'').toLowerCase();
    const statusLabel = (window.I18n ? (I18n.t(statusKey) || t.status) : t.status);
    tb.insertAdjacentHTML('beforeend', `<tr><td>${t.title}</td><td>${t.assignee}</td><td>${statusLabel}</td></tr>`);
  });
}

let volunteerModalLastFocus = null;
let volunteerModalInitialized = false;

function setVolunteerFeedback(type, message){
  const feedback = $('#volunteer-feedback');
  if(!feedback) return;
  feedback.className = 'form-feedback';
  if(type) feedback.classList.add(type);
  feedback.textContent = message || '';
}

function openVolunteerModal(){
  const modal = $('#volunteer-modal');
  if(!modal) return;
  volunteerModalLastFocus = document.activeElement;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  setVolunteerFeedback(null, '');
  $('#volunteer-name')?.focus();
}

function closeVolunteerModal(){
  const modal = $('#volunteer-modal');
  if(!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  setVolunteerFeedback(null, '');
  if(volunteerModalLastFocus && typeof volunteerModalLastFocus.focus === 'function'){
    volunteerModalLastFocus.focus();
  }
}

function initVolunteerModal(){
  if(volunteerModalInitialized) return;
  const modal = $('#volunteer-modal');
  const openBtn = $('#volunteer-open');
  const form = $('#volunteer-form');
  if(!modal || !openBtn || !form) return;
  const skillsContainer = $('#volunteer-skills');
  if(skillsContainer){
    skillsContainer.innerHTML = VOLUNTEER_SKILLS.map(skill=>`
      <label><input type="checkbox" name="skills" value="${skill.label}" data-skill-id="${skill.id}"> ${skill.label}</label>
    `).join('');
  }
  openBtn.addEventListener('click', openVolunteerModal);
  modal.querySelector('[data-dismiss]')?.addEventListener('click', closeVolunteerModal);
  $('#volunteer-close')?.addEventListener('click', closeVolunteerModal);
  $('#volunteer-cancel')?.addEventListener('click', closeVolunteerModal);
  modal.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ e.preventDefault(); closeVolunteerModal(); } });
  form.addEventListener('submit', handleVolunteerSubmit);
  volunteerModalInitialized = true;
}

function normalizePhone(phone){
  return String(phone || '').replace(/[^+\d]/g, '');
}

async function handleVolunteerSubmit(event){
  event.preventDefault();
  const form = event.target;
  const fullName = form.fullName?.value?.trim() || '';
  const email = form.email?.value?.trim() || '';
  const phoneRaw = form.phone?.value?.trim() || '';
  const phone = normalizePhone(phoneRaw);
  const availability = form.availability?.value || '';
  const preferredLocation = form.preferredLocation?.value?.trim() || '';
  const motivation = form.motivation?.value?.trim() || '';
  const skills = Array.from(form.querySelectorAll('input[name="skills"]:checked')).map((n)=> n.value.trim()).filter(Boolean);

  if(fullName.length < 2){ setVolunteerFeedback('error', 'Please enter your full name.'); return; }
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ setVolunteerFeedback('error', 'Please enter a valid email.'); return; }
  if(phone.length < 6){ setVolunteerFeedback('error', 'Please enter a contact number we can reach you on.'); return; }
  if(!skills.length){ setVolunteerFeedback('error', 'Select at least one skill you can offer.'); return; }
  if(!availability){ setVolunteerFeedback('error', 'Let us know when you are available.'); return; }

  setVolunteerFeedback(null, 'Submitting your application…');

  try{
    const token = await getSupabaseToken();
    if(!token){
      throw new Error('Please sign in again before submitting your volunteer application.');
    }

    const payload = {
      fullName,
      email,
      phone,
      skills,
      availability,
      preferredLocation,
      motivation,
    };

    const response = await fetchJson('/api/volunteers/apply', {
      method: 'POST',
      body: payload,
      auth: true,
    });

    const saved = mapVolunteerRow(response?.application);

    setVolunteerFeedback('success', 'Application received! We will get back to you shortly.');
    form.reset();
    form.querySelectorAll('input[name="skills"]').forEach((el)=>{ el.checked = false; });
    window.notifications?.success('✅ Volunteer application submitted! Our team will review it shortly.');

    if(saved){
      state.volunteerApplications = [saved, ...state.volunteerApplications];
      renderVolunteerApplications();
    }

    scheduleVolunteerRefresh({ immediate: true, silent: true });
    setTimeout(closeVolunteerModal, 1200);
    return saved;
  }catch(error){
    console.error('Volunteer submit failed:', error);
    const message = supabaseErrorMessage(error, 'Unable to submit application right now.');
    setVolunteerFeedback('error', message);
    window.notifications?.error(message);
    throw error;
  }
}

function updateVolunteerApplicationsMessage(type, text, { lock = false } = {}){
  const el = $('#volunteer-applications-message');
  if(!el) return;
  if(lock){
    el.dataset.locked = '1';
  } else {
    delete el.dataset.locked;
  }
  el.textContent = text || '';
  if(type === 'error') el.classList.add('error');
  else el.classList.remove('error');
}

function renderVolunteerApplications(){
  const tbody = $('#volunteer-applications');
  if(!tbody) return;
  tbody.innerHTML = '';
  const apps = Array.isArray(state.volunteerApplications) ? state.volunteerApplications : [];
  const messageEl = $('#volunteer-applications-message');
  const messageLocked = messageEl?.dataset?.locked === '1';
  if(apps.length === 0){
    if(!messageLocked){
      updateVolunteerApplicationsMessage(null, 'No pending applications. New submissions will appear here.');
    }
    return;
  }
  if(!messageLocked){
    updateVolunteerApplicationsMessage(null, '');
  }
  apps.forEach((app)=>{
    const skills = Array.isArray(app.skills) ? app.skills.join(', ') : '—';
    const submitted = app.createdAt ? new Date(app.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const contact = app.phone || app.email || '—';
    const rawStatus = String(app.status || 'pending');
    const normalizedStatus = rawStatus.toLowerCase();
    const statusLabel = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
    const statusClass = `status-pill ${normalizedStatus}`;
    const isPending = normalizedStatus === 'pending' || normalizedStatus === 'under_review';
    const actionStatus = app.actionStatus || (isPending ? 'pending' : 'reviewed');
    const availability = app.availability || '—';
    const actionCell = isPending ? `
          <button class="btn brand" data-volunteer-action="approve" data-app-id="${app.id}">${window.I18n ? I18n.t('btn.approve') : 'Approve'}</button>
          <button class="btn danger" data-volunteer-action="reject" data-app-id="${app.id}">${window.I18n ? I18n.t('btn.reject') : 'Reject'}</button>
        ` : `<span class="muted reviewed-label">${window.I18n ? (I18n.t('status.reviewed') || 'Reviewed') : 'Reviewed'}</span>`;
    tbody.insertAdjacentHTML('beforeend', `
      <tr data-app-id="${app.id}">
        <td>${app.fullName}</td>
        <td>${skills}</td>
        <td>${availability}</td>
        <td>${contact}</td>
        <td>${submitted}</td>
        <td><span class="${statusClass}">${statusLabel}</span></td>
        <td>
          <div class="volunteer-action-buttons">
            ${actionCell}
          </div>
        </td>
      </tr>
    `);
  });
}

async function loadApprovedVolunteers({ silent = false } = {}){
  try{
  const { volunteers } = await fetchJson('/api/volunteers');
    const incoming = Array.isArray(volunteers) ? volunteers.map(mapVolunteerRow).filter(Boolean) : [];
    state.volunteers = incoming;
    renderVolunteers();
    try { localStorage.setItem('dm_volunteers_cache', JSON.stringify(state.volunteers)); } catch {}
  }catch(error){
    const message = error?.payload?.error || error.message || 'Unable to load volunteers.';
    if(!silent){
      window.notifications?.error(message);
    } else {
      console.warn('Failed to load volunteers:', message);
    }
  }
}

async function loadPendingVolunteerApplications({ silent = false } = {}){
  if(!isAdminRole()){
    state.volunteerApplications = [];
    renderVolunteerApplications();
    updateVolunteerApplicationsMessage(null, 'Volunteer applications are visible to authorized coordinators only.', { lock: true });
    return;
  }

  try{
    const token = await getSupabaseToken();
    if(!token){
      state.volunteerApplications = [];
      renderVolunteerApplications();
      updateVolunteerApplicationsMessage('error', 'Your session has expired. Please sign in again to review applications.', { lock: true });
      return;
    }

    const { applications } = await fetchJson('/api/volunteers/applications', {
      auth: true,
    });

    const allApps = Array.isArray(applications) ? applications.map(mapVolunteerRow).filter(Boolean) : [];
    
    // For the applications awaiting review table, show recent applications
    // Include approved/rejected for a brief period so status changes are visible
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    state.volunteerApplications = allApps.filter(app => {
      const isPending = !app.status || app.status.toLowerCase() === 'pending' || app.status.toLowerCase() === 'under_review';
      const isRecentlyReviewed = app.reviewedAt && new Date(app.reviewedAt) > cutoffTime;
      return isPending || isRecentlyReviewed;
    });
    
    updateVolunteerApplicationsMessage(null, '', { lock: false });
    renderVolunteerApplications();
  }catch(error){
    state.volunteerApplications = [];
    renderVolunteerApplications();
    let message = error?.payload?.error || error.message || 'Unable to load volunteer applications.';
    if(error?.status === 401 || error?.status === 403){
      message = 'You need an active authority or NDRF session to review applications.';
    }
    updateVolunteerApplicationsMessage('error', message, { lock: true });
    if(!silent) window.notifications?.warning(message);
  }
}

async function updateVolunteerApplicationStatus(id, status, notes = ''){
  try{
    updateVolunteerApplicationsMessage(null, status === 'approved' ? 'Approving volunteer…' : 'Updating application…', { lock: true });

    const token = await getSupabaseToken();
    if(!token){
      throw new Error('Please sign in again to update applications.');
    }

    const body = {
      status,
      notes: notes ? notes : undefined,
    };

    const response = await fetchJson(`/api/volunteers/${id}/status`, {
      method: 'PATCH',
      auth: true,
      body,
    });

    const updated = mapVolunteerRow(response?.application);
    if(updated){
      const normalizedStatus = String(updated.status || status).toLowerCase();
      const actionStatus = ['pending', 'under_review'].includes(normalizedStatus) ? 'pending' : 'reviewed';

      state.volunteerApplications = state.volunteerApplications.map((app)=>{
        if(String(app.id) === String(id)){
          return { ...app, ...updated, actionStatus };
        }
        return app;
      });

      if(!state.volunteerApplications.some((app)=> String(app.id) === String(id))){
        state.volunteerApplications = [{ ...updated, actionStatus }, ...state.volunteerApplications];
      }

      renderVolunteerApplications();

      if(['approved', 'processed', 'active'].includes(normalizedStatus)){
        window.notifications?.success('Volunteer approved and notified.');
      } else if(normalizedStatus === 'rejected'){
        window.notifications?.info('Application rejected and applicant notified.');
      }
    }

    updateVolunteerApplicationsMessage(null, 'Status updated.', { lock: false });
    setTimeout(()=> updateVolunteerApplicationsMessage(null, '', { lock: false }), 2500);
    scheduleVolunteerRefresh({ immediate: true, silent: true });
  }catch(error){
    console.error('Failed to update volunteer status:', error);
    let message = error?.payload?.error || error.message || 'Unable to update status.';
    updateVolunteerApplicationsMessage('error', message, { lock: true });
    window.notifications?.error(message);
  }
}

async function refreshVolunteerData({ silent = false } = {}){
  try {
    await Promise.all([
      loadApprovedVolunteers({ silent }),
      loadPendingVolunteerApplications({ silent })
    ]);
  } catch (error) {
    if(!silent){
      const message = supabaseErrorMessage(error, 'Unable to refresh volunteer data.');
      window.notifications?.warning(message);
    }
  }
}

function scheduleVolunteerRefresh({ immediate = false, silent = true } = {}){
  if(volunteerRefreshTimeoutId){
    clearTimeout(volunteerRefreshTimeoutId);
    volunteerRefreshTimeoutId = null;
  }

  const run = async () => {
    try {
      await refreshVolunteerData({ silent });
    } catch (error) {
      if(!silent){
        const message = supabaseErrorMessage(error, 'Unable to refresh volunteer data.');
        window.notifications?.warning(message);
      }
    }
  };

  if(immediate){
    run();
  } else {
    volunteerRefreshTimeoutId = setTimeout(run, 250);
  }
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
  async function handleSend(){
    const val = input?.value.trim();
    if(!val) return;
    try {
      const mod = await import('./supabase.js');
      const me = (()=>{ try{ const u=JSON.parse(localStorage.getItem('dm_user')||'{}'); return u; }catch{return{}} })();
      await mod.addDoc(mod.collection(mod.db, 'chat'), {
        text: val,
        user: me.displayName || me.email || 'Me',
        role: state.role,
      });
    } catch {
      pushChatMessage(val, { fromMe: true });
    }
    input.value = '';
  }
  sendBtn?.addEventListener('click', handleSend);
  input?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); handleSend(); } });

  // Clear (only for authority/ndrf roles), UI gated via .role-only classes, but double gate in JS
  clearBtn?.addEventListener('click', async ()=>{
    if(state.role === 'authority' || state.role === 'ndrf'){
      if(confirm(window.I18n ? I18n.t('chat.clearConfirm') : 'Clear chat for everyone? This removes all messages.')){
        try {
          const mod = await import('./supabase.js');
          await mod.addDoc(mod.collection(mod.db, 'chat'), { text: '[Chat cleared by officials]', role: 'authority', user: 'System' });
        } catch {}
        clearChatAll();
      }
    }
  });

  // Demo: if empty, seed a welcome message
  if(state.chat.messages.length === 0){
  state.chat.messages.push({ id:'seed1', user:'System', role:'authority', text:(window.I18n ? I18n.t('chat.seedMessage') : 'Welcome to the community chat. Coordinate respectfully. Officials may moderate.'), ts: Date.now() });
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
  // Prevent switching if role is locked
  const lockedRole = getLockedRole();
  if(lockedRole){
    // Revert UI to locked role
    e.target.value = lockedRole;
    state.role = lockedRole;
  } else {
    state.role = e.target.value; 
    // Persist preference only when not locked
    savePrefs();
  }
  renderRoleBadge();
  // Re-render components that depend on role
  renderSupplies();
  renderVerify();
});

$('#lang-select').addEventListener('change', (e)=>{ 
  state.lang = e.target.value; 
  try { if(window.I18n){ I18n.apply(state.lang); } } catch {}
  // re-render anything built from JS literals
  renderRoleBadge();
  renderStats();
  renderAlertFeed();
  // Re-init filters/selects built from literals so placeholders/options translate
  initHazardFilters();
  initRegionFilters();
  initReportTypeOptions();
  savePrefs();
});

// Actions: forms + buttons
$('#submit-report').addEventListener('click', async ()=>{
  const type=$('#report-type').value;
  const desc=$('#report-description').value.trim();
  const loc=$('#report-location').value.trim();
  const contact=$('#report-contact').value.trim();

  if(!desc || !loc){ 
    $('#report-message').textContent = (window.I18n ? I18n.t('report.validation.missing') : 'Please add description and location.'); 
    $('#report-message').style.color = '#e11d48';
    return; 
  }

  // Show loading state
  $('#submit-report').disabled = true;
  $('#submit-report').textContent = 'Submitting...';
  $('#report-message').textContent = 'Submitting report...';
  $('#report-message').style.color = '#3b82f6';

  // Try to persist to Supabase; fallback to local state
  try {
    const mod = await import('./supabase.js');
    await mod.insertReport({
      type,
      desc,
      loc,
      contact: contact || '',
      status: 'Pending',
    });
    
    // Show success message
    $('#report-message').textContent = (window.I18n ? I18n.t('report.submitted') : 'Report submitted successfully! It will be reviewed by authorities.');
    $('#report-message').style.color = '#10b981';
    
    // Show success notification
    window.notifications?.success('✅ Report Submitted Successfully!\n\nYour report has been sent to authorities for verification. You will be notified once it\'s reviewed.');
    
  } catch (error) {
    console.error('Report submission error:', error);
    
    // Fallback to local state
    state.verifyQueue.unshift({
      time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), 
      type, 
      loc,
      desc,
      contact: contact || '',
      status:'Pending'
    });
    renderStats(); 
    renderVerify();
    renderReportMarkers();
    
    // Show warning message
    $('#report-message').textContent = 'Report saved locally. Please check your internet connection for real-time updates.';
    $('#report-message').style.color = '#eab308';
    
    // Show warning notification
    window.notifications?.warning('⚠️ Report Saved Locally\n\nYour report has been saved but may not be visible to authorities until you have internet connection.');
  }

  // Clear form
  $('#report-description').value=''; 
  $('#report-location').value=''; 
  $('#report-contact').value=''; 
  
  // Reset button
  $('#submit-report').disabled = false;
  $('#submit-report').textContent = (window.I18n ? I18n.t('btn.submit') : 'Submit Report');
  
  // Clear message after 5 seconds
  setTimeout(() => {
    $('#report-message').textContent = '';
  }, 5000);
});

// Broadcast alert (authority/NDRF)
$('#send-alert').addEventListener('click', async ()=>{
  const msg=$('#alert-message').value.trim(); 
  if(!msg) {
    window.notifications?.error('Please enter an alert message.');
    return;
  }

  // Read structured fields from the broadcast form
  const sev=$('#alert-severity').value;
  const hazard = $('#alert-hazard')?.value || 'Flood';
  const stateName = $('#alert-state')?.value || '';
  const districtName = $('#alert-district')?.value || '';
  const area = districtName ? `${districtName}, ${stateName||''}`.trim() : (stateName || '—');

  // Try Supabase write; fallback to local state
  try {
    const mod = await import('./supabase.js');
    if (typeof mod.insertAlert === 'function') {
      await mod.insertAlert({ hazard, sev, msg, state: stateName || '', district: districtName || '', area });
    } else {
      await mod.addDoc(mod.collection(mod.db, 'alerts'), { hazard, sev, msg, state: stateName || '', district: districtName || '', area });
    }
  } catch (err) {
    // Warn: this will not persist for others unless DB insert succeeds
    try {
      const message = (err && err.message) ? String(err.message) : 'Unable to write to database. The alert may not persist across refresh.';
      alert(`${message}\nA local-only fallback will be shown, but others won’t see it until you sign in.`);
    } catch {}
    state.alerts.unshift({
      time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), 
      hazard,
      sev, 
      msg, 
      state: stateName || '',
      district: districtName || '',
      area
    });
    renderStats();
    renderAlertFeed();
  }

  // Clear inputs and reset button
  $('#alert-message').value=''; 
  $('#send-alert').disabled = false;
  $('#send-alert').textContent = (window.I18n ? I18n.t('btn.broadcast') : 'Broadcast Alert');
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

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-volunteer-action]');
  if(!btn) return;
  const appIdRaw = btn.dataset.appId;
  if(!appIdRaw) return;
  const action = btn.dataset.volunteerAction;
  const trimmed = appIdRaw.trim();
  const asNumber = trimmed && !Number.isNaN(Number(trimmed)) ? Number(trimmed) : null;
  const appId = asNumber !== null ? asNumber : trimmed;
  if(action === 'approve'){
    updateVolunteerApplicationStatus(appId, 'approved');
  } else if(action === 'reject'){
    if(confirm('Reject this application? The applicant will be notified automatically.')){
      const note = prompt('Optional note for the applicant (leave blank to skip):') || '';
      updateVolunteerApplicationStatus(appId, 'rejected', note.trim());
    }
  }
});

// Verify approve/reject (delegated)
document.addEventListener('click', async (e)=>{
  const btn=e.target.closest('button[data-act]'); 
  if(!btn) return;

  const i=+btn.dataset.idx;
  const act=btn.dataset.act;

  try {
    const item = state.verifyQueue[i];
    const mod = await import('./supabase.js');
    if(item && item.id){
      const ref = mod.doc(mod.db, 'reports', item.id);
      if(act==='approve') {
        // Mark report as verified
        await mod.updateDoc(ref, { status: 'Verified', updatedAt: mod.serverTimestamp() });
        // Also create a public alert for citizens
        try {
          const msg = (item.desc && item.desc.trim()) ? item.desc.trim() : `Verified ${item.type} reported at ${item.loc}`;
          if (typeof mod.insertAlert === 'function') {
            await mod.insertAlert({ hazard: item.type || 'Alert', sev: 'Medium', msg, state: '', district: '', area: item.loc || '' });
          } else {
            await mod.addDoc(mod.collection(mod.db, 'alerts'), { hazard: item.type || 'Alert', sev: 'Medium', msg, state: '', district: '', area: item.loc || '' });
          }
        } catch {
          // Local-only fallback so officials see it instantly if DB insert fails
          state.alerts.unshift({
            time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), 
            hazard: item.type || 'Alert',
            sev: 'Medium',
            msg: item.desc || `Verified ${item.type} at ${item.loc}`,
            state: '',
            district: '',
            area: item.loc || ''
          });
          renderStats();
          renderAlertFeed();
        }
        window.notifications?.success('Report verified and responders notified.');
      }
      if(act==='reject') {
        await mod.updateDoc(ref, { status: 'Rejected', updatedAt: mod.serverTimestamp() });
        window.notifications?.info('Report marked as rejected. Community will see the update.');
      }
      if(state.verifyQueue[i]){
        state.verifyQueue[i] = {
          ...state.verifyQueue[i],
          status: act==='approve' ? 'Verified' : 'Rejected'
        };
      }
      renderStats();
      renderVerify();
      renderReportMarkers();
      return; // UI will refresh from snapshot
    }
  } catch {}

  // Fallback to local state if Firestore not available or item lacks id
  if(act==='approve'){ state.verifyQueue[i].status='Verified'; }
  if(act==='reject'){ state.verifyQueue[i].status='Rejected'; }
  renderStats(); renderVerify(); renderReportMarkers();
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

// Load cached data from localStorage for offline resilience
function loadCachedData() {
  try {
    const cachedAlerts = localStorage.getItem('dm_alerts_cache');
    if (cachedAlerts) {
      const parsed = JSON.parse(cachedAlerts);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.alerts = parsed;
      }
    }
    
    const cachedReports = localStorage.getItem('dm_reports_cache');
    if (cachedReports) {
      const parsed = JSON.parse(cachedReports);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.verifyQueue = parsed;
      }
    }

    const cachedVols = localStorage.getItem('dm_volunteers_cache');
    if (cachedVols) {
      const parsed = JSON.parse(cachedVols);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.volunteers = parsed;
      }
    }
  } catch {
    // Ignore corrupted cache entries
  }
}

// Connection status management
function updateConnectionStatus(status, text = '') {
  const indicator = document.getElementById('connection-indicator');
  const textEl = document.getElementById('connection-text');
  
  if (indicator && textEl) {
    indicator.className = `connection-indicator ${status}`;
    textEl.textContent = text || status;
  }
}

let lastRealtimeWarningTs = 0;
function notifyRealtimeIssue(message) {
  const now = Date.now();
  if (now - lastRealtimeWarningTs < 60000) {
    return;
  }
  lastRealtimeWarningTs = now;
  window.notifications?.warning(message);
}

// Bootstrap: on DOM ready
document.addEventListener('DOMContentLoaded', function() {
  // Hard guard: if somehow opened without auth flag, bounce to login
  try { if(localStorage.getItem('dm_logged_in') !== '1'){ window.location.replace('auth.html?mode=login'); return; } } catch {}
  
  // Initialize notification system
  window.notifications = new NotificationManager();
  
  // Initialize connection status
  updateConnectionStatus('connecting', 'Connecting...');
  
  // Load cached data first for immediate display
  loadCachedData();
  
  // Load and apply saved preferences (role, lang, contrast)
  const prefs = loadPrefs();
  const lockedRole = getLockedRole();
  if(lockedRole){
    state.role = lockedRole;
    const rs=$('#role-select'); if(rs){ rs.value = lockedRole; rs.disabled = true; rs.title = 'Role is assigned based on your account'; rs.classList.add('role-hidden'); }
    // Ensure any listeners dependent on role apply immediately
    try { window.dispatchEvent(new CustomEvent('dm:role-updated')); } catch {}
  } else if(prefs.role){
    state.role = prefs.role; const rs=$('#role-select'); if(rs){ rs.value = prefs.role; rs.disabled = false; rs.classList.remove('role-hidden'); }
  }
  if(prefs.lang){ state.lang = prefs.lang; } else { try { if(window.I18n){ state.lang = I18n.lang; } } catch {}
  }
  const ls=$('#lang-select'); if(ls) ls.value = state.lang;
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
  renderVolunteerApplications();

  // Initialize new functionality
  initProfileDropdown();
  initEducationTabs();
  initVideoInteractions();
  initTabs(); // Keyboard-friendly tabs
  initChat(); // Community chat
  initVolunteerModal();
  initLayerToggles();

  // Apply icons directly from assets/icons
  applyIcons(document);

  // (lightbox removed in simplified setup)

  // Initialize hazard and region filters/selects
  initHazardFilters();
  initRegionFilters();
  initReportTypeOptions();

  // Initialize maps and render initial markers
  initMaps();
  renderAlertMarkers();
  renderReportMarkers();
  renderShelterMarkers();
  renderResourceCenters();
  renderRiskMarkers();
  renderRiskMarkers();
  // Optional: center one map to user location for demo
  geolocateAndCenter(maps.alerts || maps.resources || maps.reports, { silent: true });

  // Load volunteer data from Supabase (approved + pending)
  scheduleVolunteerRefresh({ immediate: true, silent: true });

  // Locate me buttons
  document.getElementById('locate-alerts')?.addEventListener('click', ()=> geolocateAndCenter(maps.alerts));
  document.getElementById('locate-reports')?.addEventListener('click', ()=> geolocateAndCenter(maps.reports));
  document.getElementById('locate-risk')?.addEventListener('click', ()=> geolocateAndCenter(maps.risk));
  document.getElementById('locate-resources')?.addEventListener('click', ()=> geolocateAndCenter(maps.resources));

  // Supabase real-time listeners with improved error handling
  (async ()=>{
    try {
  const mod = await import('./supabase.js');

      // Check authentication first
      const { data: session, error: sessionError } = await mod.supabase.auth.getSession();
      if (sessionError) {
        console.error('Session error:', sessionError);
        updateConnectionStatus('offline', 'Auth Error');
        window.notifications?.error('Authentication error. Please sign in again.');
        return;
      }

      if (!session?.session) {
        updateConnectionStatus('offline', 'Not Signed In');
        window.notifications?.warning('Please sign in to access real-time features.');
        return;
      }

      // Initial fetch with timeout
      const fetchWithTimeout = (promise, timeout = 10000) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeout))
        ]);
      };

      const [alerts0, reports0, chat0] = await Promise.all([
        fetchWithTimeout(mod.fetchLatest('alerts', { limit: 100, order: 'ts', ascending: false })),
        fetchWithTimeout(mod.fetchLatest('reports', { limit: 200, order: 'ts', ascending: false })),
        fetchWithTimeout(mod.fetchLatest('chat', { limit: 200, order: 'ts', ascending: true })),
      ]);

      // Update state with fresh data
      const freshAlerts = (alerts0 || []).map((d)=>({
        id: d.id,
        time: d.ts ? new Date(d.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '',
        hazard: d.hazard || 'Alert',
        sev: (d.sev ?? d.severity ?? 'Low'),
        msg: (d.msg ?? d.message ?? ''),
        state: d.state || '', district: d.district || '', area: d.area || '', lat: d.lat, lng: d.lng
      }));
      
      const freshReports = (reports0 || []).map((d)=>({ 
        id: d.id, 
        time: d.ts ? new Date(d.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '', 
        type: d.type || '', 
        loc: d.loc || '', 
        status: d.status || 'Pending', 
        desc: d.desc || '',
        contact: d.contact || ''
      }));
      
      // Only update if we got fresh data
      if (freshAlerts.length > 0) {
        state.alerts = freshAlerts;
        localStorage.setItem('dm_alerts_cache', JSON.stringify(state.alerts));
      }
      
      if (freshReports.length > 0) {
        state.verifyQueue = freshReports;
        localStorage.setItem('dm_reports_cache', JSON.stringify(state.verifyQueue));
      }
      
      state.chat.messages = (chat0 || []).map((d)=>({ 
        id: d.id, 
        user: d.user || 'Anon', 
        role: d.role || '', 
        text: d.text || '', 
        ts: d.ts ? new Date(d.ts).getTime() : Date.now() 
      }));
      
      persistChat();
      renderStats();
      renderAlertFeed();
      renderVerify();
      renderReportMarkers();
      renderChat();

  await refreshVolunteerData({ silent: true });
      
      updateConnectionStatus('online', 'Online');

      // Realtime subscriptions with improved error handling and persistence
      const unsubAlerts = mod.subscribeTable('alerts', async () => {
        try {
          const latest = await mod.fetchLatest('alerts', { limit: 100, order: 'ts', ascending: false });
          const newAlerts = (latest || []).map((d)=>({
            id: d.id,
            time: d.ts ? new Date(d.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '',
            hazard: d.hazard || 'Alert',
            sev: (d.sev ?? d.severity ?? 'Low'),
            msg: (d.msg ?? d.message ?? ''),
            state: d.state || '', district: d.district || '', area: d.area || '', lat: d.lat, lng: d.lng
          }));
          
          // Only update if data actually changed
          if (JSON.stringify(newAlerts) !== JSON.stringify(state.alerts)) {
            state.alerts = newAlerts;
            // Persist to localStorage for offline resilience
            try {
              localStorage.setItem('dm_alerts_cache', JSON.stringify(state.alerts));
            } catch {}
            renderStats();
            renderAlertFeed();
            renderAlertMarkers();
          }
        } catch {
          updateConnectionStatus('connecting', 'Reconnecting...');
          notifyRealtimeIssue('Live alerts may be out of date. Retrying connection...');
        }
      });

      const unsubReports = mod.subscribeTable('reports', async () => {
        try {
          const latest = await mod.fetchLatest('reports', { limit: 200, order: 'ts', ascending: false });
          const newReports = (latest || []).map((d)=>({ 
            id: d.id, 
            time: d.ts ? new Date(d.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '', 
            type: d.type || '', 
            loc: d.loc || '', 
            status: d.status || 'Pending', 
            desc: d.desc || '',
            contact: d.contact || ''
          }));
          
          // Only update if data actually changed
          if (JSON.stringify(newReports) !== JSON.stringify(state.verifyQueue)) {
            state.verifyQueue = newReports;
            // Persist to localStorage for offline resilience
            try {
              localStorage.setItem('dm_reports_cache', JSON.stringify(state.verifyQueue));
            } catch {}
            renderStats();
            renderVerify();
            renderReportMarkers();
          }
        } catch {
          updateConnectionStatus('connecting', 'Reconnecting...');
          notifyRealtimeIssue('Latest reports may be out of date. Retrying connection...');
        }
      });

      const unsubChat = mod.subscribeTable('chat', async () => {
        try {
          const latest = await mod.fetchLatest('chat', { limit: 200, order: 'ts', ascending: true });
          const newMessages = (latest || []).map((d)=>({ 
            id: d.id, 
            user: d.user || 'Anon', 
            role: d.role || '', 
            text: d.text || '', 
            ts: d.ts ? new Date(d.ts).getTime() : Date.now() 
          }));
          
          // Only update if data actually changed
          if (JSON.stringify(newMessages) !== JSON.stringify(state.chat.messages)) {
            state.chat.messages = newMessages;
            persistChat();
            renderChat();
          }
        } catch {
          updateConnectionStatus('connecting', 'Reconnecting...');
          notifyRealtimeIssue('Community chat may be delayed. Retrying connection...');
        }
      });

      const unsubVolunteers = mod.subscribeTable(VOLUNTEER_TABLE, (payload) => {
        try {
          const eventType = payload?.eventType;
          const newData = payload?.new;
          const oldData = payload?.old;
          
          if(eventType === 'INSERT' || eventType === 'UPDATE' || eventType === 'DELETE'){
            // Immediate refresh for all components
            scheduleVolunteerRefresh({ immediate: true, silent: true });
            
            // Also trigger immediate UI updates for status changes
            if(eventType === 'UPDATE' && newData && oldData && newData.status !== oldData.status) {
              // Force immediate re-render of both applications and volunteers
              setTimeout(() => {
                renderVolunteerApplications();
                renderVolunteers();
              }, 100);
            }
          }
        } catch {
          scheduleVolunteerRefresh({ immediate: true, silent: true });
        }
      });
      volunteerRealtimeUnsub = () => { try { unsubVolunteers(); } catch {} };

      // Clean up on unload
      window.addEventListener('beforeunload', () => {
        try{unsubAlerts();unsubReports();unsubChat();volunteerRealtimeUnsub?.();}catch{}
        if(volunteerRefreshTimeoutId){
          clearTimeout(volunteerRefreshTimeoutId);
          volunteerRefreshTimeoutId = null;
        }
      });
    } catch (err) {
      console.error('Supabase connection failed:', err);
      updateConnectionStatus('offline', 'Connection Failed');
      
      // Show detailed error to user
      let errorMessage = 'Connection to database failed. ';
      if (err.message.includes('timeout')) {
        errorMessage += 'The server is not responding. Please check your internet connection.';
      } else if (err.message.includes('auth')) {
        errorMessage += 'Authentication failed. Please sign in again.';
      } else if (err.message.includes('CORS')) {
        errorMessage += 'Cross-origin request blocked. Please use HTTPS or check server configuration.';
      } else {
        errorMessage += `Error: ${err.message}`;
      }
      errorMessage += ' Cached data will be shown until the connection is restored.';
      
      window.notifications?.error(errorMessage);
    }
  })();
});

// React to role changes set by auth script (lock enforced)
window.addEventListener('dm:role-updated', ()=>{
  try{
    const lr = getLockedRole();
    if(lr){
      state.role = lr;
      const rs = document.getElementById('role-select');
      if(rs){ rs.value = lr; rs.disabled = true; rs.title = 'Role is assigned based on your account'; rs.classList.add('role-hidden'); }
      renderRoleBadge();
      // Re-render components depending on role
      renderSupplies();
      renderVerify();
    }
  }catch{}
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
      const hz = (window.I18n ? I18n.t('hazards.'+h) : h);
      label.innerHTML = `<input type="checkbox" id="${id}" value="${h}"> ${hz}`;
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
    selBroadcast.innerHTML = HAZARDS.map(h=>{
      const hz = (window.I18n ? I18n.t('hazards.'+h) : h);
      return `<option value="${h}">${hz}</option>`;
    }).join('');
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
      const fd = document.getElementById('filter-district'); if(fd) fd.innerHTML = `<option value="">${window.I18n ? I18n.t('filters.allDistricts') : 'All districts'}</option>`;
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
  fillSelect(fs, (window.I18n ? I18n.t('filters.allStates') : 'All states/UT'), STATES);
  fillSelect(as, (window.I18n ? I18n.t('filters.selectState') : 'Select state/UT'), STATES);
  // Initialize districts
  fillSelect(fd, (window.I18n ? I18n.t('filters.allDistricts') : 'All districts'));
  fillSelect(ad, (window.I18n ? I18n.t('filters.selectDistrict') : 'Select district'));

  // When a state is chosen in filters, update districts and filter state
  fs?.addEventListener('change', (e)=>{
    filters.state = e.target.value || '';
    const districts = DISTRICTS_BY_STATE[filters.state] || [];
    fillSelect(fd, (window.I18n ? I18n.t('filters.allDistricts') : 'All districts'), districts);
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
    fillSelect(ad, (window.I18n ? I18n.t('filters.selectDistrict') : 'Select district'), districts);
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
    const occupancy = Math.round(ratio * 100);
    const icon = getMapIcon('shelter');
    const popupContent = `<strong>${s.name}</strong><br>${window.I18n ? I18n.t('table.capacity') : 'Capacity'}: ${s.cap}<br>${window.I18n ? I18n.t('table.available') : 'Available'}: ${s.avail} (${occupancy}% open)<br>${window.I18n ? I18n.t('table.contact') : 'Contact'}: ${s.contact}<br><button class="btn btn-small" onclick="getRouteToShelter(${lat}, ${lng})">Navigate</button>`;
    const m = L.marker([lat,lng], { icon: icon || undefined, title: s.name })
      .bindPopup(popupContent);
    layers.shelters.addLayer(m);
    points.push([lat,lng]);
  });
  if(points.length >= 2) maps.resources.fitBounds(points, { padding: [20,20] });
  else if(points.length === 1) maps.resources.setView(points[0], 12);
}

function getRouteToShelter(lat, lng) {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser');
    return;
  }

  navigator.geolocation.getCurrentPosition(position => {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;
    const url = `https://router.project-osrm.org/route/v1/driving/${userLng},${userLat};${lng},${lat}?overview=full&geometries=geojson`;

    fetch(url)
      .then(response => response.json())
      .then(data => {
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0].geometry.coordinates;
          const latlngs = route.map(coord => [coord[1], coord[0]]);
          L.polyline(latlngs, { color: 'blue' }).addTo(maps.resources);
          maps.resources.fitBounds(L.polyline(latlngs).getBounds());
        } else {
          alert('Could not find a route to the shelter.');
        }
      })
      .catch(error => {
        console.error('Error fetching route:', error);
        alert('Could not fetch the route. Please try again later.');
      });
  }, () => {
    alert('Unable to retrieve your location.');
  });
}

function renderHeatmap() {
  if (!maps.risk || typeof L.heatLayer === 'undefined') return;
  if (layers.heatmap) {
    layers.heatmap.clearLayers();
  } else {
    layers.heatmap = L.layerGroup().addTo(maps.risk);
  }

  const heatData = state.alerts.map(alert => [alert.lat, alert.lng, 0.5]);
  L.heatLayer(heatData, { radius: 25 }).addTo(layers.heatmap);
}

function initDrawing() {
  if (!maps.risk || typeof L.Control.Draw === 'undefined') return;

  const drawnItems = new L.FeatureGroup();
  maps.risk.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    edit: {
      featureGroup: drawnItems
    },
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true
      },
      rectangle: {
        showArea: true
      },
      circle: false,
      marker: false,
      polyline: false
    }
  });

  maps.risk.addControl(drawControl);

  maps.risk.on(L.Draw.Event.CREATED, function (event) {
    const layer = event.layer;
    drawnItems.addLayer(layer);
  });
}

function renderResourceCenters(){
  if(!maps.resources) return;
  if(!layers.resourceCenters) layers.resourceCenters = L.layerGroup().addTo(maps.resources);
  layers.resourceCenters.clearLayers();
  state.resourceCenters.forEach((center)=>{
    if(typeof center.lat !== 'number' || typeof center.lng !== 'number') return;
    const icon = getMapIcon(center.type) || getMapIcon('location');
    const popup = [`<strong>${center.name}</strong>`];
    if(center.details) popup.push(`<div>${center.details}</div>`);
    if(center.contact) popup.push(`<div>${window.I18n ? I18n.t('table.contact') : 'Contact'}: ${center.contact}</div>`);
    const marker = L.marker([center.lat, center.lng], { icon: icon || undefined, title: center.name })
      .bindPopup(popup.join(''));
    layers.resourceCenters.addLayer(marker);
  });
}

function renderRiskMarkers(){
  if(!maps.risk) return;
  renderDroughtZones();
  renderEarthquakeZones();
  renderFloodZones();
  renderShelterMarkersRisk();
  renderHospitalMarkersRisk();
  renderFoodMarkersRisk();
}

function renderDroughtZones() {
  if (!maps.risk || !layers.drought) return;
  layers.drought.clearLayers();
  state.hazardHotspots.forEach(spot => {
    if (spot.type === 'drought') {
      const marker = L.marker([spot.lat, spot.lng], { icon: getMapIcon('drought') })
        .bindPopup(`<strong>${spot.name}</strong><br>${spot.details}<br><small>${spot.advisory}</small>`);
      layers.drought.addLayer(marker);
    }
  });
}

function renderEarthquakeZones() {
  if (!maps.risk || !layers.earthquake) return;
  layers.earthquake.clearLayers();
  state.hazardHotspots.forEach(spot => {
    if (spot.type === 'earthquake') {
      const marker = L.marker([spot.lat, spot.lng], { icon: getMapIcon('earthquake') })
        .bindPopup(`<strong>${spot.name}</strong><br>${spot.details}<br><small>${spot.advisory}</small>`);
      layers.earthquake.addLayer(marker);
    }
  });
}

function renderFloodZones() {
  if (!maps.risk || !layers.flood) return;
  layers.flood.clearLayers();
  state.alerts.forEach(alert => {
    if (alert.hazard === 'Flood' || alert.hazard === 'Heavy Rain') {
      const marker = L.marker([alert.lat, alert.lng], { icon: getMapIcon('flood') })
        .bindPopup(`<strong>${alert.hazard}</strong><br>${alert.msg}<br><small>${alert.area}</small>`);
      layers.flood.addLayer(marker);
    }
  });
}

function renderShelterMarkersRisk() {
  if (!maps.risk || !layers.shelter) return;
  layers.shelter.clearLayers();
  state.shelters.forEach(shelter => {
    // Mock location for shelters
    const lat = 20.5937 + (Math.random() - 0.5) * 10;
    const lng = 78.9629 + (Math.random() - 0.5) * 10;
    const marker = L.marker([lat, lng], { icon: getMapIcon('shelter') })
      .bindPopup(`<strong>${shelter.name}</strong><br>Capacity: ${shelter.cap}<br>Available: ${shelter.avail}<br>Contact: ${shelter.contact}`);
    layers.shelter.addLayer(marker);
  });
}

function renderHospitalMarkersRisk() {
  if (!maps.risk || !layers.hospital) return;
  layers.hospital.clearLayers();
  state.hospitals.forEach(hospital => {
    const marker = L.marker([hospital.lat, hospital.lng], { icon: getMapIcon('hospital') })
      .bindPopup(`<strong>${hospital.name}</strong><br>${hospital.details}<br>Contact: ${hospital.contact}`);
    layers.hospital.addLayer(marker);
  });
}

function renderFoodMarkersRisk() {
  if (!maps.risk || !layers.food) return;
  layers.food.clearLayers();
  state.food_resources.forEach(foodResource => {
    const marker = L.marker([foodResource.lat, foodResource.lng], { icon: getMapIcon('food') })
      .bindPopup(`<strong>${foodResource.name}</strong><br>${foodResource.details}<br>Contact: ${foodResource.contact}`);
    layers.food.addLayer(marker);
  });
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
    const icon = getMapIcon('location');
    myLocationMarkers[key] = L.marker(latlng, { icon: icon || undefined, title: window.I18n ? I18n.t('geo.youAreHere') : 'You are here' })
      .bindPopup(window.I18n ? I18n.t('geo.youAreHere') : 'You are here').addTo(map);
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
    const code = err && err.code;
    if(code === 1){ // PERMISSION_DENIED
  setMapHelp(map, window.I18n ? I18n.t('geo.permissionDenied') : 'Location permission denied. Click the lock icon in the address bar, allow Location, and try again.');
    } else if(code === 2){
  setMapHelp(map, window.I18n ? I18n.t('geo.unavailable') : 'Location unavailable. Ensure GPS/location services are enabled and try again.');
    } else if(code === 3){
  setMapHelp(map, window.I18n ? I18n.t('geo.timeout') : 'Location request timed out. Try again.');
    } else {
  setMapHelp(map, window.I18n ? I18n.t('geo.unable') : 'Unable to access your location.');
    }
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  myLocationWatchIds[key] = id;
}

// Geolocation helper to center a map and trigger browser permission prompt on click
function geolocateAndCenter(map, { silent = false } = {}){
  if(!map){ if(!silent) setMapHelp(map, window.I18n ? I18n.t('geo.mapNotReady') : 'Map is not ready yet.'); return; }
  if(!('geolocation' in navigator)){ if(!silent) setMapHelp(map, window.I18n ? I18n.t('geo.notSupported') : 'Geolocation is not supported by your browser.'); return; }

  // Check secure context (required by browsers)
  const isLocalhost = ['localhost','127.0.0.1','::1'].includes(location.hostname);
  const isSecure = (window.isSecureContext === true) || location.protocol === 'https:' || isLocalhost;
  if(!isSecure){ setMapHelp(map, window.I18n ? I18n.t('geo.blockedInsecure') : 'Location is blocked on insecure pages. Serve over HTTPS or http://localhost and try again.'); return; }

  const triggerPromptViaGetCurrentPosition = ()=>{
  setMapHelp(map, window.I18n ? I18n.t('geo.requesting') : 'Requesting location…');
    navigator.geolocation.getCurrentPosition((pos)=>{
      // Center once and start live updates
      updateMyLocationMarker(map, pos.coords);
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      startLocationWatch(map);
  setMapHelp(map, window.I18n ? I18n.t('geo.liveEnabled') : 'Live location enabled.');
    }, (err)=>{
      if(silent){ return; }
      const code = err && err.code;
      if(code === 1){
  setMapHelp(map, window.I18n ? I18n.t('geo.permissionDenied') : 'Location permission denied. Use site settings to allow Location and click "Locate me" again.');
      } else if(code === 2){
  setMapHelp(map, window.I18n ? I18n.t('geo.unavailable') : 'Location unavailable. Ensure GPS/location services are enabled.');
      } else if(code === 3){
  setMapHelp(map, window.I18n ? I18n.t('geo.timeout') : 'Location request timed out. Try again.');
      } else {
  setMapHelp(map, window.I18n ? I18n.t('geo.unable') : 'Unable to access your location.');
      }
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  };

  // Use Permissions API when available to decide the best flow
  if(navigator.permissions && navigator.permissions.query){
    try{
      navigator.permissions.query({ name: 'geolocation' }).then((status)=>{
        if(status.state === 'granted'){
          startLocationWatch(map);
          setMapHelp(map, window.I18n ? I18n.t('geo.liveEnabled') : 'Live location enabled.');
        } else if(status.state === 'prompt'){
          // Only show the browser permission prompt when not in silent mode
          if(silent){
            setMapHelp(map, window.I18n ? I18n.t('geo.clickLocate') : 'Click "Locate me" to enable live location.');
            return;
          }
          triggerPromptViaGetCurrentPosition();
        } else { // denied
          if(!silent) setMapHelp(map, window.I18n ? I18n.t('geo.permissionDenied') : 'Location permission is blocked. Click the lock icon → Site settings → Allow Location, then try again.');
        }
      }).catch(()=> triggerPromptViaGetCurrentPosition());
    }catch{ triggerPromptViaGetCurrentPosition(); }
  } else {
    // Fallback: only attempt prompt when not silent
    if(!silent) triggerPromptViaGetCurrentPosition();
  }
}

function initBoundaryFilter() {
  if (!maps.risk || typeof L.Control.Draw === 'undefined') return;

  const drawnItems = new L.FeatureGroup();
  maps.risk.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    edit: {
      featureGroup: drawnItems
    },
    draw: {
      polygon: false,
      rectangle: {
        showArea: true
      },
      circle: false,
      marker: false,
      polyline: false
    }
  });

  maps.risk.addControl(drawControl);

  maps.risk.on(L.Draw.Event.CREATED, function (event) {
    const layer = event.layer;
    const bounds = layer.getBounds();

    Object.values(layers).forEach(layerGroup => {
      if (layerGroup) {
        layerGroup.eachLayer(marker => {
          if (bounds.contains(marker.getLatLng())) {
            marker.setOpacity(1);
          } else {
            marker.setOpacity(0.2);
          }
        });
      }
    });

    drawnItems.addLayer(layer);
  });
}

// Init: report type select options with localized hazard names
function initReportTypeOptions(){
  const rt = document.getElementById('report-type');
  if(!rt) return;
  const current = rt.value;
  rt.innerHTML = HAZARDS.map(h=>{
    const hz = (window.I18n ? I18n.t('hazards.'+h) : h);
    return `<option value="${h}">${hz}</option>`;
  }).join('');
  // Try to keep previous selection if still present
  if(current && HAZARDS.includes(current)) rt.value = current;
}

document.getElementById('filter-by-boundary')?.addEventListener('click', initBoundaryFilter);

// Global Search Functionality
const globalSearch = document.getElementById('global-search');
const views = $$('.view');
const tabs = $$('.tab');

globalSearch.addEventListener('keyup', (e) => {
  const searchTerm = e.target.value.toLowerCase();

  if (searchTerm.length === 0) {
    // If the search bar is empty, show the first tab
    views.forEach(v => v.classList.remove('active'));
    tabs.forEach(t => t.classList.remove('active'));
    tabs[0].classList.add('active');
    document.getElementById(tabs[0].getAttribute('aria-controls')).classList.add('active');
    return;
  }

  let firstMatchingView = null;
  for (const view of views) {
    const viewContent = view.textContent.toLowerCase();
    if (viewContent.includes(searchTerm)) {
      firstMatchingView = view;
      break;
    }
  }

  views.forEach(view => {
    const tab = document.getElementById(`${view.id.split('-')[0]}-tab`);
    if (view === firstMatchingView) {
      view.classList.add('active');
      if (tab) {
        tab.classList.add('active');
      }
    } else {
      view.classList.remove('active');
      if (tab) {
        tab.classList.remove('active');
      }
    }
  });
});