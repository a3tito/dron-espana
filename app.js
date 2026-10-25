'use strict';
/* ===== Dron España · núcleo: estado, mapa, consulta ENAIRE, análisis ===== */

const ENAIRE_API = 'https://servais.enaire.es/insigniads/rest/services/NSF_SRV/SRV_UAS_ZG_data_V2/FeatureServer';
const LAYERS = { aero: { id: 2, label: 'Aeronáutica' }, urbano: { id: 3, label: 'Zona urbana' }, infra: { id: 0, label: 'Infraestructuras' } };
const OVERPASS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const RANK = { PROHIBITED: 3, REQ_AUTHORIZATION: 2, CONDITIONAL: 1 };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- almacenamiento local (solo en tu móvil) ---------- */
const DB_KEY = 'dronEspana.v1';
const DB = { profile: {}, requests: [], checks: {}, docs: [], seenNews: '', onboarded: false, layers: { aero: true, urbano: true, infra: true } };
function dbLoad() { try { Object.assign(DB, JSON.parse(localStorage.getItem(DB_KEY) || '{}')); } catch { /* sin almacenamiento */ } }
function dbSave() { try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); return true; } catch { toast('No se pudo guardar: almacenamiento lleno'); return false; } }

/* ---------- estado ---------- */
const S = { point: null, label: '', height: 60, radius: 50, when: roundHour(new Date(Date.now() + 3600e3)), raw: null, elev: null, wx: null, nearby: null, osm: undefined, failed: [], loading: false, token: 0, sheetTall: false };
function roundHour(d) { const x = new Date(d); x.setMinutes(0, 0, 0); return x; }
const pad = n => String(n).padStart(2, '0');
const localHourKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
const toInputDT = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

