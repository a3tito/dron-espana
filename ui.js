'use strict';
/* ===== Dron España · interfaz: panel, permisos, perfil, noticias, guía ===== */

const uid = () => Math.random().toString(36).slice(2, 10);
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || ''); };
const uniq = (a, i, arr) => arr.indexOf(a) === i;
const gmaps = (lat, lng) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
const osmLink = (lat, lng) => `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=16/${lat.toFixed(5)}/${lng.toFixed(5)}`;
const telHref = p => 'tel:' + p.replace(/[^\d+]/g, '');
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const getPath = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
function setPath(o, p, v) { const ks = p.split('.'); const l = ks.pop(); const t = ks.reduce((x, k) => (x[k] ??= {}), o); t[l] = v; }

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); }
  catch { const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = 0; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch { /* nada */ } a.remove(); }
  toast('Copiado ✓');
}

/* ========================= PANEL INFERIOR DEL MAPA ========================= */
const KIND_HELP = {
  planea: 'Hay que pedir la coordinación en <b>ENAIRE Planea</b>. Necesitas entrar con tu cuenta; te dejo la ficha con todos tus datos para copiar y pegar campo por campo.',
  aena: 'Hay que pedir la coordinación al <b>aeropuerto</b>. Lo más rápido: email ya redactado o llamada.',
  defensa: 'Es un <b>aeródromo militar</b>: pide la coordinación a su torre/unidad (email ya redactado).',
  cecaf: 'Para fotografía o captación de datos aquí hay que pedir los condicionantes técnicos al <b>CECAF</b> (Ejército del Aire).',
  adif: 'Zona de <b>infraestructura ferroviaria</b>. Comprueba en la web de ADIF si tu vuelo es declarativo o necesita autorización, y avisa con antelación.',
  aesa: 'Esta zona la gestiona <b>AESA</b>. Consulta el procedimiento oficial: suele exigir autorización previa o categoría específica.',
  aerodromo: 'Estás en la zona de un <b>aeródromo</b>: hay que coordinar el vuelo con él. Llama o escribe con los datos de abajo.',
  helipuerto: 'Estás en la zona de un <b>helipuerto</b> (suele ser de un hospital o edificio): hay que coordinar el vuelo con él. Llama o escribe con los datos de abajo.',
  otro: 'Contacta con la entidad indicada antes de volar.',
};
const KIND_ICON = { planea: '🛰️', aena: '✈️', defensa: '🪖', cecaf: '📷', adif: '🚆', aesa: '🏛️', aerodromo: '✈️', helipuerto: '🚁', otro: '📨' };

/* ¿Tu carné cubre la subcategoría de este dron? (el A2 incluye el A1/A3) */
const certCubre = (c, R) => !R.cert || (R.sub === 'A2' ? c === 'a2' : ['a1a3', 'a2', 'sts'].includes(c));
function profileChecks(d = activeDrone()) {
  const P = profWith(d), R = d ? reglasDron(d) : null, out = [];
  if (!R) return { R: null, items: [] };
  out.push([true, `<b>${esc(d.droneName || 'Tu dron')}</b> (${R.g} g) → ${R.subTxt}`]);
  if (S.height > RULES.maxHeight) out.push([false, `Has elegido ${S.height} m: el máximo en categoría abierta es <b>${RULES.maxHeight} m</b>.`]);
  if (R.registro) out.push([!!P.operatorId, P.operatorId ? `Registro de operador AESA: <b>${esc(P.operatorId)}</b>` : 'Te falta tu <b>número de operador AESA</b> (obligatorio para este dron; es gratis).']);
  const certOk = certCubre(P.pilotCert, R);
  out.push([certOk, R.cert ? (certOk ? `Carné: <b>${esc(certLabel(P.pilotCert))}</b>` : `Te falta el carné: ${R.certTxt}`) : R.certTxt]);
  if (R.seguro) out.push([!!P.policy, P.policy ? `Seguro: <b>${esc(P.insurer || '')}</b> · ${esc(P.policy)}` : `Te falta el <b>seguro</b>: ${R.seguroTxt}`]);
  else out.push([true, `Seguro: <b>no obligatorio</b> en ${R.sub}${P.policy ? ` (ya tienes ${esc(P.insurer || 'uno')})` : ''}.`]);
  R.notas.forEach(n => out.push([false, esc(n)]));
  return { R, items: out };
}
/* Qué puedes hacer con CADA dron en este punto, a esta altura y con este tiempo */
function droneVerdict(d, ev) {
  const R = reglasDron(d), P = profWith(d);
  if (!R) return { ico: '❓', t: 'Falta el peso del dron', ok: false, lines: [] };
  const lines = [], bad = [], warn = [];
  const urbanLikely = S.urban === 'si' || (S.urban === 'auto' && /casco urbano/i.test(S.urbanHint || ''));
  if (S.height > RULES.maxHeight) bad.push(`${S.height} m supera el máximo de ${RULES.maxHeight} m`);
  if (R.registro && !P.operatorId) bad.push('te falta el registro de operador (AESA)');
  if (!certCubre(P.pilotCert, R)) bad.push('te falta el carné de piloto que exige');
  if (R.seguro && !P.policy) bad.push('te falta el seguro (obligatorio en A2)');
  if (R.sub === 'A3' && urbanLikely) bad.push(`A3 exige estar a ${RULES.distA3} m de zonas urbanas`);
  if (R.sub === 'A2' && urbanLikely) warn.push(`A2: mantén ${RULES.distA2} m de personas ajenas`);
  const w = wxAssess(d); if (w && !w.none) { if (w.level === 'stop') bad.push(`el viento supera su límite (${w.maxW} m/s)`); else if (w.level === 'warn') warn.push(w.notes.join('; ')); }
  R.notas.forEach(n => warn.push(n));
  const zona = ev ? (ev.rank >= 3 ? ['⛔', 'vuelo prohibido aquí'] : ev.rank === 2 ? ['🛂', ev.freeUpTo >= 10 ? `permiso necesario por encima de ${ev.freeUpTo} m` : 'necesita permiso'] : ev.rank === 1 ? ['⚠️', 'con condiciones'] : ev.urbanPending ? ['🏘️', 'depende de si es casco urbano'] : ['✅', 'zona libre']) : ['❓', 'sin comprobar'];
  const ico = ev?.rank >= 3 || bad.length ? '⛔' : ev?.rank === 2 ? '🛂' : warn.length || ev?.rank === 1 || ev?.urbanPending ? '⚠️' : '✅';
  return { ico, zona, bad, warn, R, d, t: ico === '⛔' ? 'No puedes volarlo aquí ahora' : ico === '🛂' ? 'Puedes, con permiso' : ico === '⚠️' ? 'Puedes, con cuidado' : 'Puedes volarlo' };
}
function dronesHtml(ev) {
  if (!DB.drones.length) return `<div class="card"><p style="margin:0 0 8px">Añade tus drones (puedes tener varios) y te digo qué puedes hacer con cada uno aquí.</p><button class="btn" data-act="nav" data-v="profile">Añadir mis drones</button></div>`;
  const act = activeDrone();
  return DB.drones.map(d => {
    const v = droneVerdict(d, ev), cls = v.ico === '✅' ? 'ok' : v.ico === '⛔' ? 'stop' : 'warn';
    if (!v.R) return `<div class="card warn"><h3>❓ ${esc(d.droneName || 'Dron')}</h3><p class="small muted" style="margin:0">Indica su peso en Mi perfil.</p></div>`;
    return `<div class="card ${cls}"><h3>${v.ico} ${esc(d.droneName || 'Dron')} <span class="muted small">· ${v.R.sub} · ${v.R.g} g</span></h3>
      <div class="tags"><span class="tag ${cls === 'ok' ? 'green' : cls === 'stop' ? 'red' : 'amber'}">${v.t}</span><span class="tag">${v.zona[0]} ${esc(v.zona[1])}</span>${act && act.id === d.id ? '<span class="tag green">Dron activo</span>' : ''}</div>
      ${v.bad.length ? `<ul style="margin:6px 0">${v.bad.map(b => `<li>❌ ${esc(b)}</li>`).join('')}</ul>` : ''}${v.warn.length ? `<ul style="margin:6px 0">${v.warn.map(b => `<li>⚠️ ${esc(b)}</li>`).join('')}</ul>` : ''}
      <details><summary>Reglas de este dron</summary><ul class="small"><li>${esc(v.R.registroTxt)}</li><li>${esc(v.R.certTxt)}</li><li>${esc(v.R.seguroTxt)}</li><li>${esc(v.R.edadTxt)}</li>${v.R.limites.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>
      ${act && act.id === d.id ? '' : `<button class="btn sec sm" data-act="dr-act" data-id="${d.id}">Usar este para mis solicitudes</button>`}</div>`;
  }).join('');
}
const certLabel = c => ({ a1a3: 'A1/A3', a2: 'A2', sts: 'Categoría específica (STS)', none: 'Sin carné' }[c] || 'Sin indicar');

function leadHtml(g) {
  if (!g.interval) return '';
  const dias = duracionDias(g.interval), txt = duracionISO(g.interval);
  if (!dias) return `<span class="tag amber">⏱ Aviso previo: ${esc(txt)}</span>`;
  const limit = new Date(S.when.getTime() - dias * 864e5), late = limit < new Date();
  return `<span class="tag ${late ? 'red' : 'amber'}">⏱ Pídelo con ${esc(txt)} de antelación${late ? ' — ¡ya vas justo o tarde para esa fecha!' : ` (antes del ${limit.toLocaleDateString('es-ES')})`}</span>`;
}

