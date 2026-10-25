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

/** Qué puede/debe hacer el piloto con SU dron (UE 2019/947 + RD 517/2024). Orientativo: confirma en AESA. */
function reglasDron(prof) {
  const g = Number(prof.droneG) || 0;
  const cls = prof.droneClass || '';
  const cam = prof.droneCamera !== false;
  if (!g && !cls) return null;
  let sub, subTxt, cert, certTxt;
  if (cls === 'C0' || (!cls && g && g < 250)) {
    sub = 'A1'; subTxt = 'Categoría abierta · subcategoría A1';
    cert = false; certTxt = 'No necesitas curso: basta leer el manual del fabricante.';
  } else if (cls === 'C1') {
    sub = 'A1'; subTxt = 'Categoría abierta · subcategoría A1';
    cert = true; certTxt = 'Certificado de piloto A1/A3 (examen online de AESA).';
  } else if (cls === 'C2') {
    sub = 'A2'; subTxt = 'Categoría abierta · subcategoría A2';
    cert = true; certTxt = 'Certificado de piloto A2 (además del A1/A3).';
  } else {
    sub = 'A3'; subTxt = 'Categoría abierta · subcategoría A3';
    cert = true; certTxt = 'Certificado de piloto A1/A3 (examen online de AESA).';
  }
  const registro = g >= 250 || cam;
  const limites = ['Altura máxima: 120 m sobre el suelo.', 'Siempre a la vista (sin perderlo de vista a simple vista).',
    'Máximo 25 kg de peso.'];
  if (sub === 'A1') limites.push('No sobrevueles concentraciones de personas. Pasar sobre alguien ajeno solo de forma ocasional, y evítalo.');
  if (sub === 'A2') limites.push('Mantén al menos 30 m de personas ajenas (5 m en modo de baja velocidad).');
  if (sub === 'A3') limites.push('Vuela a 150 m o más de zonas residenciales, comerciales, industriales o recreativas, y lejos de personas.');
  return {
    sub, subTxt, cert, certTxt, registro, g, limites,
    registroTxt: registro
      ? 'Debes estar registrado como operador en AESA y llevar tu número de operador visible en el dron.'
      : 'No es obligatorio registrarse (menos de 250 g y sin cámara), aunque es recomendable.',
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
