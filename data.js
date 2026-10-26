'use strict';
/* Datos estáticos y reglas. Los pesos son los del fabricante (orientativos): manda siempre la etiqueta de TU dron. */

const DRONES = [
  { id: 'dji-mini-2', name: 'DJI Mini 2', g: 249 },
  { id: 'dji-mini-2-se', name: 'DJI Mini 2 SE', g: 246 },
  { id: 'dji-mini-3', name: 'DJI Mini 3', g: 248 },
  { id: 'dji-mini-3-pro', name: 'DJI Mini 3 Pro', g: 249 },
  { id: 'dji-mini-4-pro', name: 'DJI Mini 4 Pro', g: 249 },
  { id: 'dji-mini-4k', name: 'DJI Mini 4K', g: 246 },
  { id: 'dji-neo', name: 'DJI Neo', g: 135 },
  { id: 'dji-flip', name: 'DJI Flip', g: 249 },
  { id: 'dji-avata', name: 'DJI Avata', g: 410 },
  { id: 'dji-avata-2', name: 'DJI Avata 2', g: 377 },
  { id: 'dji-air-2s', name: 'DJI Air 2S', g: 595 },
  { id: 'dji-air-3', name: 'DJI Air 3', g: 720 },
  { id: 'dji-mavic-air', name: 'DJI Mavic Air', g: 430 },
  { id: 'dji-mavic-2', name: 'DJI Mavic 2 Pro / Zoom', g: 907 },
  { id: 'dji-mavic-3', name: 'DJI Mavic 3 / Classic', g: 895 },
  { id: 'dji-mavic-3-pro', name: 'DJI Mavic 3 Pro', g: 958 },
  { id: 'dji-phantom-4', name: 'DJI Phantom 4 Pro', g: 1375 },
  { id: 'dji-fpv', name: 'DJI FPV', g: 795 },
  { id: 'autel-nano', name: 'Autel EVO Nano+', g: 249 },
  { id: 'autel-lite', name: 'Autel EVO Lite+', g: 835 },
  { id: 'parrot-anafi', name: 'Parrot Anafi', g: 320 },
  { id: 'potensic-atom', name: 'Potensic Atom', g: 249 },
  { id: 'otro', name: 'Otro modelo (indico el peso)', g: null },
];

const CLASES = [
  ['', 'No lo sé / sin etiqueta de clase'],
  ['C0', 'C0 (menos de 250 g)'], ['C1', 'C1 (menos de 900 g)'], ['C2', 'C2 (menos de 4 kg)'],
  ['C3', 'C3 (menos de 25 kg)'], ['C4', 'C4 (menos de 25 kg, aeromodelo)'],
];

const FINALIDADES = ['Recreativo / aficionado', 'Fotografía y vídeo', 'Inspección técnica', 'Topografía / cartografía',
  'Agricultura', 'Evento / cobertura audiovisual', 'Formación / pruebas', 'Otra'];

const ENLACES = {
  planea: 'https://planea.enaire.es/nsf/login',
  enaireDrones: 'https://drones.enaire.es',
  zonasUAS: 'https://aip.enaire.es/AIP/UAS-es.html',
  enaireAIS: 'ais@enaire.es',
  aesa: 'https://www.seguridadaerea.gob.es/es/ambitos/drones',
  aesaAbierta: 'https://www.seguridadaerea.gob.es/es/ambitos/drones/operaciones-con-uas-drones/operaciones-con-uas-drones---categoria-abierta-subcategorias-a1-a2-y-a3',
  aesaZonas: 'https://www.seguridadaerea.gob.es/sites/default/files/UAS-OPS-DT01_Ed.01_Zonas.geograficas.UAS.del.RDUAS.pdf',
  aenaTramite: 'https://www.aena.es/es/corporativa/seguridad-operacional/tramites/coordinacion-actividades-uas-zonas-fuera-atz-ctr-fiz.html',
  adif: 'https://www.adif.es/solicitud-de-actuaciones-en-zona-de-afeccion-del-ferrocarril',
  boe: 'https://www.boe.es',
};

/* Parámetros normativos. Los valores de aquí son los de reserva: al abrir la app se descarga rules.json y los sustituye,
   así una norma nueva se aplica editando ese archivo, sin reinstalar nada. Fuentes: Reglamento UE 2019/947, RD 517/2024
   (art. 8 seguro) y notas de AESA (comprobado el 26/10/2026). */
const RULES = {
  version: 1, reviewed: '2026-10-26',
  maxHeight: 120, maxKg: 25, registroGramos: 250, registroJulios: 80,
  distA2: 30, distA2Low: 5, distA3: 150,
  seguroSubcats: ['A2'], seguroKg: 20, edadMin: 16, edadC0: 12,
  refs: [
    ['Real Decreto 517/2024 (BOE)', 'https://www.boe.es/buscar/doc.php?id=BOE-A-2024-11377'],
    ['AESA · categoría abierta', 'https://www.seguridadaerea.gob.es/es/ambitos/drones/operaciones-uas-drones/operaciones-con-uas-drones---categoria-abierta-subcategorias-a1-a2-y-a3'],
  ],
};
const RULES_URL = 'rules.json'; // el APK lo apunta a la web publicada para recibir las reglas nuevas sin reinstalar
async function cargarReglas() {
  for (const u of [RULES_URL, 'rules.json']) {
    try { const r = await fetch(u + '?' + Date.now()); if (r.ok) { Object.assign(RULES, await r.json()); return; } } catch { /* siguiente origen */ }
  }
}