function groupCard(g) {
  const cls = g.rank >= 3 ? 'stop' : g.rank === 2 ? 'warn' : 'ok';
  const phones = g.phones.map(p => `<a class="btn call" href="${telHref(p)}">📞 Llamar ${esc(p)}</a>`).join('');
  const web = g.kind === 'planea' ? ENLACES.planea : (g.urls.find(u => !/aip\.enaire|boe\.es/.test(u)) || g.urls[0]);
  const webs = web ? `<a class="btn sec" target="_blank" rel="noopener" href="${esc(web)}">🌐 ${g.kind === 'planea' ? 'Abrir Planea' : esc(hostOf(web))}</a>` : '';
  const mail = g.emails.length ? `<button class="btn" data-act="mail" data-g="${esc(g.key)}">✉️ Enviar email ya redactado</button>` : '';
  const rows = [...g.emails.map(e => ['Email', e]), ...g.phones.map(e => ['Teléfono', e]), ...g.urls.slice(0, 3).map(e => ['Web', e])];
  const sinContacto = !rows.length ? `<p class="small muted">ENAIRE no publica teléfono ni email para esta zona. Usa el enlace oficial o escribe a <a href="mailto:${ENLACES.enaireAIS}">${ENLACES.enaireAIS}</a>.</p>` : '';
  return `<div class="card ${cls}">
    <h3>${KIND_ICON[g.kind] || '📨'} ${esc(g.name)}</h3>
    <div class="tags">${g.zones.map(z => z.title).filter(uniq).map(t => `<span class="tag ${g.rank >= 2 ? 'red' : 'amber'}">${esc(t)}</span>`).join('')}${leadHtml(g)}</div>
    <p style="margin:6px 0">${KIND_HELP[g.kind] || KIND_HELP.otro}</p>
    <div class="actions">${phones}${mail}<button class="btn ${mail ? 'sec' : ''}" data-act="prep" data-g="${esc(g.key)}">📝 Preparar solicitud completa</button>${webs}</div>
    ${rows.length ? `<div style="margin-top:8px">${rows.map(([k, v]) => `<div class="copyrow"><div><div class="k">${k}</div><div class="v small">${esc(v)}</div></div><button class="btn sec sm" data-act="copy" data-t="${esc(v)}">Copiar</button></div>`).join('')}</div>` : ''}
    ${sinContacto}
    <details><summary>Texto oficial de ENAIRE (${g.zones.length})</summary>${g.zones.map(z => `<div class="official"><b>${esc(z.title)}</b><br><span class="muted">${esc(vertTxt(z))}</span>${sanitize(z.p.message)}</div>`).join('')}</details>
  </div>`;
}