async function jfetch(url, { timeout = 20000, ...opt } = {}) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { const r = await fetch(url, { ...opt, signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

/* ---------- geometría ---------- */
const rad = x => x * Math.PI / 180;
function haversine(a, b, c, d) { const R = 6371000, dl = rad(c - a), dg = rad(d - b); const x = Math.sin(dl / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function bearing(a, b, c, d) { const y = Math.sin(rad(d - b)) * Math.cos(rad(c)); const x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b)); const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(deg / 45) % 8]; }
function inRing(x, y, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
function distToGeom(lat, lng, g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const kx = 111320 * Math.cos(rad(lat)), ky = 110540; let best = Infinity;
  for (const poly of polys) {
    if (inRing(lng, lat, poly[0]) && !poly.slice(1).some(r => inRing(lng, lat, r))) return 0;
    for (const ring of poly) for (let i = 0; i < ring.length - 1; i++) {
      const ax = (ring[i][0] - lng) * kx, ay = (ring[i][1] - lat) * ky, bx = (ring[i + 1][0] - lng) * kx, by = (ring[i + 1][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? -(ax * dx + ay * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
function dms(v, pos, neg) { const s = v >= 0 ? pos : neg; v = Math.abs(v); const d = Math.floor(v), m = Math.floor((v - d) * 60), sec = ((v - d) * 60 - m) * 60; return `${d}°${pad(m)}'${sec.toFixed(1)}"${s}`; }
const coordTxt = (lat, lng) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

/* ---------- HTML oficial de ENAIRE: limpiar y extraer contactos ---------- */
const OK_TAGS = new Set(['B', 'STRONG', 'P', 'A', 'BR', 'I', 'EM', 'UL', 'LI', 'SPAN', 'ELEM']);
function sanitize(html) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
  (function walk(n) {
    [...n.childNodes].forEach(c => {
      if (c.nodeType === 1) {
        walk(c);
        if (!OK_TAGS.has(c.tagName)) { c.replaceWith(...c.childNodes); return; }
        [...c.attributes].forEach(a => { if (!(c.tagName === 'A' && a.name === 'href')) c.removeAttribute(a.name); });
        if (c.tagName === 'A') {
          const h = (c.getAttribute('href') || '').trim();
          if (/^(https?:|mailto:)/i.test(h)) { c.setAttribute('href', h); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
          else c.replaceWith(...c.childNodes);
        }
      } else if (c.nodeType !== 3) c.remove();
    });
  })(doc.body);
  return doc.body.innerHTML;
}
function extractContacts(p) {
  const doc = new DOMParser().parseFromString('<body>' + (p.message || '') + '</body>', 'text/html');
  const text = doc.body.textContent || '';
  const emails = new Set(), urls = new Set(), phones = new Set();
  const addE = s => String(s || '').split(/[;,\s]+/).forEach(e => { e = e.trim().toLowerCase(); if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e)) emails.add(e); });
  addE(p.email); (text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []).forEach(e => emails.add(e.toLowerCase()));
  doc.querySelectorAll('a[href]').forEach(a => { const h = a.getAttribute('href').trim(); if (/^mailto:/i.test(h)) addE(h.slice(7)); else if (/^https?:/i.test(h)) urls.add(h); });
  if (/^https?:/i.test((p.siteURL || '').trim())) urls.add(p.siteURL.trim());
  const addP = s => { const d = String(s).replace(/[^\d+]/g, ''); if (/^(\+34)?[6-9]\d{8}$/.test(d)) phones.add(d.replace(/^(\+34)?(\d{3})(\d{3})(\d{3})$/, '+34 $2 $3 $4')); };
  String(p.phone || '').split(/[;,/]+/).forEach(addP);
  (text.match(/(?:\+34[\s.-]?)?[6-9]\d{2}(?:[\s.-]?\d{3}[\s.-]?\d{3}|(?:[\s.-]\d{2}){3})/g) || []).forEach(addP);
  return { emails: [...emails], urls: [...urls], phones: [...phones] };
}
function whoIs(z) {
  const c = z.contacts, blob = [z.p.message, z.p.service, z.p.contactName, z.p.name_authority, ...c.emails, ...c.urls].join(' ');
  if (/planea\.enaire/i.test(blob)) return { key: 'planea', kind: 'planea', name: 'ENAIRE · Planea' };
  if (/aena\.es/i.test(blob)) return { key: 'aena:' + z.title, kind: 'aena', name: 'AENA · ' + z.title };
  if (/cecaf/i.test(blob)) return { key: 'cecaf', kind: 'cecaf', name: 'CECAF · Ejército del Aire' };
  if (/adif/i.test(blob)) return { key: 'adif', kind: 'adif', name: 'ADIF (ferrocarril)' };
  if (/@ea\.mde\.es|@mde\.es|@.*\.mde\.es|ejercito|ej[ée]rcito del aire|militar/i.test(blob)) return { key: 'def:' + z.title, kind: 'defensa', name: 'Defensa · ' + z.title };
  if (z.p.reasons === 'AIR_TRAFFIC' && z.layer === 'aero' && !/^(CTR|TMA|CTA|ATZ|FIZ|TIZ)\b/i.test(z.title) && (c.emails.length || c.phones.length)) {
    const heli = /helipuerto|heliport/i.test(z.p.message || '');
    return { key: 'aero:' + z.title, kind: heli ? 'helipuerto' : 'aerodromo', name: (heli ? 'Helipuerto · ' : 'Aeródromo · ') + z.title };
  }
  if (z.layer === 'urbano' || /seguridadaerea\.gob\.es/i.test(blob)) return { key: 'aesa', kind: 'aesa', name: 'AESA · Agencia Estatal de Seguridad Aérea' };
  const who = c.emails[0] || c.urls[0];
  if (who) return { key: 'otro:' + who, kind: 'otro', name: z.p.contactName || z.p.service || z.p.name_authority || z.title };
  return { key: 'aesa', kind: 'aesa', name: 'AESA · Agencia Estatal de Seguridad Aérea' };
}

/* ---------- procesado de una zona ---------- */
function toAGL(val, ref, uom, elev) {
  if (val == null || val === '') return null;
  const m = uom === 'FT' ? val * 0.3048 : val;
  if (String(ref).toUpperCase() === 'AMSL') return elev == null ? NaN : m - elev;
  return m;
}
function titleOf(p, layer) {
  const nm = clean(String(p.name || '').split(/<br\s*\/?>/i)[0]); // algunos nombres de ENAIRE traen HTML ("… <br><b>Datos NO AIP.</b>")
  if (nm) return nm;
  const m = /<elem>(.*?)<\/elem>/i.exec(p.message || ''); if (m) return clean(m[1]).replace(/[.\s]+$/, '');
  const hoja = /Nombre:\s*([^<]+?)\s*,\s*Hoja:\s*([^<.]+)/i.exec(p.message || '');
  if (hoja) return `Vuelo fotográfico restringido · ${hoja[1]} (hoja ${hoja[2]})`;
  if (/ferroviari/i.test(p.message || '')) return 'Infraestructura ferroviaria (ADIF)';
  const aeromod = /aeromodelismo[\s\S]*?asociada a (\w+)|asociada a (\w+)[\s\S]*?aeromodelismo/i.exec(clean(p.message));
  if (aeromod) return `Zona de aeromodelismo (${aeromod[1] || aeromod[2]})`;
  return layer === 'urbano' ? 'Zona urbana (seguridad ciudadana)' : layer === 'infra' ? 'Infraestructura protegida' : 'Zona UAS';
}
function clean(t) { return String(t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }

function procFeature(f, layer, elev, h, when) {
  const p = f.properties || {}, uom = String(p.uom || 'M').toUpperCase();
  const lo = toAGL(p.lower ?? 0, p.lowerReference, uom, elev), up = toAGL(p.upper, p.upperReference, uom, elev);
  const unsure = Number.isNaN(lo) || Number.isNaN(up);
  const loA = Number.isNaN(lo) || lo == null ? null : Math.max(0, lo), upA = Number.isNaN(up) ? null : up == null ? Infinity : up;
  let applies = unsure ? true : (upA > 0 && (loA <= 0 || h > loA));
  const t = when.getTime(), vf = Date.parse(p.validFrom), vt = Date.parse(p.validTo);
  if (!isNaN(vt) && vt < t) applies = false;
  if (!isNaN(vf) && vf > t) applies = false;
  const z = {
    id: p.identifier || p.OBJECTID || Math.random().toString(36).slice(2), layer, p, type: p.type || '', rank: RANK[p.type] || 0,
    title: titleOf(p, layer), loA, upA, unsure, applies, uom, schedule: !!(p.startDateTime || p.endDateTime || p.day || p.startTime),
    interval: p.intervalBefore || '', purpose: p.purpose || '', geometry: f.geometry || null,
  };
  z.contacts = extractContacts(p); z.who = whoIs(z);
  return z;
}
function vertTxt(z) {
  const m = v => v === Infinity ? 'sin límite' : `${Math.round(v)} m`;
  const lo = z.loA == null ? '?' : z.loA <= 0 ? 'el suelo' : m(z.loA);
  const hi = z.upA == null ? '?' : m(z.upA);
  return `Afecta desde ${lo} hasta ${hi} sobre el suelo${z.unsure ? ' (calculado sin altitud del terreno: compruébalo)' : ''}.`;
}

/* ---------- consultas ---------- */
async function queryPoint(layerId, lat, lng, r, extra = {}) {
  const q = new URLSearchParams({ f: 'geojson', where: '1=1', geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false', ...extra });
  if (r > 0) { q.set('distance', r); q.set('units', 'esriSRUnit_Meter'); }
  const j = await jfetch(`${ENAIRE_API}/${layerId}/query?${q}`, { timeout: 25000 });
  if (j.error) throw new Error(j.error.message || 'ENAIRE');
  return j.features || [];
}
const getElevation = (lat, lng) => jfetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`, { timeout: 10000 }).then(j => j.elevation?.[0] ?? null);
const getWeather = (lat, lng) => jfetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation,visibility,wind_speed_10m,wind_gusts_10m,wind_speed_80m,cloud_cover&wind_speed_unit=ms&timezone=auto&forecast_days=10`, { timeout: 15000 });
const reverseGeo = (lat, lng) => jfetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=es&lat=${lat}&lon=${lng}`, { timeout: 10000 });
/* Pista (no certeza) de si el punto cae en un casco urbano, según OpenStreetMap. */
function urbanHint(j) {
  if (!j || !j.address) return '';
  const a = j.address, place = a.city || a.town || a.village || a.municipality || a.hamlet || '';
  const built = ['suburb', 'neighbourhood', 'quarter', 'city_district', 'borough'].some(k => a[k]) || ['building', 'house', 'residential', 'neighbourhood', 'suburb', 'quarter'].includes(j.addresstype);
  if (built && place) return `OpenStreetMap sitúa este punto en un barrio de ${place}: parece casco urbano.`;
  if (place) return `Estás cerca de ${place}. Mira el mapa para ver si el punto cae dentro del pueblo o fuera.`;
  return 'OpenStreetMap no ve ninguna población aquí: parece campo abierto.';
}
function osmNearby(lat, lng, r) {
  const q = `[out:json][timeout:20];(nwr["aeroway"~"^(aerodrome|heliport)$"](around:${r},${lat},${lng}););out center tags 80;`;
  return Promise.any(OVERPASS.map(u => jfetch(`${u}?data=${encodeURIComponent(q)}`, { timeout: 16000 }).then(j => { if (!j.elements) throw 0; return j.elements; })));
}

/* ---------- análisis completo de un punto ---------- */
async function setPoint(lat, lng, label, fly = true, accuracy) {
  S.point = { lat, lng }; S.label = label || ''; S.urban = 'auto'; S.urbanHint = ''; S.raw = null; S.nearby = null; S.osm = undefined; S.failed = []; S.wx = null; S.elev = null;
  placeMarker(lat, lng, accuracy); if (fly) map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: .6 });
  setSheetTall(true); await analyze();
}
async function analyze() {
  const tk = ++S.token, { lat, lng } = S.point; S.loading = true; renderSheet();
  const keys = Object.keys(LAYERS);
  const [lr, elevR, wxR] = await Promise.all([
    Promise.allSettled(keys.map(k => queryPoint(LAYERS[k].id, lat, lng, S.radius))),
    getElevation(lat, lng).catch(() => null), getWeather(lat, lng).catch(() => null)]);
  if (tk !== S.token) return;
  S.raw = []; S.failed = [];
  lr.forEach((r, i) => { if (r.status === 'fulfilled') r.value.forEach(f => S.raw.push({ f, layer: keys[i] })); else S.failed.push(LAYERS[keys[i]].label); });
  S.elev = elevR; S.wx = wxR; S.loading = false; renderSheet(); updateBadge();
  reverseGeo(lat, lng).then(j => { if (tk !== S.token) return; S.urbanHint = urbanHint(j); if ((!S.label || /^(Punto elegido|Coordenadas)$/.test(S.label)) && j.display_name) S.label = j.display_name.split(',').slice(0, 3).join(','); renderSheet(); }).catch(() => { });
  loadNearby(tk);
}
async function loadNearby(tk) {
  const { lat, lng } = S.point;
  try {
    const feats = await queryPoint(LAYERS.aero.id, lat, lng, 25000, { returnGeometry: 'true', maxAllowableOffset: '0.003', geometryPrecision: '4' });
    if (tk !== S.token) return;
    const map_ = new Map();
    feats.forEach(f => {
      const z = procFeature(f, 'aero', null, 0, S.when);
      if (z.p.reasons !== 'AIR_TRAFFIC' || !(z.p.name || '').trim() || /^(CTR|TMA|CTA|ATZ|FIZ|TIZ|FIR|UIR|ACC|ZEPA|LE[RDP])\b/i.test(z.title)) return;
      const d = z.geometry ? distToGeom(lat, lng, z.geometry) : Infinity;
      const old = map_.get(z.title);
      if (!old || d < old.dist) map_.set(z.title, { title: z.title, dist: d, contacts: z.contacts, p: z.p, heli: /helipuerto|heliport/i.test(z.title + z.p.message), icao: (/,\s*(L[EG][A-Z]{2}|GC[A-Z]{2})\b/.exec(clean(z.p.message)) || [])[1] || '' });
    });
    S.nearby = [...map_.values()].sort((a, b) => a.dist - b.dist);
  } catch { S.nearby = []; S.nearbyErr = true; }
  renderSheet();
  osmNearby(lat, lng, 25000).then(els => { if (tk === S.token) { S.osm = els; mergeOsm(); renderSheet(); } }).catch(() => { if (tk === S.token) { S.osm = null; renderSheet(); } });
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set(['aeropuerto', 'aerodromo', 'airport', 'aerea', 'helipuerto', 'heliport', 'base', 'aeroclub', 'club', 'madrid', 'barcelona', 'de', 'del', 'la', 'el', 'los']);
function mergeOsm() {
  if (!S.osm || !S.nearby) return;
  const used = new Set();
  S.nearby.forEach(a => {
    const toks = norm(a.title).split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !STOP.has(t));
    const el = S.osm.find(e => { const t = e.tags || {}; const n = norm([t.name, t['name:es'], t.icao, t.iata].join(' ')); return (a.icao && t.icao === a.icao) || toks.some(k => n.includes(k)); });
    if (el) { used.add(el.id); const t = el.tags; a.osm = { phone: t.phone || t['contact:phone'], email: t.email || t['contact:email'], web: t.website || t['contact:website'] }; }
  });
  S.others = S.osm.filter(e => !used.has(e.id) && e.tags && (e.tags.name || e.tags.icao)).map(e => {
    const c = e.center || { lat: e.lat, lon: e.lon }, t = e.tags;
    return { title: t.name || t.icao, heli: t.aeroway === 'heliport', dist: haversine(S.point.lat, S.point.lng, c.lat, c.lon), dir: bearing(S.point.lat, S.point.lng, c.lat, c.lon), lat: c.lat, lng: c.lon, phone: t.phone || t['contact:phone'], email: t.email || t['contact:email'], web: t.website || t['contact:website'] };
  }).sort((a, b) => a.dist - b.dist).slice(0, 8);
}

/* ---------- evaluación (se recalcula al cambiar altura/fecha sin volver a consultar) ---------- */
function evaluate() {
  if (!S.raw) return null;
  const zones = S.raw.map(r => procFeature(r.f, r.layer, S.elev, S.height, S.when)).sort((a, b) => b.rank - a.rank);
  // La capa «Urbano» de ENAIRE son pocos polígonos que cubren TODO el territorio: no delimita los cascos urbanos.
  // Solo cuenta si el usuario confirma que está en zona urbana; si no lo sabe, se avisa.
  const urbanPending = S.urban === 'auto' && zones.some(z => z.layer === 'urbano' && z.applies);
  zones.forEach(z => { if (z.layer === 'urbano' && S.urban !== 'si') z.applies = false; });
  const active = zones.filter(z => z.applies);
  const groups = new Map();
  active.filter(z => z.rank >= 1).forEach(z => {
    let g = groups.get(z.who.key);
    if (!g) groups.set(z.who.key, g = { ...z.who, zones: [], emails: [], phones: [], urls: [], rank: 0, interval: '', purposes: new Set() });
    g.zones.push(z); g.rank = Math.max(g.rank, z.rank);
    z.contacts.emails.forEach(e => !g.emails.includes(e) && g.emails.push(e));
    z.contacts.phones.forEach(e => !g.phones.includes(e) && g.phones.push(e));
    z.contacts.urls.forEach(e => !g.urls.includes(e) && g.urls.push(e));
    if (z.interval && duracionDias(z.interval) >= duracionDias(g.interval)) g.interval = z.interval;
    if (z.purpose) g.purposes.add(z.purpose);
  });
  const rank = active.reduce((m, z) => Math.max(m, z.rank), 0);
  return { zones, active, groups: [...groups.values()].sort((a, b) => b.rank - a.rank), rank, urbanPending, ignored: zones.filter(z => z.layer !== 'urbano').length - active.filter(z => z.layer !== 'urbano').length };
}
function verdictOf(ev) {
  if (S.failed.length && !(ev && ev.rank)) return { cls: 'v-warn', ico: '❓', t: 'No he podido comprobarlo', d: `ENAIRE no respondió (${S.failed.join(', ')}). No des por hecho que la zona esté libre: reintenta o consulta drones.enaire.es.` };
  if (!ev) return { cls: 'v-idle', ico: '🗺️', t: '', d: '' };
  if (ev.rank >= 3) return { cls: 'v-stop', ico: '⛔', t: 'NO VUELES AQUÍ', d: 'Hay una zona con vuelo prohibido a esa altura.' };
  if (ev.rank === 2) return { cls: 'v-warn', ico: '🛂', t: 'NECESITAS PERMISO ANTES', d: `A ${S.height} m hay ${ev.groups.filter(g => g.rank >= 2).length} permiso(s) que pedir. Te lo dejo todo preparado abajo.` };
  if (ev.rank === 1) return { cls: 'v-warn', ico: '⚠️', t: 'PUEDES VOLAR CON CONDICIONES', d: 'Hay una zona con condiciones o aviso previo. Revisa los pasos.' };
  if (ev.urbanPending) return { cls: 'v-warn', ico: '🏘️', t: 'DEPENDE: ¿ES ZONA URBANA?', d: 'ENAIRE no marca ninguna otra zona aquí, pero en cascos urbanos hace falta autorización. Dime abajo si estás en un pueblo o ciudad.' };
  return { cls: 'v-ok', ico: '✅', t: 'PUEDES VOLAR', d: `ENAIRE no marca ninguna zona a ${S.height} m en este punto${S.urban === 'no' ? ' (campo abierto, fuera de casco urbano)' : ''}. Aplican las normas generales de la categoría abierta.` };
}
function wxAssess() {
  const w = S.wx?.hourly; if (!w) return null;
  const i = w.time.indexOf(localHourKey(S.when)); if (i < 0) return { none: true };
  const maxW = Number(DB.profile.maxWind) || 10;
  const v = { gust: w.wind_gusts_10m[i], wind: w.wind_speed_10m[i], wind80: w.wind_speed_80m?.[i], rain: w.precipitation[i], vis: w.visibility?.[i], temp: w.temperature_2m[i], cloud: w.cloud_cover?.[i], maxW };
  const bad = [], meh = [];
  if (v.gust >= maxW) bad.push(`Rachas de ${v.gust.toFixed(0)} m/s: superan el límite de tu dron (${maxW} m/s)`); else if (v.gust >= maxW * .7) meh.push(`Rachas de ${v.gust.toFixed(0)} m/s: cerca del límite (${maxW} m/s)`);
  if (v.rain > 0.1) meh.push(`Lluvia prevista (${v.rain} mm)`);
  if (v.vis != null && v.vis < 1000) bad.push(`Visibilidad de solo ${Math.round(v.vis)} m`); else if (v.vis != null && v.vis < 3000) meh.push(`Visibilidad reducida (${(v.vis / 1000).toFixed(1)} km)`);
  if (v.temp < 0 || v.temp > 38) meh.push(`Temperatura extrema (${v.temp.toFixed(0)} °C): cuida la batería`);
  v.level = bad.length ? 'stop' : meh.length ? 'warn' : 'ok'; v.notes = [...bad, ...meh];
  return v;
}

/* ---------- MAPA ---------- */
let map, marker, accCircle, zoneLayer, zoneCtl, base = 0;
const BASES = [
  () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap · Zonas UAS: ENAIRE' }),
  () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery · Zonas UAS: ENAIRE' }),
];
let baseLayer;
function initMap() {
  map = L.map('map', { zoomControl: false, center: [40.2, -3.7], zoom: 6 });
  baseLayer = BASES[0]().addTo(map); zoneLayer = L.layerGroup().addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  map.on('click', e => setPoint(e.latlng.lat, e.latlng.lng, 'Punto elegido', false));
  let t; map.on('moveend', () => { clearTimeout(t); t = setTimeout(loadOverlay, 450); });
  loadOverlay();
}
function placeMarker(lat, lng, acc) {
  if (marker) marker.setLatLng([lat, lng]); else marker = L.marker([lat, lng]).addTo(map);
  if (accCircle) { map.removeLayer(accCircle); accCircle = null; }
  if (acc) accCircle = L.circle([lat, lng], { radius: acc, weight: 1, fillOpacity: .1 }).addTo(map);
}
const LAYER_COL = { aero: '#d9480f', urbano: '#7048e8', infra: '#e8a200' };
function quickApplies(p) {
  const uom = String(p.uom || 'M').toUpperCase(), f = uom === 'FT' ? .3048 : 1;
  if (String(p.lowerReference).toUpperCase() === 'AMSL') return true;
  const lo = (p.lower || 0) * f; return lo <= 0 || S.height > lo;
}
async function loadOverlay() {
  const hint = $('#mapHint');
  if (map.getZoom() < 8) { zoneLayer.clearLayers(); hint.hidden = false; hint.textContent = 'Acerca el mapa para ver las zonas de ENAIRE'; return; }
  hint.hidden = true; zoneCtl?.abort(); zoneCtl = new AbortController();
  const b = map.getBounds(), env = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`, off = (360 / (256 * 2 ** map.getZoom())) * 1.5;
  const keys = Object.keys(LAYERS).filter(k => k !== 'urbano' && DB.layers[k]); // 'urbano' cubre todo el país: no se dibuja
  const res = await Promise.allSettled(keys.map(k => {
    const q = new URLSearchParams({ f: 'geojson', where: '1=1', geometry: env, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'type,name,lower,lowerReference,upper,upperReference,uom', returnGeometry: 'true', maxAllowableOffset: off, geometryPrecision: '5' });
    return fetch(`${ENAIRE_API}/${LAYERS[k].id}/query?${q}`, { signal: zoneCtl.signal }).then(r => r.json()).then(j => ({ k, feats: j.features || [] }));
  }));
  if (zoneCtl.signal.aborted) return;
  zoneLayer.clearLayers();
  res.forEach(r => {
    if (r.status !== 'fulfilled') return;
    L.geoJSON({ type: 'FeatureCollection', features: r.value.feats }, {
      interactive: false,
      style: f => { const p = f.properties, on = quickApplies(p), col = LAYER_COL[r.value.k]; return { color: col, weight: on ? 2 : 1, dashArray: on ? null : '5 5', fillColor: col, fillOpacity: on ? (p.type === 'PROHIBITED' ? .4 : .22) : .05 }; },
    }).addTo(zoneLayer);
  });
}
function setSheetTall(v) { S.sheetTall = v; $('#sheet').classList.toggle('tall', v); }
function locate() {
  if (!navigator.geolocation) return toast('Tu navegador no permite usar la ubicación');
  toast('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(p => setPoint(p.coords.latitude, p.coords.longitude, 'Mi ubicación', true, p.coords.accuracy),
    e => toast(e.code === 1 ? 'Permiso de ubicación denegado. Actívalo en el navegador o busca el lugar a mano.' : 'No he podido obtener tu ubicación. Prueba al aire libre o busca el lugar.'),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
}
async function search(q) {
  q = q.trim(); if (!q) return;
  const m = /^(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)$/.exec(q);
  if (m) return setPoint(parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.')), 'Coordenadas');
  const ul = $('#searchResults'); ul.hidden = false; ul.innerHTML = '<li><span class="spin"></span>Buscando…</li>';
  try {
    const r = await jfetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=es&accept-language=es&q=${encodeURIComponent(q)}`, { timeout: 12000 });
    if (!r.length) { ul.innerHTML = '<li>No encuentro ese sitio. Prueba con otro nombre o con coordenadas.</li>'; return; }
    ul.innerHTML = r.map((x, i) => `<li data-i="${i}">${esc(x.display_name)}</li>`).join('');
    ul.onclick = e => { const li = e.target.closest('li[data-i]'); if (!li) return; const x = r[+li.dataset.i]; ul.hidden = true; $('#searchInput').value = ''; setPoint(+x.lat, +x.lon, x.display_name.split(',').slice(0, 3).join(','), true); };
  } catch { ul.innerHTML = '<li>La búsqueda no está disponible ahora. Toca el mapa para elegir el punto.</li>'; }
}