/** Qué puede/debe hacer el piloto con SU dron. Orientativo: manda siempre la norma oficial. */
function reglasDron(prof) {
  const g = Number(prof.droneG) || 0;
  const cls = prof.droneClass || '';
  const cam = prof.droneCamera !== false;
  if (!g && !cls) return null;
  const notas = [];
  let sub, cert, certTxt;
  if (cls === 'C0' || (!cls && g && g < RULES.registroGramos)) {
    sub = 'A1'; cert = false;
    certTxt = 'No hace falta carné: basta conocer las instrucciones del fabricante (o hacer el curso y examen gratuitos de AESA).';
    if (!cls) notas.push('Sin etiqueta de clase solo vale en categoría abierta si se puso a la venta antes del 1 de enero de 2024. Si es posterior, debe llevar etiqueta C0.');
  } else if (cls === 'C1') {
    sub = 'A1'; cert = true; certTxt = 'Certificado de piloto A1/A3 (curso y examen online gratuitos de AESA).';
  } else if (cls === 'C2') {
    sub = 'A2'; cert = true; certTxt = 'Certificado de piloto A2 (además del A1/A3).';
  } else {
    sub = 'A3'; cert = true; certTxt = 'Certificado de piloto A1/A3 (curso y examen online gratuitos de AESA).';
    if (!cls) notas.push('Sin etiqueta de clase solo vale en categoría abierta si se puso a la venta antes del 1 de enero de 2024. Si es posterior, necesita etiqueta de clase (C1–C4).');
  }
  const registro = g >= RULES.registroGramos || cam;
  const seguro = RULES.seguroSubcats.includes(sub) || g >= RULES.seguroKg * 1000;
  const limites = [`Altura máxima: ${RULES.maxHeight} m sobre el suelo.`, 'Siempre a la vista (VLOS), salvo modo «sígueme» o con observador.',
    `Peso máximo ${RULES.maxKg} kg. No lances objetos ni transportes mercancías peligrosas.`];
  if (sub === 'A1') limites.push('No sobrevueles concentraciones de personas, ni personas ajenas a la operación si puedes evitarlo.');
  if (sub === 'A2') limites.push(`Mantén al menos ${RULES.distA2} m de personas ajenas (hasta ${RULES.distA2Low} m con el modo de baja velocidad activado).`);
  if (sub === 'A3') limites.push(`Vuela lejos de personas y a ${RULES.distA3} m o más de zonas residenciales, comerciales, industriales o recreativas.`);
  const a1c0 = sub === 'A1' && (cls === 'C0' || (!cls && g < RULES.registroGramos));
  return {
    sub, subTxt: `Categoría abierta · subcategoría ${sub}`, cert, certTxt, registro, seguro, g, limites, notas,
    registroTxt: registro
      ? 'Debes registrarte como operador en AESA (es gratis) y poner tu número visible en el dron. Un dron con cámara de menos de 250 g también debe registrarse, salvo que sea un juguete certificado (Directiva 2009/48/CE).'
      : 'No es obligatorio registrarse: menos de 250 g, sin cámara ni sensor y sin superar 80 J de energía en un impacto.',
    seguroTxt: seguro
      ? (g >= RULES.seguroKg * 1000 ? 'Seguro obligatorio (20 kg o más: Reglamento CE 785/2004).' : 'Seguro de responsabilidad civil obligatorio en la subcategoría A2 (art. 8 RD 517/2024).')
      : `El seguro NO es obligatorio en la subcategoría ${sub} (art. 8 RD 517/2024: las operaciones A1 y A3 de menos de 20 kg están exceptuadas). Es recomendable, pero no obligatorio.`,
    edadTxt: a1c0 ? `Edad mínima para pilotar: ${RULES.edadC0} años (${RULES.edadMin} para registrarte como operador).` : `Edad mínima: ${RULES.edadMin} años.`,
  };
}

/** Texto humano para una duración ISO-8601 como P20D, PT48H, P1M… */
function duracionISO(s) {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(s || '');
  if (!m) return '';
  const [, y, mo, w, d, h, mi] = m.map(x => (x ? +x : 0));
  const parts = [];
  if (y) parts.push(`${y} año${y > 1 ? 's' : ''}`);
  if (mo) parts.push(`${mo} mes${mo > 1 ? 'es' : ''}`);
  if (w) parts.push(`${w} semana${w > 1 ? 's' : ''}`);
  if (d) parts.push(`${d} día${d > 1 ? 's' : ''}`);
  if (h) parts.push(`${h} hora${h > 1 ? 's' : ''}`);
  if (mi) parts.push(`${mi} min`);
  return parts.join(' y ');
}
function duracionDias(s) {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?)?$/.exec(s || '');
  if (!m) return 0;
  return (+m[1] || 0) * 7 + (+m[2] || 0) + ((+m[3] || 0) / 24);
}