function nearbyHtml() {
  if (S.nearby === null) return '<div class="card"><span class="spin"></span>Buscando aeropuertos, aeródromos y helipuertos cercanos…</div>';
  const list = S.nearby.slice(0, 6);
  const osmState = S.osm === undefined ? '<p class="small muted"><span class="spin"></span>Buscando más teléfonos en OpenStreetMap…</p>' : S.osm === null ? '<p class="small muted">OpenStreetMap no responde ahora: solo muestro los contactos oficiales de ENAIRE.</p>' : '';
  const card = a => {
    const phones = [...a.contacts.phones, ...(a.osm?.phone ? a.osm.phone.split(/[;,]/).map(x => x.trim()) : [])].filter(Boolean).filter(uniq);
    const emails = [...a.contacts.emails, ...(a.osm?.email ? [a.osm.email] : [])].filter(uniq);
    const web = a.osm?.web || a.contacts.urls.find(u => !/aip\.enaire|boe\.es/.test(u));
    const where = a.dist === 0 ? '<span class="tag red">Estás dentro de su zona</span>' : `<span class="tag">a ${fmtDist(a.dist)}</span>`;
    return `<div class="card"><h3>${a.heli ? '🚁' : '✈️'} ${esc(a.title)} ${a.icao ? `<span class="muted small">${esc(a.icao)}</span>` : ''}</h3>
      <div class="tags">${where}<span class="tag">${a.heli ? 'Helipuerto' : 'Aeropuerto / aeródromo'}</span></div>
      <div class="actions">${phones.map(p => `<a class="btn call" href="${telHref(p)}">📞 ${esc(p)}</a>`).join('')}${emails.map(e => `<a class="btn" href="mailto:${esc(e)}">✉️ ${esc(e)}</a>`).join('')}${web ? `<a class="btn sec" target="_blank" rel="noopener" href="${esc(web)}">🌐 Web</a>` : ''}
      ${!phones.length ? `<a class="btn sec" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent('teléfono ' + a.title)}">🔎 Buscar teléfono</a>` : ''}</div>
      ${!phones.length && !emails.length ? '<p class="small muted">ENAIRE no publica contacto directo de este aeródromo.</p>' : ''}</div>`;
  };
  const others = S.osm && S.others ? S.others : [];
  return `${list.length ? list.map(card).join('') : '<div class="card small muted">ENAIRE no lista aeródromos a menos de 25 km de este punto.</div>'}
    ${others.length ? `<details><summary>Otros aeródromos y helipuertos cercanos (OpenStreetMap)</summary>${others.map(o => `<div class="card"><h3>${o.heli ? '🚁' : '✈️'} ${esc(o.title)}</h3><div class="tags"><span class="tag">a ${fmtDist(o.dist)} al ${o.dir}</span></div>
      <div class="actions">${o.phone ? `<a class="btn call" href="${telHref(o.phone.split(/[;,]/)[0])}">📞 ${esc(o.phone.split(/[;,]/)[0])}</a>` : ''}${o.email ? `<a class="btn" href="mailto:${esc(o.email)}">✉️ Email</a>` : ''}${o.web ? `<a class="btn sec" target="_blank" rel="noopener" href="${esc(o.web)}">🌐 Web</a>` : ''}
      <a class="btn sec" target="_blank" rel="noopener" href="${gmaps(o.lat, o.lng)}">🗺️ Ver</a></div></div>`).join('')}</details>` : ''}${osmState}`;
}

function wxHtml() {
  const w = wxAssess();
  if (!S.wx) return '<div class="card small muted">No he podido obtener la previsión del tiempo.</div>';
  if (!w || w.none) return '<div class="card small muted">Sin previsión para esa fecha (el tiempo llega a unos 10 días vista).</div>';
  const cls = w.level === 'stop' ? 'stop' : w.level === 'warn' ? 'warn' : 'ok';
  return `<div class="card ${cls}"><h3>${w.level === 'ok' ? '🌤️ Tiempo apto para volar' : w.level === 'warn' ? '🌥️ Tiempo dudoso' : '🌧️ Tiempo NO recomendable'}</h3>
    <div class="tags"><span class="tag">💨 viento ${w.wind.toFixed(0)} m/s (rachas ${w.gust.toFixed(0)})</span>${w.wind80 != null ? `<span class="tag">a ~80 m: ${w.wind80.toFixed(0)} m/s</span>` : ''}<span class="tag">🌡️ ${w.temp.toFixed(0)} °C</span><span class="tag">🌧️ ${w.rain} mm</span>${w.vis != null ? `<span class="tag">👁️ ${(w.vis / 1000).toFixed(1)} km</span>` : ''}</div>
    ${w.notes.length ? `<ul>${w.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="small muted" style="margin:4px 0">Sin avisos para esa hora.</p>'}
    <p class="small muted" style="margin:0">Límite de viento de tu dron: ${w.maxW} m/s (cámbialo en Mi perfil). Fuente: Open-Meteo.</p></div>`;
}

const PRE_FLIGHT = [
  ['notam', 'He mirado los avisos del día (NOTAM) y las zonas activas en ENAIRE'], ['perm', 'Tengo por escrito los permisos que hacían falta'],
  ['bat', 'Batería del dron y del mando cargadas, GPS fijado'], ['op', 'Mi número de operador va visible en el dron'],
  ['docs', 'Llevo a mano carné, registro y seguro (Mi perfil → Cartera)'], ['area', 'La zona de despegue está despejada y no sobrevolaré personas ajenas'],
];
function checkHtml() {
  const day = ymd(new Date()); if (DB.checks.day !== day) { DB.checks = { day }; }
  return `<div class="card"><h3>🧾 Antes de despegar</h3>${PRE_FLIGHT.map(([k, t]) => `<label class="chk"><input type="checkbox" data-chk="${k}" ${DB.checks[k] ? 'checked' : ''}><span>${esc(t)}${k === 'notam' ? ` — <a target="_blank" rel="noopener" href="${ENLACES.enaireDrones}">ENAIRE Drones</a>` : ''}</span></label>`).join('')}</div>`;
}

/* Resumen claro: qué se puede hacer aquí y bajo qué condiciones, todo en una lista de ✅ ⚠️ ❌ */
function summaryHtml(ev, v) {
  const { R, items } = profileChecks(), P = DB.profile, rows = [], w = wxAssess();
  const go = (ico, t) => rows.push(`<div class="chk"><span>${ico}</span><span>${t}</span></div>`);
  if (ev.rank >= 3) go('⛔', '<b>Vuelo prohibido</b> a esta altura en este punto.');
  else if (ev.rank === 2) go('🛂', `<b>A ${S.height} m necesitas permiso.</b> ${ev.freeUpTo >= 10 ? `Sin permiso solo puedes volar <b>hasta ${ev.freeUpTo} m</b>.` : 'No hay altura libre aquí.'}`);
  else if (ev.rank === 1) go('⚠️', '<b>Puedes volar con condiciones</b> (avisar o comprobar con el titular).');
  else if (ev.urbanPending) go('🏘️', '<b>Falta un dato:</b> dime si estás dentro de un pueblo o ciudad (arriba).');
  else go('✅', `<b>Sin zonas de ENAIRE a ${S.height} m.</b> Puedes volar siguiendo las normas generales.`);
  ev.groups.forEach(g => { const d = duracionISO(g.interval); go(g.rank >= 2 ? '📨' : '📣', `<b>${esc(g.name)}</b>: ${g.rank >= 2 ? 'pedir autorización' : 'avisar / revisar condiciones'}${d ? ` con ${esc(d)} de antelación` : ''}.`); });
  if (S.urban === 'si') go('🏘️', 'Estás en <b>casco urbano</b>: hace falta autorización (ver AESA).');
  if (R) {
    go('📏', `Máximo <b>120 m</b>, siempre a la vista. ${esc(R.subTxt)}.`);
    items.filter(([ok]) => !ok).forEach(([, t]) => go('❌', t));
  } else go('👤', 'Configura tu dron en <b>Mi perfil</b> para saber qué carné y registro necesitas.');
  if (w && !w.none) go(w.level === 'ok' ? '🌤️' : w.level === 'warn' ? '🌥️' : '🌧️', w.level === 'ok' ? 'El tiempo acompaña a esa hora.' : esc(w.notes.join('. ') + '.'));
  return `<div class="card ${v.cls === 'v-ok' ? 'ok' : v.cls === 'v-stop' ? 'stop' : 'warn'}"><h3>📋 En resumen</h3>${rows.join('')}</div>`;
}
/* Corte vertical: qué zona afecta a qué altura (0–150 m) y dónde está tu vuelo */
function profileSvg(ev) {
  const zs = ev.zones.filter(z => z.valid && z.rank >= 1 && z.layer !== 'urbano' && z.loA != null).slice(0, 6);
  if (!zs.length) return '';
  const H = 150, top = 14, bot = 150, x0 = 38, W = 320, ch = bot - top, y = m => bot - Math.min(m, H) / H * ch, cw = (W - x0 - 4) / zs.length;
  const grid = [0, 30, 60, 90, 120, 150].map(m => `<line x1="${x0}" x2="${W}" y1="${y(m)}" y2="${y(m)}" stroke="currentColor" opacity=".15"/><text x="${x0 - 4}" y="${y(m) + 3}" font-size="9" text-anchor="end" fill="currentColor" opacity=".7">${m}</text>`).join('');
  const bars = zs.map((z, i) => { const lo = Math.max(0, z.loA), up = Math.min(H, z.upA ?? H), col = ZCOL[z.p.type] || '#888', bx = x0 + i * cw + 4; return `<rect x="${bx}" y="${y(up)}" width="${cw - 8}" height="${Math.max(2, y(lo) - y(up))}" rx="3" fill="${col}" opacity=".85"><title>${esc(z.title)}: ${esc(vertTxt(z))}</title></rect><text x="${bx + (cw - 8) / 2}" y="${bot + 11}" font-size="8" text-anchor="middle" fill="currentColor">${esc(z.title.replace(/^(MADRID|BARCELONA)\//i, '').slice(0, 11))}</text>`; }).join('');
  return `<div class="card"><h3>📐 A qué altura afecta cada zona</h3>
    <svg viewBox="0 0 ${W} 172" width="100%" role="img" aria-label="Corte vertical de zonas">${grid}<rect x="${x0}" y="${y(120)}" width="${W - x0}" height="${y(0) - y(120)}" fill="#2fbf5b" opacity=".07"/>${bars}
      <line x1="${x0}" x2="${W}" y1="${y(S.height)}" y2="${y(S.height)}" stroke="#0b3d91" stroke-width="2" stroke-dasharray="5 3"/><text x="${W - 2}" y="${y(S.height) - 3}" font-size="9" text-anchor="end" font-weight="700" fill="#0b3d91">tu vuelo: ${S.height} m</text></svg>
    <p class="small muted" style="margin:0">Metros sobre el suelo. Las barras de color son zonas; el hueco verde claro es altura libre.</p></div>`;
}
function spotsHtml() {
  if (S.spotsBusy) return '<div class="card"><span class="spin"></span>Buscando sitios libres cerca de ti…</div>';
  if (S.spots === null) return `<div class="card"><h3>🟢 ¿Dónde sí puedo volar cerca?</h3><p class="muted" style="margin:0 0 8px">Busco los sitios más cercanos en un radio de 5 km donde ENAIRE no marca ninguna zona a ${S.height} m.</p><button class="btn block" data-act="recommend">🔎 Buscar sitios libres cerca</button></div>`;
  if (!S.spots.length) return `<div class="card warn"><h3>🟢 Sitios libres</h3><p style="margin:0">${S.spotsErr ? 'No he podido consultar ENAIRE ahora. Inténtalo otra vez.' : `No he encontrado sitios libres a ${S.height} m en ${S.spotsR ? S.spotsR / 1000 : 5} km. Prueba con otra altura (más baja) o desplázate a otra zona.`}</p><div class="actions"><button class="btn sec" data-act="recommend">Reintentar</button></div></div>`;
  return `<div class="card ok"><h3>🟢 Sitios libres cerca (a ${S.height} m, en ${S.spotsR / 1000} km)</h3>${S.spots.map((s, i) => `<div class="copyrow"><div><div class="v">${i + 1} · a ${fmtDist(s.dist)} al ${s.dir}</div><div class="k">${coordTxt(s.lat, s.lng)}</div></div><div class="actions" style="margin:0"><button class="btn sm" data-act="spot" data-i="${i}">Comprobar</button><a class="btn sec sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}">🧭 Ir</a></div></div>`).join('')}
    <p class="small muted" style="margin:8px 0 0">Libre = sin zonas de ENAIRE con margen. Puede ser casco urbano, propiedad privada o tener otras limitaciones: pulsa «Comprobar» y revisa el mapa en satélite.</p></div>`;
}

function idleHtml() {
  const { R, items } = profileChecks();
  return novHtml() + `<div class="verdict v-idle"><div class="big">🛩️</div><div><h2>¿Dónde quieres volar?</h2><p>Toca el mapa, busca un sitio o usa tu ubicación. Te digo en 5 segundos si puedes volar y qué permisos pedir.</p></div></div>
    <div class="actions"><button class="btn block" data-act="locate">📍 Estoy aquí: comprobar mi ubicación</button></div>
    ${R ? `<div class="card" style="margin-top:12px"><h3>👤 Tu perfil</h3>${items.map(([ok, t]) => `<div class="chk"><span>${ok ? '✅' : '❌'}</span><span>${t}</span></div>`).join('')}</div>`
      : `<div class="card" style="margin-top:12px"><h3>👤 Configura tu dron y tus datos</h3><p class="muted" style="margin:0 0 8px">Con eso te digo qué carné necesitas y relleno las solicitudes por ti.</p><button class="btn" data-act="nav" data-v="profile">Configurar (1 minuto)</button></div>`}
    <p class="small muted">Datos oficiales de zonas UAS: <b>ENAIRE</b>. Orientativo: la fuente oficial manda.</p>`;
}

function renderSheet() {
  const el = $('#sheetBody'), sc = el.scrollTop;
  if (!S.point) { el.innerHTML = idleHtml(); return; }
  const ev = S.ev = evaluate(), v = verdictOf(ev), { R, items } = profileChecks();
  const ctl = `<div class="card"><div class="small muted">📍 ${esc(S.label || 'Punto elegido')}</div>
    <div class="small muted">${coordTxt(S.point.lat, S.point.lng)}${S.elev != null ? ` · terreno a ${Math.round(S.elev)} m` : ''}</div>
    <div class="form" style="margin-top:8px">
      <label class="f full">Altura a la que vas a volar: <b id="hLbl">${S.height} m</b><input type="range" min="10" max="150" step="5" value="${S.height}" data-ctl="height"></label>
      <label class="f">Radio de la zona de vuelo<select data-ctl="radius">${[[0, 'Solo el punto'], [50, '50 m'], [100, '100 m'], [250, '250 m'], [500, '500 m'], [1000, '1 km']].map(([m, t]) => `<option value="${m}" ${S.radius === m ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Fecha y hora<input type="datetime-local" value="${toInputDT(S.when)}" data-ctl="when"></label>
      <label class="f full ${S.urban === 'auto' && S.ev?.urbanPending ? 'need' : ''}">¿Estás dentro de un pueblo o ciudad (casco urbano)?<select data-ctl="urban">${[['auto', 'No lo he comprobado'], ['no', 'No, estoy en campo abierto'], ['si', 'Sí, en casco urbano']].map(([v, t]) => `<option value="${v}" ${S.urban === v ? 'selected' : ''}>${t}</option>`).join('')}</select>${S.urbanHint ? `<span class="small">💡 ${esc(S.urbanHint)}</span>` : ''}</label>
    </div></div>`;
  if (S.loading) { el.innerHTML = ctl + '<div class="card"><span class="spin"></span>Consultando ENAIRE, el terreno y el tiempo…</div>'; return; }
  let h = novHtml() + ctl +`<div class="verdict ${v.cls}"><div class="big">${v.ico}</div><div><h2>${v.t}</h2><p>${v.d}</p></div></div>`;
  if (S.failed.length) h += `<div class="actions" style="margin:-4px 0 10px"><button class="btn danger" data-act="retry">🔄 Reintentar consulta</button></div>`;
  if (ev && ev.ignored) h += `<p class="small muted" style="margin:-4px 0 10px">${ev.ignored} zona(s) cercana(s) no te afectan a ${S.height} m (están por encima o fuera de fecha).</p>`;

  if (ev) h += summaryHtml(ev, v) + profileSvg(ev);
  h += `<h2 style="margin:6px 0 8px">Paso 1 · ${DB.drones.length > 1 ? 'Qué puedes hacer con cada uno de tus drones' : 'Tú y tu dron'}</h2>`;
  if (DB.drones.length > 1) h += dronesHtml(ev) + '<div class="actions" style="margin:0 0 6px"><button class="btn sec sm" data-act="nav" data-v="profile">Editar mis drones y mi perfil</button></div>';
  else h += R ? `<div class="card">${items.map(([ok, t]) => `<div class="chk"><span>${ok ? '✅' : '❌'}</span><span>${t}</span></div>`).join('')}
        <details><summary>Reglas de tu categoría</summary><ul class="small"><li>${esc(R.registroTxt)}</li><li>${esc(R.seguroTxt)}</li><li>${esc(R.edadTxt)}</li>${R.limites.map(l => `<li>${esc(l)}</li>`).join('')}</ul></details>
        <button class="btn sec sm" data-act="nav" data-v="profile">Editar mi perfil</button></div>`
    : `<div class="card"><p style="margin:0 0 8px">Dime qué dron tienes y quién eres y te digo qué carné y registro necesitas.</p><button class="btn" data-act="nav" data-v="profile">Configurar mi perfil</button></div>`;

  h += '<h2 style="margin:14px 0 8px">Paso 2 · Permisos</h2>';
  if (ev && ev.groups.length) {
    h += `<p class="muted" style="margin:0 0 8px">Esto es lo que tienes que pedir, a quién y con qué antelación:</p>` + ev.groups.map(groupCard).join('');
    if (ev.groups.length > 1) h += `<button class="btn block" data-act="prepall">📝 Preparar TODAS las solicitudes (${ev.groups.length})</button>`;
  } else if (ev) h += '<div class="card ok"><h3>✅ No tienes que pedir permiso a nadie aquí</h3><p class="muted" style="margin:0">Ninguna zona de ENAIRE te afecta a esa altura. Cumple las normas generales de abajo.</p></div>';

  h += '<h2 style="margin:14px 0 8px">Paso 3 · Tiempo</h2>' + wxHtml();
  h += '<h2 style="margin:14px 0 8px">Paso 4 · Dónde sí puedes volar</h2>' + spotsHtml();
  h += '<h2 style="margin:14px 0 8px">Paso 5 · Aeropuertos y helipuertos cerca (con teléfono)</h2>' + nearbyHtml();
  h += '<h2 style="margin:14px 0 8px">Paso 6 · Antes de despegar</h2>' + checkHtml();

  if (ev && ev.active.length) h += `<details style="margin-top:12px"><summary>Ver todas las zonas que te afectan (${ev.active.length})</summary>${ev.active.map(z => `<div class="card"><h3>${esc(z.title)}</h3><div class="tags"><span class="tag ${z.rank >= 2 ? 'red' : 'amber'}">${({ REQ_AUTHORIZATION: 'Requiere autorización', CONDITIONAL: 'Condicionada', PROHIBITED: 'Prohibido' })[z.type] || esc(z.type)}</span><span class="tag">${LAYERS[z.layer].label}</span>${z.schedule ? '<span class="tag amber">Con horario o vigencia especial</span>' : ''}</div><p class="small muted" style="margin:4px 0">${esc(vertTxt(z))}</p></div>`).join('')}</details>`;
  h += `<details style="margin-top:8px"><summary>Normas que SIEMPRE aplican</summary><ul class="small"><li>Máximo 120 m sobre el suelo.</li><li>Siempre a la vista, de día y con buena visibilidad.</li><li>No sobrevolar multitudes, ni vuelo sobre personas ajenas sin cumplir tu subcategoría.</li><li>Respeta la privacidad: no grabes a personas identificables sin motivo.</li><li>Una zona libre en el mapa no te exime de cumplir la normativa. Consulta la <a target="_blank" rel="noopener" href="${ENLACES.aesa}">web de AESA</a>.</li></ul></details>
    <p class="small muted">Zonas UAS: ENAIRE (se actualizan cada 28 días, ciclo AIRAC). Esta app es orientativa; manda siempre la información oficial.</p>`;
  el.innerHTML = h; el.scrollTop = sc;
}

/* ========================= SOLICITUDES ========================= */
function reqFor(g) {
  const same = DB.requests.find(r => r.groupKey === g.key && r.status === 'borrador' && Math.abs(r.place.lat - S.point.lat) < 1e-4 && Math.abs(r.place.lng - S.point.lng) < 1e-4);
  const flight = { date: ymd(S.when), from: hm(S.when), to: hm(new Date(S.when.getTime() + 36e5)), height: S.height, radius: Math.max(S.radius, 50) };
  if (same) { Object.assign(same.flight, flight); same.group = snapshot(g); dbSave(); return same; }
  const r = { id: uid(), created: Date.now(), status: 'borrador', groupKey: g.key, group: snapshot(g), place: { lat: S.point.lat, lng: S.point.lng, label: S.label },
    flight: { ...flight, purpose: DB.profile.defaultPurpose || FINALIDADES[0], desc: '', observers: 0, vlos: true } };
  DB.requests.unshift(r); dbSave(); updateBadge(); return r;
}
const snapshot = g => ({ key: g.key, name: g.name, kind: g.kind, emails: g.emails, phones: g.phones, urls: g.urls, interval: g.interval, zones: g.zones.map(z => ({ title: z.title, vert: vertTxt(z), purpose: z.purpose })) });
const groupByKey = k => S.ev?.groups.find(g => g.key === k);

function reqFields(r) {
  const dr = droneFor(r), P = profWith(dr), R = dr ? reglasDron(dr) : null, f = r.flight, p = r.place;
  return [
    ['Solicitante', [['Nombre y apellidos', P.fullName], ['DNI / NIE', P.idDoc], ['Empresa (si procede)', P.company], ['Teléfono de contacto', P.phone], ['Email', P.email]]],
    ['Operador y piloto', [['Nº de operador AESA', P.operatorId], ['Certificado de piloto', P.pilotCert && P.pilotCert !== 'none' ? `${certLabel(P.pilotCert)}${P.pilotCertId ? ' · nº ' + P.pilotCertId : ''}` : 'Sin indicar']]],
    ['Aeronave (UAS)', [['Modelo', P.droneName], ['Peso máximo (MTOM)', P.droneG ? `${P.droneG} g` : ''], ['Clase / etiqueta', P.droneClass || 'Sin etiqueta de clase'], ['Nº de serie', P.droneSerial], ['Categoría de operación', R ? R.subTxt : 'Categoría abierta']]],
    ['Seguro de responsabilidad civil', [['Aseguradora', P.insurer], ['Nº de póliza', P.policy], ['Vigencia hasta', P.insExpiry ? fmtDate(P.insExpiry) : '']]],
    ['Operación', [['Finalidad', f.purpose], ['Descripción', f.desc || `Vuelo ${f.purpose.toLowerCase()} con ${P.droneName || 'dron'}, en VLOS, siguiendo las condiciones de la zona.`], ['Fecha', fmtDate(f.date)], ['Horario (hora local)', `${f.from} – ${f.to}`], ['Altura máxima sobre el suelo', `${f.height} m`], ['Radio de la zona de operación', `${f.radius} m`], ['Línea de vista (VLOS)', f.vlos ? 'Sí, siempre a la vista' : 'No'], ['Observadores', String(f.observers || 0)]]],
    ['Ubicación', [['Lugar', p.label || 'Punto elegido en el mapa'], ['Coordenadas (WGS84)', coordTxt(p.lat, p.lng)], ['Coordenadas (grados)', `${dms(p.lat, 'N', 'S')} ${dms(p.lng, 'E', 'O')}`], ['Mapa', gmaps(p.lat, p.lng)], ['Zona(s) afectada(s)', r.group.zones.map(z => z.title).filter(uniq).join('; ')]]],
  ].map(([t, rows]) => [t, rows.filter(([, v]) => v !== '' && v != null)]).filter(([, rows]) => rows.length);
}
const droneFor = r => DB.drones.find(d => d.id === r?.droneId) || activeDrone();
/* Documentos que de verdad hacen falta (el seguro solo si es obligatorio para ese dron o si ya tienes uno) */
function docsNeeded(r) {
  const dr = droneFor(r), R = dr ? reglasDron(dr) : null, P = profWith(dr), out = [];
  if (!R || R.registro) out.push(['registro', 'Registro de operador AESA']);
  if (!R || R.cert) out.push(['carnet', 'Certificado de piloto']);
  if (!R || R.seguro || P.policy) out.push(['seguro', 'Póliza y recibo del seguro']);
  return out;
}
function missingFields(r) {
  const dr = droneFor(r), P = profWith(dr), R = dr ? reglasDron(dr) : null, m = [];
  if (!P.fullName) m.push('tu nombre'); if (!P.phone) m.push('tu teléfono'); if (!P.email) m.push('tu email');
  if (!dr) m.push('tu dron'); if (R?.registro && !P.operatorId) m.push('nº de operador AESA');
  if (R && !certCubre(P.pilotCert, R)) m.push('tu carné de piloto'); if (R?.seguro && !P.policy) m.push('tu seguro (obligatorio en A2)');
  return m;
}
function buildEmail(r) {
  const P = DB.profile, g = r.group, f = r.flight, zonas = g.zones.map(z => z.title).filter(uniq).join('; ');
  const tipo = g.kind === 'cecaf' ? 'los condicionantes técnicos' : g.kind === 'adif' ? 'la autorización/notificación' : 'la coordinación';
  const subject = `Solicitud de ${tipo} para operación UAS – ${zonas.slice(0, 70)} – ${fmtDate(f.date)}`;
  const sect = reqFields(r).map(([t, rows]) => `${t.toUpperCase()}\n${rows.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`).join('\n\n');
  const body = `Buenos días:\n\nMe dirijo a ustedes para solicitar ${tipo} de una operación con aeronave no tripulada (UAS) en ${r.place.label || 'la ubicación indicada'}, dentro de la zona geográfica: ${zonas}.\n\nLos datos de la operación son los siguientes:\n\n${sect}\n\nAdjunto la documentación necesaria (${docsNeeded(r).map(([, t]) => t.toLowerCase()).join(', ')} y croquis de la zona). Quedo a su disposición para cualquier aclaración o para ajustar las condiciones de la operación.\n\nUn saludo,\n${P.fullName || '[Tu nombre]'}\n${P.phone ? 'Tel. ' + P.phone : ''}`;
  return { subject, body };
}
const MAILTO_MAX = 1900; // muchos clientes de correo recortan los enlaces mailto más largos
function mailtoHref(r) {
  const to = `mailto:${r.group.emails.join(',')}?subject=`, { subject, body } = buildEmail(r);
  const mk = b => `${to}${encodeURIComponent(subject)}&body=${encodeURIComponent(b)}`;
  let href = mk(body); if (href.length <= MAILTO_MAX) return href;
  const skip = new Set(['Coordenadas (grados)', 'Clase / etiqueta', 'Nº de serie', 'Categoría de operación', 'DNI / NIE', 'Empresa (si procede)', 'Vigencia hasta', 'Observadores']);
  const compact = `Buenos días:\n\nSolicito la coordinación de una operación UAS en ${r.place.label || 'la ubicación indicada'} (${r.group.zones.map(z => z.title).filter(uniq).join('; ')}).\n\n` +
    reqFields(r).flatMap(([, rows]) => rows).filter(([k]) => !skip.has(k)).map(([k, v]) => `${k}: ${v}`).join('\n') +
    `\n\nAdjunto ${docsNeeded(r).map(([, t]) => t.toLowerCase()).join(', ')} y croquis. Un saludo,\n${DB.profile.fullName || ''}`;
  href = mk(compact); if (href.length <= MAILTO_MAX) return href;
  return mk(compact.slice(0, 700) + '\n[…] Ficha completa en el PDF adjunto.\n' + (DB.profile.fullName || ''));
}
function sheetText(r) { return reqFields(r).map(([t, rows]) => `${t.toUpperCase()}\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`).join('\n\n'); }

function printRequest(r) {
  // El visor de la app Android no puede imprimir/guardar PDF: se comparte la ficha como texto.
  if (window.Capacitor?.isNativePlatform?.()) {
    const t = buildEmail(r);
    if (navigator.share) navigator.share({ title: t.subject, text: sheetText(r) }).catch(() => { }); else copyText(sheetText(r));
    return toast('En la app Android la ficha se comparte como texto. Para PDF usa la web en el navegador.');
  }
  const P = DB.profile, f = r.flight;
  $('#printDoc').innerHTML = `<h1>Solicitud de ${r.group.kind === 'adif' ? 'autorización' : 'coordinación'} de operación con aeronave no tripulada (UAS)</h1>
    <p>Dirigida a: <b>${esc(r.group.name)}</b>${r.group.emails.length ? ' · ' + esc(r.group.emails.join(', ')) : ''}<br>Fecha de la solicitud: ${new Date().toLocaleDateString('es-ES')} · Fecha prevista del vuelo: ${fmtDate(f.date)}</p>
    ${reqFields(r).map(([t, rows]) => `<h2>${esc(t)}</h2><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`).join('')}
    <h2>Documentación que se adjunta</h2><p>${[...docsNeeded(r).map(([, t]) => t), 'Croquis / mapa de la zona'].map(t => '☐ ' + esc(t)).join(' &nbsp; ')}</p>
    <p style="margin-top:28pt">Firma: ____________________________ &nbsp; ${esc(P.fullName || '')}</p>`;
  setTimeout(() => window.print(), 80);
}

function openReq(id) { PV.id = id; setView('permits'); }
function setStatus(r, s) { r.status = s; if (s === 'enviada' && !r.sent) r.sent = Date.now(); dbSave(); updateBadge(); }
const STATUS = { borrador: ['📝 Borrador', 'amber'], enviada: ['📤 Enviada, esperando respuesta', 'amber'], aprobada: ['✅ Aprobada', 'green'], denegada: ['❌ Denegada', 'red'] };

const PV = { id: null };
function renderPermits() {
  const el = $('#permitsBody'), r = DB.requests.find(x => x.id === PV.id);
  if (r) return renderReq(el, r);
  const lst = DB.requests;
  el.innerHTML = `<h1>📝 Mis permisos</h1><p class="lead">Aquí quedan todas tus solicitudes, con su estado. Empieza en el mapa: elige un lugar y pulsa «Preparar solicitud».</p>
    ${!lst.length ? '<div class="empty"><div class="big">📭</div><p>Todavía no has preparado ninguna solicitud.</p><button class="btn" data-act="nav" data-v="map">Ir al mapa</button></div>' :
      lst.map(q => { const [t, c] = STATUS[q.status]; return `<div class="card"><h3>${KIND_ICON[q.group.kind] || '📨'} ${esc(q.group.name)}</h3><div class="tags"><span class="tag ${c}">${t}</span><span class="tag">📅 ${fmtDate(q.flight.date)}</span><span class="tag">📍 ${esc((q.place.label || coordTxt(q.place.lat, q.place.lng)).slice(0, 40))}</span></div><div class="actions"><button class="btn" data-act="openreq" data-id="${q.id}">Abrir</button><button class="btn sec" data-act="delreq" data-id="${q.id}">Borrar</button></div></div>`; }).join('')}`;
}
function renderReq(el, r) {
  const miss = missingFields(r), g = r.group, f = r.flight, em = g.emails.length, [stT, stC] = STATUS[r.status];
  const field = (path, label, type = 'text', extra = '') => `<label class="f ${extra}"><span>${label}</span><input type="${type}" data-rb="${path}" value="${esc(getPath(r, path) ?? '')}"></label>`;
  const days = duracionDias(g.interval), deadline = days ? new Date(new Date(f.date + 'T' + f.from).getTime() - days * 864e5) : null;
  el.innerHTML = `<button class="btn sec sm" data-act="backreqs">← Mis permisos</button>
    <h1 style="margin-top:10px">${KIND_ICON[g.kind] || '📨'} ${esc(g.name)}</h1>
    <div class="tags"><span class="tag ${stC}">${stT}</span>${g.zones.map(z => z.title).filter(uniq).map(t => `<span class="tag red">${esc(t)}</span>`).join('')}</div>
    ${deadline ? `<div class="card ${deadline < new Date() ? 'stop' : 'warn'}"><b>⏱ Plazo:</b> debes enviarlo antes del <b>${deadline.toLocaleDateString('es-ES')}</b> (${esc(duracionISO(g.interval))} antes del vuelo).</div>` : ''}
    ${miss.length ? `<div class="card stop"><b>Te faltan datos en tu perfil:</b> ${miss.join(', ')}.<div class="actions"><button class="btn" data-act="nav" data-v="profile">Completar mi perfil</button></div></div>` : '<div class="card ok">✅ Tu perfil está completo: la solicitud sale con todos tus datos.</div>'}

    <h2>1 · Datos del vuelo</h2>
    <div class="form">${field('flight.date', 'Fecha', 'date')}${field('flight.height', 'Altura máx. (m)', 'number')}${field('flight.from', 'Desde (hora local)', 'time')}${field('flight.to', 'Hasta (hora local)', 'time')}${field('flight.radius', 'Radio de la operación (m)', 'number')}${field('flight.observers', 'Observadores', 'number')}
      ${DB.drones.length ? `<label class="f full"><span>Dron para este vuelo</span><select data-rb="droneId">${DB.drones.map(d => `<option value="${d.id}" ${droneFor(r)?.id === d.id ? 'selected' : ''}>${esc(d.droneName || 'Dron')} · ${d.droneG || '?'} g</option>`).join('')}</select></label>` : ''}
      <label class="f full"><span>Finalidad</span><select data-rb="flight.purpose">${FINALIDADES.map(x => `<option ${x === f.purpose ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="f full"><span>Descripción de lo que vas a hacer (opcional: si lo dejas vacío pongo una frase estándar)</span><textarea data-rb="flight.desc">${esc(f.desc)}</textarea></label></div>

    <h2>2 · Envíalo</h2>
    <div class="actions">
      ${g.phones.map(p => `<a class="btn call" href="${telHref(p)}">📞 Llamar ${esc(p)}</a>`).join('')}
      ${em ? `<a class="btn" href="${esc(mailtoHref(r))}" data-act="sent">✉️ Abrir email ya redactado</a>` : ''}
      ${g.kind === 'planea' ? `<a class="btn" target="_blank" rel="noopener" href="${ENLACES.planea}">🛰️ Abrir ENAIRE Planea</a>` : g.urls[0] ? `<a class="btn sec" target="_blank" rel="noopener" href="${esc(g.urls[0])}">🌐 ${esc(hostOf(g.urls[0]))}</a>` : ''}
    </div>
    ${g.kind === 'planea' ? '<p class="small muted">En Planea no se puede rellenar automáticamente desde fuera: entra con tu cuenta y copia cada dato con su botón.</p>' : ''}
    ${em ? `<details><summary>Ver el email que se enviará</summary><p class="small"><b>Para:</b> ${esc(g.emails.join(', '))}<br><b>Asunto:</b> ${esc(buildEmail(r).subject)}</p><pre class="mail">${esc(buildEmail(r).body)}</pre><div class="actions"><button class="btn sec" data-act="copy" data-t="${esc(buildEmail(r).body)}">Copiar texto</button></div></details>` : ''}
    <div class="actions"><button class="btn sec" data-act="print" data-id="${r.id}">📄 Descargar / imprimir PDF</button><button class="btn sec" data-act="share" data-id="${r.id}">📤 Compartir</button><button class="btn sec" data-act="copyall" data-id="${r.id}">📋 Copiar ficha completa</button></div>

    <h2>3 · Ficha para copiar y pegar</h2>
    <div class="card">${reqFields(r).map(([t, rows]) => `<div class="small muted" style="margin-top:8px"><b>${esc(t)}</b></div>${rows.map(([k, v]) => `<div class="copyrow"><div><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div><button class="btn sec sm" data-act="copy" data-t="${esc(v)}">Copiar</button></div>`).join('')}`).join('')}</div>

    <h2>4 · Documentos que debes adjuntar</h2>
    <div class="card">${[...docsNeeded(r), ['croquis', 'Croquis de la zona (el PDF ya lleva el mapa)']].map(([k, t]) => { const d = DB.docs.find(x => x.type === k); return `<div class="chk"><span>${d ? '✅' : '⬜'}</span><span>${t} ${d ? `<button class="btn sec sm" data-act="docview" data-id="${d.id}">Ver foto</button>` : k !== 'croquis' ? '<span class="muted small">— súbela en Mi perfil → Cartera</span>' : ''}</span></div>`; }).join('')}
      <p class="small muted" style="margin:6px 0 0">Si despegas desde terreno privado o espacio público acotado, añade el permiso del propietario o del ayuntamiento.</p></div>

    <h2>5 · Seguimiento</h2>
    <label class="f"><span>Estado de esta solicitud</span><select data-rb="status">${Object.entries(STATUS).map(([k, [t]]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f" style="margin-top:8px"><span>Notas (nº de expediente, persona que te atendió…)</span><textarea data-rb="notes">${esc(r.notes || '')}</textarea></label>`;
}

/* ========================= PERFIL ========================= */
function pfield(k, label, type = 'text', ph = '', extra = '') { return `<label class="f ${extra}"><span>${label}</span><input type="${type}" data-pb="${k}" value="${esc(DB.profile[k] ?? '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`; }
const PF = { edit: null };
function profileScore() {
  const d = activeDrone(), P = profWith(d), R = d ? reglasDron(d) : null, need = [P.fullName, P.phone, P.email, d ? 1 : ''];
  if (R?.seguro) need.push(P.policy);
  if (R?.registro) need.push(P.operatorId); if (R) need.push(certCubre(P.pilotCert, R) ? 1 : '');
  return Math.round(need.filter(Boolean).length / need.length * 100);
}
/* Un dron: tarjeta con lo que exige y botones; si se está editando, el formulario */
function droneCard(d) {
  const R = reglasDron(d), act = activeDrone()?.id === d.id;
  if (PF.edit === d.id) {
    const sel = DRONES.find(x => x.id === d.droneModel)?.id || '';
    const f = (k, label, type = 'text', ph = '', extra = '') => `<label class="f ${extra}"><span>${label}</span><input type="${type}" data-dr="${k}" value="${esc(d[k] ?? '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
    return `<div class="card ok"><h3>✏️ ${esc(d.droneName || 'Nuevo dron')}</h3><div class="form">
      <label class="f full"><span>Modelo</span><select data-dm="1"><option value="">Elige el modelo…</option>${DRONES.map(x => `<option value="${x.id}" ${sel === x.id ? 'selected' : ''}>${x.name}${x.g ? ' · ' + x.g + ' g' : ''}</option>`).join('')}</select></label>
      ${f('droneName', 'Nombre del dron', 'text', 'p. ej. Mi Mini 3', 'full')}${f('droneG', 'Peso en gramos (mira la etiqueta)', 'number')}
      <label class="f"><span>Clase (etiqueta C0–C4)</span><select data-dr="droneClass">${CLASES.map(([v, t]) => `<option value="${v}" ${(d.droneClass || '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${f('droneSerial', 'Nº de serie')}${f('maxWind', 'Viento máx. que aguanta (m/s)', 'number', '10')}
      <label class="chk full"><input type="checkbox" data-drc="1" ${d.droneCamera !== false ? 'checked' : ''}><span>Lleva cámara u otro sensor</span></label></div>
      ${R ? `<div class="small"><div class="chk"><span>📋</span><span>${esc(R.registroTxt)}</span></div><div class="chk"><span>🎓</span><span>${esc(R.certTxt)}</span></div><div class="chk"><span>🛡️</span><span>${esc(R.seguroTxt)}</span></div><div class="chk"><span>🎂</span><span>${esc(R.edadTxt)}</span></div>${R.notas.map(n => `<div class="chk"><span>⚠️</span><span>${esc(n)}</span></div>`).join('')}</div>` : ''}
      <div class="actions"><button class="btn" data-act="dr-done">✔ Listo</button><button class="btn danger" data-act="dr-del" data-id="${d.id}">Borrar este dron</button></div></div>`;
  }
  return `<div class="card"><h3>🛩️ ${esc(d.droneName || 'Dron sin nombre')} ${act ? '<span class="tag green">activo</span>' : ''}</h3>
    <div class="tags"><span class="tag">${R ? R.sub : '?'} · ${d.droneG || '?'} g</span>${d.droneClass ? `<span class="tag">${d.droneClass}</span>` : ''}${R ? `<span class="tag ${R.registro ? 'amber' : 'green'}">${R.registro ? 'Registro necesario' : 'Sin registro'}</span><span class="tag ${R.seguro ? 'amber' : 'green'}">${R.seguro ? 'Seguro obligatorio' : 'Seguro no obligatorio'}</span>` : ''}</div>
    <div class="actions"><button class="btn sec sm" data-act="dr-edit" data-id="${d.id}">Editar</button>${act ? '' : `<button class="btn sec sm" data-act="dr-act" data-id="${d.id}">Usar por defecto</button>`}</div></div>`;
}
function renderProfile() {
  const P = DB.profile, sc = profileScore();
  $('#profileBody').innerHTML = `<h1>👤 Mi perfil</h1><p class="lead">Rellénalo una sola vez. Se guarda <b>solo en este móvil</b> y se usa para rellenar tus solicitudes y decirte qué te falta.</p>
    <div class="card"><div class="small">Perfil completo al <b>${sc}%</b></div><div class="meter"><i style="width:${sc}%;${sc < 100 ? 'background:var(--warn)' : ''}"></i></div></div>

    <h2>¿Quién eres?</h2><div class="form">${pfield('fullName', 'Nombre y apellidos', 'text', '', 'full')}${pfield('idDoc', 'DNI / NIE (opcional)')}${pfield('company', 'Empresa (opcional)')}${pfield('phone', 'Teléfono', 'tel', '+34 600 000 000')}${pfield('email', 'Email', 'email')}</div>

    <h2>Tu carné y tu registro</h2><div class="form">
      ${pfield('operatorId', 'Nº de operador AESA', 'text', 'ESP…', 'full')}
      <label class="f"><span>Carné de piloto</span><select data-pb="pilotCert">${[['', 'Elige…'], ['none', 'No tengo'], ['a1a3', 'A1/A3'], ['a2', 'A2'], ['sts', 'Categoría específica (STS)']].map(([v, t]) => `<option value="${v}" ${P.pilotCert === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${pfield('pilotCertId', 'Nº de certificado')}${pfield('certExpiry', 'Caduca (los certificados duran 5 años)', 'date', '', 'full')}</div>

    <h2>Tus drones</h2><p class="small muted" style="margin-top:0">Puedes tener varios: te digo qué puedes hacer con cada uno en cada sitio. Los pesos son orientativos; manda la etiqueta de tu dron. <a target="_blank" rel="noopener" href="${ENLACES.aesaAbierta}">Normas de AESA</a></p>
    ${DB.drones.map(droneCard).join('')}
    <div class="actions"><button class="btn" data-act="dr-add">➕ Añadir un dron</button></div>

    <h2>Tu seguro <span class="muted small">(opcional salvo en A2)</span></h2>
    <p class="small muted" style="margin-top:0">${DB.drones.some(d => reglasDron(d)?.seguro) ? 'Alguno de tus drones vuela en A2: ahí el seguro de responsabilidad civil es obligatorio (art. 8 RD 517/2024).' : 'En categoría abierta A1 y A3 (menos de 20 kg) el seguro no es obligatorio (art. 8 RD 517/2024). Rellénalo solo si tienes uno: es recomendable, y obligatorio en A2, categoría específica y certificada.'}</p>
    <div class="form">${pfield('insurer', 'Aseguradora', 'text', '', 'full')}${pfield('policy', 'Nº de póliza')}${pfield('insExpiry', 'Vigencia hasta', 'date')}</div>

    <h2>Cartera de documentos</h2><p class="small muted" style="margin-top:0">Fotos de tus documentos, siempre a mano y sin conexión por si te los pide la Guardia Civil o la Policía. Solo se guardan en este móvil.</p>
    <div class="docs">${DB.docs.map(d => `<div class="doc"><img src="${d.data}" alt="${esc(d.name)}" data-act="docview" data-id="${d.id}"><div><b>${esc(d.name)}</b><br><button class="btn sec sm" data-act="docdel" data-id="${d.id}">Borrar</button></div></div>`).join('')}</div>
    <div class="row" style="margin-top:10px"><select id="docType">${[['carnet', 'Certificado de piloto'], ['registro', 'Registro de operador'], ['seguro', 'Seguro'], ['dron', 'Etiqueta/ficha del dron'], ['otro', 'Otro']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select><label class="btn sec" style="margin:0">📷 Añadir foto<input id="docFile" type="file" accept="image/*" hidden></label></div>

    <h2>Datos</h2><div class="actions"><button class="btn sec" data-act="export">⬇️ Copia de seguridad</button><label class="btn sec" style="margin:0">⬆️ Restaurar<input id="importFile" type="file" accept="application/json" hidden></label><button class="btn danger" data-act="wipe">Borrar todo</button></div>`;
}
function resizeImage(file, max = 1100) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', .72)); };
    img.onerror = rej; img.src = u;
  });
}

/* ========================= NOTICIAS ========================= */
const NEWS_URL = 'news.json'; // el flujo del APK lo sustituye por la URL de la web publicada
const NEWS = { items: [], generated: '', filter: 'todo', loaded: false, loading: false };
const NORMA = /real decreto|resoluci[óo]n|reglamento|normativa|\bley\b|\bBOE\b|orden |sanci[óo]n|multa|obligatori|registro|autorizaci[óo]n|prohib/i;
async function liveBoe() {
  const kw = /aeronaves? no tripuladas?|\bdrones?\b|\bUAS\b|\bRPAS\b|pilotadas? por control remoto|Agencia Estatal de Seguridad A[ée]rea|navegaci[óo]n a[ée]rea|espacio a[ée]reo|aeron[áa]utic/i;
  const out = [], days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - i * 864e5); return [d, `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`]; }).filter(([d]) => d.getDay() !== 0); // el BOE no sale en domingo
  const res = await Promise.allSettled(days.map(([d, s]) => jfetch(`https://www.boe.es/datosabiertos/api/boe/sumario/${s}`, { timeout: 12000, headers: { Accept: 'application/json' } }).then(j => ({ d, j }))));
  const walk = function* (o) { if (Array.isArray(o)) for (const v of o) yield* walk(v); else if (o && typeof o === 'object') { if (o.titulo && o.identificador) yield o; for (const v of Object.values(o)) yield* walk(v); } };
  res.forEach(r => { if (r.status !== 'fulfilled') return; for (const it of walk(r.value.j.data.sumario)) if (it.identificador.startsWith('BOE-A-') && kw.test(it.titulo)) out.push({ title: it.titulo.replace(/\s+/g, ' ').trim(), url: it.url_html || `https://www.boe.es/buscar/doc.php?id=${it.identificador}`, source: 'BOE', date: `${ymd(r.value.d)}T07:00:00Z`, tag: 'normativa', id: it.identificador }); });
  return out;
}
async function loadNews(force) {
  if (NEWS.loading || (NEWS.loaded && !force)) return; NEWS.loading = true; renderNews();
  const [a, b] = await Promise.allSettled([jfetch(NEWS_URL + '?' + Date.now(), { timeout: 12000 }).catch(() => jfetch('news.json?' + Date.now(), { timeout: 8000 })), liveBoe()]);
  const items = [...(a.status === 'fulfilled' ? a.value.items : []), ...(b.status === 'fulfilled' ? b.value : [])];
  NEWS.generated = a.status === 'fulfilled' ? a.value.generated : '';
  const seen = new Set(); NEWS.items = items.sort((x, y) => y.date.localeCompare(x.date)).filter(i => { const k = (i.id || i.title).toLowerCase().replace(/\W+/g, '').slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
  NEWS.loaded = true; NEWS.loading = false; NEWS.err = a.status !== 'fulfilled' && b.status !== 'fulfilled'; renderNews(); updateBadge();
}
const unseenNews = () => NEWS.items.filter(i => i.date > (DB.seenNews || '')).length;
function ago(iso) { const d = (Date.now() - new Date(iso)) / 864e5; return d < 1 ? 'hoy' : d < 2 ? 'ayer' : d < 8 ? `hace ${Math.floor(d)} días` : new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); }
function renderNews() {
  const f = NEWS.filter, list = NEWS.items.filter(i => f === 'todo' || i.tag === f), seen = DB.seenNews || '';
  $('#newsBody').innerHTML = `<h1>📰 Noticias y normativa</h1><p class="lead">Lo que cambia en España para volar drones: BOE (en directo), AESA y prensa. ${NEWS.generated ? `Resumen diario actualizado ${ago(NEWS.generated)}.` : ''}</p>
    <div class="seg">${[['todo', 'Todo'], ['normativa', '⚖️ Normativa'], ['aesa', '🏛️ AESA'], ['prensa', '📰 Prensa']].map(([k, t]) => `<button data-act="newsf" data-f="${k}" class="${f === k ? 'on' : ''}">${t}</button>`).join('')}<button data-act="newsr">🔄</button></div>
    ${NEWS.loading ? '<div class="card"><span class="spin"></span>Buscando las últimas novedades…</div>' : ''}
    ${NEWS.err ? '<div class="card stop">No he podido cargar las noticias. Comprueba tu conexión.</div>' : ''}
    ${list.map(i => `<a class="card news" target="_blank" rel="noopener" href="${esc(i.url)}"><div class="tags"><span class="tag ${i.tag === 'normativa' ? 'red' : i.tag === 'aesa' ? 'amber' : ''}">${({ normativa: '⚖️ Normativa', aesa: '🏛️ AESA', prensa: '📰 Prensa' })[i.tag] || ''}</span>${i.date > seen ? '<span class="tag green">Nuevo</span>' : ''}<span class="tag">${esc(i.source)} · ${ago(i.date)}</span></div><h3>${esc(i.title)}</h3>${i.summary ? `<p class="small muted" style="margin:0">${esc(i.summary)}</p>` : ''}</a>`).join('')}
    ${!NEWS.loading && !list.length && !NEWS.err ? '<div class="empty">No hay noticias en esta categoría.</div>' : ''}`;
}

/* ========================= GUÍA ========================= */
let installEv = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; if ($('#view-guide').classList.contains('active')) renderGuide(); });
function renderGuide() {
  const L = (u, t) => `<a class="btn sec sm" target="_blank" rel="noopener" href="${u}">${t}</a>`;
  $('#guideBody').innerHTML = `<h1>📘 Guía para volar sin líos</h1><p class="lead">Lo esencial, sin jerga.</p>
    ${installEv ? '<div class="actions"><button class="btn block" data-act="install">📲 Instalar la app en el móvil</button></div>' : '<div class="card small">📲 <b>Instalar:</b> en Android, menú del navegador → «Instalar app». En iPhone: Compartir → «Añadir a pantalla de inicio».</div>'}
    <h2>Los 3 colores</h2>
    <div class="verdict v-ok"><div class="big">✅</div><div><h2>Puedes volar</h2><p>Ninguna zona de ENAIRE te afecta. Cumple las normas generales.</p></div></div>
    <div class="verdict v-warn"><div class="big">🛂</div><div><h2>Necesitas permiso</h2><p>Hay que pedir autorización o coordinación a alguien antes. La app te dice a quién y lo prepara.</p></div></div>
    <div class="verdict v-stop"><div class="big">⛔</div><div><h2>No vueles</h2><p>Vuelo prohibido a esa altura.</p></div></div>
    <h2>Antes de tu primer vuelo</h2>
    <div class="card"><ol><li><b>Regístrate como operador en AESA</b> si tu dron lleva cámara o pesa 250 g o más. Te dan un número que pegas en el dron.</li><li><b>Saca el carné</b> si tu dron lo exige (examen online de AESA). Mi perfil te dice cuál.</li><li><b>Seguro:</b> el de responsabilidad civil solo es obligatorio en la subcategoría A2 y en la categoría específica o certificada. En A1 y A3 (menos de 20 kg) no lo es, aunque sigue siendo recomendable.</li><li><b>Mira esta app</b> antes de cada vuelo: tiempo, zonas y permisos.</li></ol>${L(ENLACES.aesa, 'AESA · Drones')} ${L(ENLACES.aesaAbierta, 'Categoría abierta')}</div>
    <h2>¿Qué es cada permiso?</h2>
    <div class="card"><details open><summary>🛰️ ENAIRE Planea</summary><p class="small">Plataforma de ENAIRE para pedir la coordinación en espacio aéreo controlado (CTR, ATZ, TMA). En esas zonas están permitidos los vuelos a la vista de hasta 60 m fuera de las zonas de aeródromo; para el resto hay que solicitar.</p></details>
    <details><summary>✈️ Aeropuertos y aeródromos</summary><p class="small">Dentro de la zona de un aeropuerto hay que coordinar con él (AENA o el aeródromo). La app te da su email y teléfono cuando ENAIRE los publica.</p></details>
    <details><summary>🚆 ADIF, 📷 CECAF, 🏛️ AESA</summary><p class="small">Zonas ferroviarias (ADIF), vuelo fotográfico restringido (CECAF, Ejército del Aire) y zonas urbanas (AESA). Cada una tiene su propio trámite; la app lo detecta y te pone el contacto.</p></details>
    <details><summary>⏱ Antelación</summary><p class="small">Algunos trámites piden plazo (por ejemplo 20 días en zonas ferroviarias). La app te avisa de la fecha límite según el día que elijas.</p></details></div>
    <h2>Contactos y enlaces oficiales</h2>
    <div class="card"><div class="actions">${L(ENLACES.enaireDrones, 'ENAIRE Drones (mapa)')}${L(ENLACES.planea, 'ENAIRE Planea')}${L(ENLACES.zonasUAS, 'Zonas UAS · AIP')}${L(ENLACES.aenaTramite, 'AENA · trámite UAS')}${L(ENLACES.adif, 'ADIF')}${L(ENLACES.aesaZonas, 'AESA · zonas (PDF)')}</div>
      <div class="copyrow"><div><div class="k">Consultas del servicio de datos de ENAIRE</div><div class="v">${ENLACES.enaireAIS}</div></div><a class="btn sec sm" href="mailto:${ENLACES.enaireAIS}">Escribir</a></div>
      <div class="copyrow"><div><div class="k">Emergencias</div><div class="v">112</div></div><a class="btn danger sm" href="tel:112">Llamar</a></div></div>
    <h2>Sobre los datos</h2><div class="card small"><p>Las zonas proceden del servicio oficial de datos AIS de <b>ENAIRE</b> (titular de los derechos de sus contenidos), según el RD 517/2024, y se actualizan cada 28 días (ciclo AIRAC). El tiempo viene de Open-Meteo, el terreno y los mapas de OpenStreetMap, y la normativa del BOE y AESA.</p><p><b>Reglas revisadas el ${fmtDate(RULES.reviewed)}.</b> Se actualizan solas al abrir la app y te aviso si el BOE publica una norma nueva sobre drones. Fuentes: ${RULES.refs.map(([t, u]) => `<a target="_blank" rel="noopener" href="${esc(u)}">${esc(t)}</a>`).join(' · ')}.</p><p><b>Aviso:</b> esta app es una ayuda. No sustituye a la información oficial ni asesoramiento legal, y no puede enviar solicitudes por ti: ENAIRE, AESA y AENA exigen tu identificación. Antes de volar, confirma en las fuentes oficiales.</p></div>`;
}

/* ========================= NAVEGACIÓN Y EVENTOS ========================= */
function setView(v) {
  $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  if (v !== 'permits') PV.id = null;
  if (v === 'map') setTimeout(() => map.invalidateSize(), 50);
  if (v === 'permits') renderPermits();
  if (v === 'profile') renderProfile();
  if (v === 'guide') renderGuide();
  if (v === 'news') { loadNews(); renderNews(); setTimeout(() => { DB.seenNews = new Date().toISOString(); dbSave(); updateBadge(); }, 1500); }
}
function updateBadge() {
  const n = DB.requests.filter(r => r.status === 'borrador' || r.status === 'enviada').length, b = $('#permBadge'); b.hidden = !n; b.textContent = n;
  const u = NEWS.loaded ? unseenNews() : 0, nb = $('#newsBadge'); nb.hidden = !u; nb.textContent = u > 9 ? '9+' : u;
}

document.addEventListener('click', async e => {
  const a = e.target.closest('[data-act]'); if (!a) return; const act = a.dataset.act;
  if (act === 'nav') setView(a.dataset.v);
  else if (act === 'locate') locate();
  else if (act === 'retry') analyze();
  else if (act === 'dr-add') { const d = { id: uid(), droneName: '', droneG: '', droneClass: '', droneCamera: true, droneSerial: '', maxWind: '', droneModel: '' }; DB.drones.push(d); if (!DB.activeDrone) DB.activeDrone = d.id; PF.edit = d.id; dbSave(); renderProfile(); }
  else if (act === 'dr-edit') { PF.edit = a.dataset.id; renderProfile(); }
  else if (act === 'dr-done') { PF.edit = null; renderProfile(); renderSheet(); }
  else if (act === 'dr-act') { DB.activeDrone = a.dataset.id; dbSave(); renderProfile(); renderSheet(); toast('Dron por defecto cambiado'); }
  else if (act === 'dr-del') { if (confirm('¿Borrar este dron?')) { DB.drones = DB.drones.filter(x => x.id !== a.dataset.id); if (DB.activeDrone === a.dataset.id) DB.activeDrone = DB.drones[0]?.id || ''; PF.edit = null; dbSave(); renderProfile(); renderSheet(); } }
  else if (act === 'nov-close') { DB.novDismissed = [...(DB.novDismissed || []), a.dataset.id]; dbSave(); novedades(); }
  else if (act === 'nov-go') { setView('news'); }
  else if (act === 'recommend') recommend();
  else if (act === 'spot') goSpot(+a.dataset.i);
  else if (act === 'copy') copyText(a.dataset.t);
  else if (act === 'prep') { const g = groupByKey(a.dataset.g); if (g) openReq(reqFor(g).id); }
  else if (act === 'prepall') { S.ev.groups.forEach(g => reqFor(g)); toast('Solicitudes preparadas'); setView('permits'); }
  else if (act === 'mail') { const g = groupByKey(a.dataset.g); if (g) { const r = reqFor(g); if (missingFields(r).length && !confirm('Te faltan datos en tu perfil (' + missingFields(r).join(', ') + '). ¿Enviar el email igualmente?')) return openReq(r.id); location.href = mailtoHref(r); } }
  else if (act === 'sent') { const r = DB.requests.find(x => x.id === PV.id); if (r && r.status === 'borrador') setTimeout(() => { if (confirm('¿Has enviado el email? Lo marco como «enviada» para que hagas seguimiento.')) { setStatus(r, 'enviada'); renderPermits(); } }, 1200); }
  else if (act === 'openreq') openReq(a.dataset.id);
  else if (act === 'backreqs') { PV.id = null; renderPermits(); }
  else if (act === 'delreq') { if (confirm('¿Borrar esta solicitud?')) { DB.requests = DB.requests.filter(x => x.id !== a.dataset.id); dbSave(); updateBadge(); renderPermits(); } }
  else if (act === 'print') printRequest(DB.requests.find(x => x.id === a.dataset.id));
  else if (act === 'copyall') copyText(sheetText(DB.requests.find(x => x.id === a.dataset.id)));
  else if (act === 'share') { const r = DB.requests.find(x => x.id === a.dataset.id), t = buildEmail(r); if (navigator.share) navigator.share({ title: t.subject, text: t.body }).catch(() => { }); else copyText(t.subject + '\n\n' + t.body); }
  else if (act === 'newsf') { NEWS.filter = a.dataset.f; renderNews(); }
  else if (act === 'newsr') loadNews(true);
  else if (act === 'install' && installEv) { installEv.prompt(); installEv = null; }
  else if (act === 'docview') { const d = DB.docs.find(x => x.id === a.dataset.id); if (d) { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = `<img src="${d.data}" alt="${esc(d.name)}">`; lb.onclick = () => lb.remove(); document.body.appendChild(lb); } }
  else if (act === 'docdel') { if (confirm('¿Borrar este documento?')) { DB.docs = DB.docs.filter(x => x.id !== a.dataset.id); dbSave(); renderProfile(); } }
  else if (act === 'export') { const b = new Blob([JSON.stringify(DB)], { type: 'application/json' }), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'dron-espana-copia.json'; l.click(); }
  else if (act === 'wipe') { if (confirm('Se borrarán tu perfil, documentos y solicitudes de este móvil. ¿Seguro?')) { localStorage.removeItem(DB_KEY); location.reload(); } }
  else if (act === 'onb-go') { closeModal(); DB.onboarded = true; dbSave(); setView('profile'); }
  else if (act === 'onb-skip') { closeModal(); DB.onboarded = true; dbSave(); }
});
function closeModal() { $('.modal')?.remove(); }

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.ctl === 'height') { S.height = +t.value; S.spots = null; spotLayer.clearLayers(); renderSheet(); loadOverlay(); }
  else if (t.dataset.ctl === 'radius') { S.radius = +t.value; analyze(); }
  else if (t.dataset.ctl === 'urban') { S.urban = t.value; renderSheet(); }
  else if (t.dataset.ctl === 'when') { if (t.value) { S.when = new Date(t.value); renderSheet(); } }
  else if (t.dataset.chk) { DB.checks[t.dataset.chk] = t.checked; DB.checks.day = ymd(new Date()); dbSave(); }
  else if (t.dataset.dm) { const d = DB.drones.find(x => x.id === PF.edit), m = DRONES.find(x => x.id === t.value); if (d && m) { d.droneModel = m.id; if (m.g) { d.droneName = d.droneName || m.name; d.droneG = m.g; } dbSave(); renderProfile(); } }
  else if (t.dataset.dr) { const d = DB.drones.find(x => x.id === PF.edit); if (d) { d[t.dataset.dr] = t.value; dbSave(); if (['droneG', 'droneClass'].includes(t.dataset.dr)) renderProfile(); renderSheet(); } }
  else if (t.dataset.drc) { const d = DB.drones.find(x => x.id === PF.edit); if (d) { d.droneCamera = t.checked; dbSave(); renderProfile(); renderSheet(); } }
  else if (t.dataset.pb) {
    const k = t.dataset.pb; DB.profile[k] = t.value; dbSave();
    if (k === 'pilotCert') renderProfile(); else { const s = $('.meter i'); if (s) s.style.width = profileScore() + '%'; } renderSheet();
  }
  else if (t.dataset.rb) { const r = DB.requests.find(x => x.id === PV.id); if (!r) return; let v = t.value; if (t.type === 'number') v = +v; setPath(r, t.dataset.rb, v); if (t.dataset.rb === 'status') setStatus(r, v); dbSave(); renderPermits(); }
  else if (t.id === 'docFile' && t.files[0]) { try { const data = await resizeImage(t.files[0]), type = $('#docType').value, nm = $('#docType').selectedOptions[0].text; DB.docs.push({ id: uid(), type, name: nm, data }); if (dbSave()) { renderProfile(); toast('Documento guardado'); } else DB.docs.pop(); } catch { toast('No he podido leer esa imagen'); } }
  else if (t.id === 'importFile' && t.files[0]) { try { const j = JSON.parse(await t.files[0].text()); Object.assign(DB, j); dbSave(); location.reload(); } catch { toast('Ese archivo no es una copia válida'); } }
});
document.addEventListener('input', e => { const t = e.target; if (t.dataset.ctl === 'height') $('#hLbl').textContent = t.value + ' m'; });

/* ========================= NOVEDADES ========================= */
const STRONG = /\bUAS\b|aeronaves? no tripuladas?|\bRPAS\b|\bdrones?\b|pilotadas? por control remoto/i;
/* Avisos: (1) normas nuevas del BOE sobre drones posteriores a la última revisión de las reglas, (2) cambios en rules.json. */
function novItems() {
  const dis = DB.novDismissed || [], out = [], rev = RULES.reviewed || '';
  NEWS.items.filter(i => i.source === 'BOE' && STRONG.test(i.title) && i.date.slice(0, 10) > rev)
    .forEach(i => out.push({ id: i.id || i.title, ico: '⚖️', t: 'Nueva norma sobre drones en el BOE', d: i.title, url: i.url, warn: 'Puede cambiar las reglas de la app hasta que se revisen. Consulta el texto oficial.' }));
  (RULES.changelog || []).filter(c => c.date > (DB.firstSeen || '')).forEach(c => out.push({ id: 'cl-' + c.date + c.text.slice(0, 16), ico: '🔄', t: 'Reglas actualizadas', d: c.text }));
  return out.filter(x => !dis.includes(x.id)).slice(0, 3);
}
function novHtml() {
  return novItems().map(n => `<div class="card warn"><div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><div style="min-width:0;flex:1;overflow-wrap:anywhere"><b>${n.ico} ${esc(n.t)}</b><div class="small">${esc(n.d)}</div>${n.warn ? `<div class="small muted">${esc(n.warn)}</div>` : ''}</div><button class="btn sec sm" style="flex:none" data-act="nov-close" data-id="${esc(n.id)}" aria-label="Cerrar aviso">✕</button></div>
    <div class="actions">${n.url ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(n.url)}">Leer la norma</a>` : ''}<button class="btn sec sm" data-act="nov-go">Ver novedades</button></div></div>`).join('');
}
function novedades() { renderSheet(); }
function novedadesRefrescar() { if (!S.loading) renderSheet(); updateBadge(); }

/* ========================= ARRANQUE ========================= */
function showOnboarding() {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div><h1 style="margin-top:0">¡Hola! 👋</h1><p>Esta app te dice <b>dónde puedes volar tu dron</b> con los datos oficiales de ENAIRE, <b>a quién pedir permiso</b> (con su teléfono y email) y te deja <b>todo rellenado</b>.</p><p>Si me dices qué dron tienes y quién eres, te digo qué carné necesitas y relleno las solicitudes por ti. Tarda 1 minuto y se queda solo en tu móvil.</p><div class="actions"><button class="btn block" data-act="onb-go">Configurar mi perfil</button><button class="btn sec block" data-act="onb-skip">Ahora no, ir al mapa</button></div></div>`;
  document.body.appendChild(m);
}
function boot() {
  dbLoad(); initMap();
  $$('#nav button').forEach(b => b.onclick = () => setView(b.dataset.view));
  $('#btnLocate').onclick = locate;
  $('#btnBase').onclick = () => { const i = BASES.findIndex(b => b.id === DB.base); setBase(BASES[(i + 1) % BASES.length].id, true); };
  $('#btnFree').onclick = toggleFree;
  $('#btnLayers').onclick = () => { const p = $('#layersPanel'); p.hidden = !p.hidden; };
  $$('#layersPanel input').forEach(i => { i.checked = DB.layers[i.dataset.layer] !== false; i.onchange = () => { DB.layers[i.dataset.layer] = i.checked; dbSave(); loadOverlay(); }; });
  $('#sheetHandle').onclick = () => setSheetTall(!S.sheetTall);
  $('#searchForm').onsubmit = e => { e.preventDefault(); search($('#searchInput').value); };
  $('#searchInput').addEventListener('input', () => { if (!$('#searchInput').value) $('#searchResults').hidden = true; });
  if (!DB.firstSeen) DB.firstSeen = DB.onboarded ? '2026-10-25' : ymd(new Date()); // las novedades solo cuentan desde que usas la app
  renderSheet(); updateBadge();
  if (!DB.onboarded) showOnboarding();
  cargarReglas().then(() => { renderSheet(); novedadesRefrescar(); });
  loadNews().then(novedadesRefrescar).catch(() => { });
  // Actualización automática: versión de la app (service worker), reglas, noticias y zonas, cada vez que vuelves a abrirla.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(() => { });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !window.__rl) { window.__rl = 1; toast('Nueva versión instalada. Actualizando…'); setTimeout(() => location.reload(), 900); } });
  }
  let last = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - last < 15 * 60e3) return; last = Date.now();
    navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => { });
    cargarReglas().then(() => { renderSheet(); novedadesRefrescar(); }); loadNews(true).then(novedadesRefrescar); loadOverlay();
  });
}
boot();
