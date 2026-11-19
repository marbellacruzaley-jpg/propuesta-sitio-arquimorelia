// Generador de la propuesta de sitio. Uso: node build.js <carpetaDescarga> <carpetaSalida>
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SRC = process.argv[2];
const OUT = process.argv[3];
const HERE = __dirname;
// hash SHA-256 de "usuario:contraseña" (usuario en minúsculas). Se pasa por variable de entorno; la contraseña nunca se guarda.
const LOGIN_HASH = process.env.LOGIN_HASH || '';
if (!/^[0-9a-f]{64}$/.test(LOGIN_HASH)) { console.error('Falta LOGIN_HASH (sha256 hex de "usuario:contraseña")'); process.exit(1); }
fs.mkdirSync(path.join(OUT, 'assets', 'img'), { recursive: true });
fs.copyFileSync(path.join(HERE, 'styles.css'), path.join(OUT, 'assets', 'styles.css'));
fs.copyFileSync(path.join(HERE, 'main.js'), path.join(OUT, 'assets', 'main.js'));

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

// ---------------- images ----------------
const IMG_CACHE = {};
function probe(abs) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', abs], { encoding: 'utf8' });
  const [w, h] = (r.stdout || '').trim().split(',').map(Number);
  return { w: w || 0, h: h || 0 };
}
function img(abs, width = 1400) {
  if (!abs || !fs.existsSync(abs)) return null;
  const id = path.basename(abs).replace(/^\d+_/, '').replace(/\.[^.]+$/, '');
  const name = `${id}-${width}.webp`;
  const out = path.join(OUT, 'assets', 'img', name);
  if (!IMG_CACHE[name] && !fs.existsSync(out)) {
    const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', abs, '-vf', `scale='min(${width},iw)':-2`, '-frames:v', '1', '-quality', '78', out]);
    if (r.status !== 0 || !fs.existsSync(out)) { console.log('img fail', abs); return null; }
  }
  IMG_CACHE[name] = 1;
  return 'assets/img/' + name;
}
function pageImages(dir) {
  const d = path.join(dir, 'imagenes');
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).sort().map(f => path.join(d, f)).filter(f => {
    const b = path.basename(f);
    if (/9db2a0_|11062b_/.test(b)) return false;             // recursos del tema / stock Wix
    const { w, h } = probe(f);
    return w >= 300 && h >= 200 && w / h < 3.2;
  });
}

// ---------------- text ----------------
const JUNK = [/^This is your News article/i, /^\d+(\.\d+)? ?MB$/, /^Location is TBD$/, /^Compartir este evento$/i, /^#ArquiMorelia/i, /^¡Gracias por enviar tu solicitud!/];
function readTxt(dir) {
  const name = path.basename(dir);
  const f = path.join(dir, name + '.txt');
  if (!fs.existsSync(f)) return null;
  const raw = fs.readFileSync(f, 'utf8').replace(/\r/g, '');
  const lines = raw.split('\n');
  const title = lines[0].trim();
  const url = (lines[1] || '').replace(/^Fuente: /, '').trim();
  const chunks = lines.slice(2).join('\n').split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  let blocks = [];
  for (let c of chunks) {
    let type = 'p';
    if (c.startsWith('## ')) { type = 'h'; c = c.slice(3).trim(); }
    else if (c.startsWith('• ')) { type = 'li'; c = c.slice(2).trim(); }
    if (!c || JUNK.some(r => r.test(c))) continue;
    blocks.push({ type, text: c });
  }
  // une párrafos partidos a media frase
  const merged = [];
  for (const b of blocks) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === 'p' && b.type === 'p' && !/[.:;!?)"»”…]$/.test(prev.text) && /^[a-záéíóúñ(]/.test(b.text)) prev.text += ' ' + b.text;
    else merged.push({ ...b });
  }
  // quita encabezados finales genéricos
  while (merged.length && /^(Arquidiócesis|de Morelia|Acontecer|Puntos de Contacto)$/i.test(merged[merged.length - 1].text)) merged.pop();
  return { title, url, blocks: merged };
}
function isLabel(t) { return t.length < 60 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(t); }
function renderBlocks(blocks, { skipTitle } = {}) {
  let html = '', inList = false, listMode = false;
  const close = () => { if (inList) { html += '</ul>'; inList = false; } };
  blocks.forEach((b, i) => {
    let t = b.text;
    if (i === 0 && skipTitle && b.type === 'h' && t.replace(/["“”]/g, '') === skipTitle.replace(/["“”]/g, '')) return;
    const inner = esc(t).replace(/\n/g, '<br>');
    if (b.type === 'h') { close(); listMode = false; html += `<h2>${inner}</h2>`; return; }
    if (isLabel(t)) { close(); listMode = false; html += `<div class="label">${inner}</div>`; return; }
    if (b.type === 'p' && t.length < 60 && !/[.,;:!?…]$/.test(t) && !t.includes('\n') && (blocks[i + 1] || {}).type === 'p' && (blocks[i + 1].text.length > 120)) { close(); listMode = false; html += '<h3 class="sub">' + inner + '</h3>'; return; }
    if (t.length < 80 && /:$/.test(t)) { close(); listMode = true; html += `<h3>${inner}</h3>`; return; }
    if (b.type === 'li' || (listMode && t.length < 260)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${inner}</li>`; return;
    }
    close(); listMode = false;
    html += `<p>${inner}</p>`;
  });
  close();
  return html;
}
const firstPara = blocks => (blocks.find(b => b.type === 'p' && b.text.length > 90 && !isLabel(b.text)) || {}).text || '';
const clip = (s, n = 170) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;

// ---------------- icons ----------------
const I = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  church: '<path d="M12 2v4M10 4h4"/><path d="M6 21V11l6-5 6 5v10"/><path d="M3 21h18"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h13"/><path d="M12 7v6M9 10h6"/>',
  cross: '<path d="M12 2v20M7 7h10"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.4 3.4 5 6.8 5c2 0 3.4 1.1 5.2 3 1.8-1.9 3.2-3 5.2-3 3.4 0 5.6 3.4 4.3 6.7C19.5 16.4 12 21 12 21Z"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14l3 3 3-3"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  dove: '<path d="M3 13c3 0 5-1 7-4l2-4 2 3h4l-3 3c0 5-4 8-9 8H3l3-3"/>',
  rings: '<circle cx="9" cy="14" r="5"/><circle cx="15" cy="14" r="5"/><path d="m10 5 2-2 2 2"/>',
  bread: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/>',
};
const icon = (n, cls = 'icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
const SOC = {
  facebook: ['https://www.facebook.com/arquimorelia/', '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5Z"/>'],
  instagram: ['https://www.instagram.com/arquimorelia/', '<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm5.2-9.4a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2c-2.7 0-3 0-4.1.1C4.3 2.3 2.3 4.3 2.1 7.9 2 9 2 9.3 2 12s0 3 .1 4.1c.2 3.6 2.2 5.6 5.8 5.8 1.1.1 1.4.1 4.1.1s3 0 4.1-.1c3.6-.2 5.6-2.2 5.8-5.8.1-1.1.1-1.4.1-4.1s0-3-.1-4.1c-.2-3.6-2.2-5.6-5.8-5.8C15 2 14.7 2 12 2Z"/>'],
  tiktok: ['https://www.tiktok.com/@arquimorelia', '<path d="M16.5 3c.4 2.3 1.9 3.9 4.5 4.1v3.2a8 8 0 0 1-4.4-1.3v6.5A6.5 6.5 0 1 1 10 9v3.3a3.3 3.3 0 1 0 3.3 3.2V3Z"/>'],
  x: ['https://twitter.com/arquimorelia/', '<path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/>'],
  spotify: ['https://open.spotify.com/show/6IgjmfjJEgtKHdvK3YuHDY', '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 14.4a.6.6 0 0 1-.9.2c-2.4-1.5-5.4-1.8-8.9-1a.6.6 0 1 1-.3-1.2c3.9-.9 7.2-.5 9.9 1.1.3.2.4.6.2.9Zm1.2-2.7a.8.8 0 0 1-1.1.3c-2.7-1.7-6.9-2.2-10.2-1.2a.8.8 0 1 1-.5-1.5c3.7-1.1 8.4-.6 11.5 1.3.4.2.5.7.3 1.1Zm.1-2.8C14.7 9 9.4 8.8 6.3 9.7a1 1 0 1 1-.6-1.8c3.5-1.1 9.4-.9 13.1 1.3a1 1 0 0 1-.9 1.7Z"/>'],
};
const social = (n) => `<a href="${SOC[n][0]}" target="_blank" rel="noopener" aria-label="${n}"><svg viewBox="0 0 24 24">${SOC[n][1]}</svg></a>`;
const DONATE = 'https://donate.stripe.com/cN2cQL0z26Sc7Nm4gg';

// ---------------- información del sitio ----------------
const P = d => path.join(SRC, 'paginas', d);
const G = path.join(SRC, '_general (encabezado y pie)', 'imagenes');
const findImg = (dir, idPart) => { const d = path.join(dir, 'imagenes'); const f = fs.existsSync(d) && fs.readdirSync(d).find(x => x.includes(idPart)); return f ? path.join(d, f) : null; };
const GIMG = idPart => { const f = fs.readdirSync(G).find(x => x.includes(idPart)); return f ? path.join(G, f) : null; };

const IMGS = {
  logo: img(GIMG('e8dd107b6aba4dafb2322ce721d4d610'), 400),
  heroStreet: img(GIMG('48cb5c18d47140719083163b0399cd90'), 1920),
  heroNight: img(GIMG('2a8c61d4ed094dc891c7ee4189bba573'), 1920),
  heroCross: img(GIMG('afd8c9cc3d5a4f57a8a6a608194c930c'), 1920),
  catDay: img(findImg(P('historia'), '884ca5bf'), 1600),
  virgen: img(findImg(P('historia'), 'b34043ba'), 1600),
  patio: img(findImg(P('historia'), '8771571116'), 1400),
  vasco: img(findImg(P('historia'), '7f041cb3'), 1200),
  arzPortrait: img(findImg(P('inicio'), 'b51500f9'), 1200),
  arzMass: img(findImg(P('arzobispo'), '89d836ea'), 1600),
  arzVertical: img(findImg(P('arzobispo'), '19b9a3dc'), 1000),
  group: img(findImg(P('inicio'), '5533d085'), 1600),
  darkCat: img(findImg(P('inicio'), '43d5dd10'), 1600),
};

// páginas internas: slug -> datos
const SECTIONS = [
  { key: 'arzobispado', label: 'Arzobispado', intro: 'Pastores que guían a la Iglesia de Morelia, en comunión con el Papa y la Provincia Eclesiástica.', feature: ['arzobispo', IMGS.arzMass, 'Conoce a nuestro Arzobispo'],
    links: [['arzobispo', 'Arzobispo', 'Mons. José Armando Álvarez Cano'], ['obispos', 'Obispos', 'Obispos en Morelia y eméritos'], ['provincia', 'Provincia Eclesiástica', 'Las 5 diócesis de la provincia'], ['estadisticas', 'Estadísticas', 'La Arquidiócesis en cifras']] },
  { key: 'directorio', label: 'Directorio', intro: 'Encuentra parroquias, oficinas, seminarios y comunidades de la Arquidiócesis.', feature: ['parroquias', IMGS.catDay, 'Encuentra tu parroquia'],
    links: [['parroquias', 'Parroquias', 'Buscador y horarios de misa'], ['oficinas', 'Oficinas del Arzobispado', 'Curia y atención al público'], ['zonapastoral', 'Zonas Pastorales', 'Organización territorial'], ['vidaconsagrada', 'Vida Consagrada', 'Institutos y comunidades'], ['seminarios', 'Seminarios', 'Formación sacerdotal'], ['centrosasistenciales', 'Centros Asistenciales', 'Hospitales y asistencia'], ['casaderetiro', 'Casa de Retiro', 'Espacios de oración'], ['agenda', 'Agenda', 'Eventos y celebraciones']] },
  { key: 'tramites', label: 'Trámites', intro: 'Requisitos generales para recibir los sacramentos y solicitar documentos parroquiales.', feature: ['tramites', IMGS.arzVertical || IMGS.arzMass, 'Sacramentos y documentos'], links: [] },
  { key: 'pastoral', label: 'Pastoral', intro: 'Las dimensiones que animan, orientan y articulan la acción evangelizadora de la Arquidiócesis.', feature: ['vicaria', IMGS.group, 'Vicaría de Pastoral'],
    links: [['vicaria', 'Vicaría de Pastoral', 'Pastoral orgánica diocesana'], ['profetica', 'Pastoral Profética', 'Palabra, catequesis y formación'], ['liturgia', 'Liturgia', 'Fuente y culmen de la vida cristiana'], ['pastoralsocial', 'Pastoral Social', 'Justicia, paz y solidaridad'], ['familiajuventudlaicosyvida', 'Familia, Juventud, Laicos y Vida', 'Ámbitos de la vida cristiana'], ['pastoraldecomunicacion', 'Pastoral de Comunicación', 'Verdad, claridad y esperanza'], ['pastoraldepastores', 'Pastoral de Pastores', 'Atención a sacerdotes y seminaristas']] },
  { key: 'documentos', label: 'Documentos', intro: 'Comunicados, subsidios litúrgicos y materiales para la evangelización.', feature: ['descargas', IMGS.darkCat, 'Centro de descargas'],
    links: [['comunicados', 'Comunicados', 'Avisos oficiales'], ['subsidiosliturgicos', 'Subsidios Litúrgicos', 'Celebraciones y guías'], ['vicariapastoral', 'Catequesis Vicaría', 'Semana de la Familia'], ['subsidiosevangelizacion', 'Comunidad Cristiana', 'Hemeroteca digital'], ['descargas', 'Todas las descargas', 'Centro de documentos']] },
  { key: 'historia', label: 'Historia y Fe', intro: 'Casi cinco siglos de fe: de Don Vasco de Quiroga a nuestros días.', feature: ['santospatrones', IMGS.virgen, 'Santos Patrones'],
    links: [['historia', 'Historia de la Arquidiócesis', 'Desde 1536'], ['santospatrones', 'Santos Patrones', 'María Inmaculada de la Salud'], ['noticias', 'Noticias', 'Acontecer de la Iglesia local']] },
];
const TRAMITES = [
  ['bautismo-de-los-niños', 'Bautismo', 'water', 'Primer paso en la vida cristiana.'],
  ['primera-comunión', 'Primera Comunión', 'bread', 'Recibir por primera vez la Eucaristía.'],
  ['confirmación', 'Confirmación', 'dove', 'Perfecciona la gracia bautismal.'],
  ['matrimonio', 'Matrimonio', 'rings', 'Requisitos para el matrimonio religioso.'],
  ['corrección-de-actas-boletas', 'Corrección de actas', 'pen', 'Corrección de actas y boletas.'],
  ['otros-trámites', 'Otros trámites', 'list', 'Constancias y otros documentos.'],
];
SECTIONS[2].links = TRAMITES.map(([s, t, , d]) => ['tramites/' + slugify(s), t, d]);

const pageFile = slug => slug.includes('/') ? slug + '.html' : slug + '.html';
const sectionOf = slug => SECTIONS.find(s => s.links.some(l => l[0] === slug));

// ---------------- layout ----------------
function layout({ title, desc = '', body, depth = 0, active = '' }) {
  const r = depth ? '../'.repeat(depth) : '';
  const L = s => r + pageFile(s);
  const mega = SECTIONS.map(s => `
      <div class="item${active === s.key ? ' active' : ''}"><a href="${s.key === 'tramites' ? L('tramites') : L(s.links[0][0])}">${s.label}${icon('chevron', 'icon')}</a>
        <div class="mega"><div class="wrap">
          <div class="mega-intro"><span class="eyebrow">${s.label}</span><h3>${s.label}</h3><p>${esc(s.intro)}</p></div>
          <div class="mega-links">${s.links.map(([sl, t, d]) => `<a href="${L(sl)}">${esc(t)}<small>${esc(d)}</small></a>`).join('')}</div>
          <a class="mega-feature" href="${L(s.feature[0])}"><img src="${r}${s.feature[1]}" alt="" loading="lazy"><span>${esc(s.feature[2])}</span></a>
        </div></div>
      </div>`).join('');
  const mobile = SECTIONS.map(s => `<details><summary>${s.label}<span>+</span></summary>${s.links.map(([sl, t]) => `<a href="${L(sl)}">${esc(t)}</a>`).join('')}</details>`).join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<script>(function(){var t;try{t=localStorage.getItem('am_auth')||sessionStorage.getItem('am_auth')}catch(e){}if(t!=='${LOGIN_HASH}'){location.replace('${r}index.html?next='+encodeURIComponent(location.pathname.split('/').slice(-${depth + 1}).join('/')+location.search));}})();</script>
<title>${esc(title)} | Arquidiócesis de Morelia</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="${r}${IMGS.logo}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${r}assets/styles.css">
</head>
<body>
<div class="utility"><div class="wrap">
  <span>Arquidiócesis de Morelia · Fundada en 1536</span>
  <nav>
    <a href="https://www.vaticannews.va/es/evangelio-de-hoy.html" target="_blank" rel="noopener">Evangelio del día</a>
    <a href="${L('agenda')}">Agenda</a>
    <a href="${L('noticias')}">Noticias</a>
    <a class="keep" href="${L('contacto')}">Contacto</a>
    <a class="keep" href="${r}index.html?logout=1" title="Cerrar sesión">Salir</a>
    <span class="social">${social('facebook')}${social('instagram')}${social('tiktok')}${social('x')}</span>
  </nav>
</div></div>
<header class="header"><div class="wrap">
  <a class="brand" href="${r}inicio.html"><img src="${r}${IMGS.logo}" alt="Logotipo Arquidiócesis de Morelia"><span class="brand-text"><small>Arquidiócesis de</small><strong>Morelia</strong></span></a>
  <nav class="mainnav" aria-label="Principal">${mega}
      <div class="item${active === 'noticias' ? ' active' : ''}"><a href="${L('noticias')}">Noticias</a></div>
  </nav>
  <div class="header-cta">
    <a class="btn btn-outline" href="${L('parroquias')}">${icon('search')}Parroquias</a>
    <a class="btn btn-gold" href="${DONATE}" target="_blank" rel="noopener">${icon('heart')}Donar</a>
    <button class="burger" data-open-menu aria-label="Abrir menú">${icon('menu', 'icon')}</button>
  </div>
</div></header>
<div class="mobilenav" aria-label="Menú móvil">
  <div class="top"><strong style="font-family:var(--serif);font-size:1.6rem">Menú</strong><button data-close-menu aria-label="Cerrar">${icon('close')}</button></div>
  <details open><summary>Inicio<span>+</span></summary><a href="${r}inicio.html">Portada</a><a href="${L('noticias')}">Noticias</a><a href="${L('contacto')}">Contacto</a></details>
  ${mobile}
  <a class="btn btn-gold" href="${DONATE}" target="_blank" rel="noopener">Donar</a>
</div>
<main>
${body}
</main>
<footer class="footer"><div class="wrap">
  <div class="footer-grid">
    <div>
      <a class="brand" href="${r}inicio.html"><img src="${r}${IMGS.logo}" alt=""><span class="brand-text"><small>Arquidiócesis de</small><strong>Morelia</strong></span></a>
      <address>
        <div>${icon('pin')}<span>Costado Pte. de Catedral s/n, Apartado Postal 25<br>58000 Morelia, Michoacán, México</span></div>
        <div>${icon('phone')}<span>(443) 312 2936 · (443) 312 0523</span></div>
        <div>${icon('mail')}<a href="mailto:contacto@arquimorelia.org">contacto@arquimorelia.org</a></div>
        <div>${icon('clock')}<span>Lunes a viernes, 9:30 am – 4:00 pm</span></div>
      </address>
    </div>
    <div><h4>Arzobispado</h4><ul>${SECTIONS[0].links.map(([s, t]) => `<li><a href="${L(s)}">${t}</a></li>`).join('')}<li><a href="${L('historia')}">Historia</a></li></ul></div>
    <div><h4>Directorio</h4><ul>${SECTIONS[1].links.slice(0, 6).map(([s, t]) => `<li><a href="${L(s)}">${t}</a></li>`).join('')}</ul></div>
    <div><h4>Servicios</h4><ul><li><a href="${L('tramites')}">Trámites</a></li><li><a href="${L('descargas')}">Descargas</a></li><li><a href="${L('comunicados')}">Comunicados</a></li><li><a href="${L('agenda')}">Agenda</a></li><li><a href="${L('contacto')}">Contacto</a></li><li><a href="${DONATE}" target="_blank" rel="noopener">Donativos</a></li></ul></div>
    <div><h4>Enlaces</h4><ul><li><a href="https://www.vatican.va/content/vatican/es.html" target="_blank" rel="noopener">Santa Sede</a></li><li><a href="https://cem.org.mx/" target="_blank" rel="noopener">CEM</a></li><li><a href="https://seminariodiocesanodemorelia.com/" target="_blank" rel="noopener">Seminario de Morelia</a></li><li><a href="https://www.catedraldemorelia.mx/blog/" target="_blank" rel="noopener">Catedral de Morelia</a></li><li><a href="${SOC.spotify[0]}" target="_blank" rel="noopener">Podcast</a></li></ul></div>
  </div>
  <div class="footer-bottom"><span>© 2026 Arquidiócesis de Morelia. Todos los derechos reservados.</span><span>Aviso de privacidad · Condiciones generales</span></div>
</div></footer>
<div class="proposal-tag">Propuesta de diseño · borrador</div>
<script src="${r}assets/main.js"></script>
</body>
</html>`;
}
function write(rel, html) { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html, 'utf8'); }
function fix(html, depth) { return depth ? html.replace(/(src|href)="assets\//g, `$1="${'../'.repeat(depth)}assets/`) : html; }

function pageHero(title, crumbs, image, depth, extra = '') {
  const r = '../'.repeat(depth);
  return `<section class="page-hero">${image ? `<img src="${r}${image}" alt="">` : ''}<div class="wrap">
  <div class="crumbs"><a href="${r}inicio.html">Inicio</a>${crumbs.map(([t, h]) => ` / ${h ? `<a href="${r}${h}">${esc(t)}</a>` : esc(t)}`).join('')}</div>
  <h1>${esc(title)}</h1>${extra}</div></section>`;
}
function sidebar(slug, depth) {
  const r = '../'.repeat(depth);
  const sec = sectionOf(slug);
  const nav = sec ? `<div class="side-card"><h4>${sec.label}</h4><nav class="side-nav">${sec.links.map(([s, t]) => `<a class="${s === slug ? 'current' : ''}" href="${r}${pageFile(s)}">${esc(t)}${icon('arrow', 'icon')}</a>`).join('').replace(/class="icon"/g, 'class="icon" style="width:16px;opacity:.5"')}</nav></div>` : '';
  return `<aside class="sidebar">${nav}
    <div class="side-card cta"><h4>¿Necesitas ayuda?</h4><p>Oficinas del Arzobispado: lunes a viernes de 9:30 am a 4:00 pm.</p><a class="btn btn-gold" href="${r}contacto.html">Contáctanos</a></div>
    <div class="side-card"><h4>Apoya la misión</h4><p style="font-size:.92rem;color:var(--ink-2)">Tu donativo sostiene la labor pastoral y social de la Iglesia en Michoacán.</p><a class="link-arrow" href="${DONATE}" target="_blank" rel="noopener">Donar ahora ${icon('arrow')}</a></div>
  </aside>`;
}
function gallery(imgs, depth) {
  if (!imgs.length) return '';
  const r = '../'.repeat(depth);
  return `<div class="gallery">${imgs.map(i => `<a href="${r}${i.big}"><img src="${r}${i.small}" alt="" loading="lazy"></a>`).join('')}</div>`;
}

// ---------------- datos del blog ----------------
async function loadBlog() {
  let dates = {};
  try {
    const xml = await (await fetch('https://www.arquimorelia.org/blog-posts-sitemap.xml')).text();
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) dates[decodeURIComponent(new URL(encodeURI(m[1])).pathname).split('/').pop().normalize('NFC')] = m[2];
  } catch (e) { console.log('sin fechas', e.message); }
  const cats = {};
  const CATNAMES = { 'blogacontecer': 'Acontecer', 'conajum': 'CONAJUM', 'homilía-dominical': 'Homilía dominical', 'la-voz-del-arzobispo': 'La voz del Arzobispo', 'noticias-de-la-arquidiócesis': 'Noticias' };
  for (const c of fs.readdirSync(path.join(SRC, 'blog-categorias'))) {
    const t = readTxt(path.join(SRC, 'blog-categorias', c));
    if (!t) continue;
    for (const b of t.blocks) if (b.type === 'h') (cats[b.text.trim()] ||= new Set()).add(slugify(c));
  }
  const posts = [];
  for (const d of fs.readdirSync(path.join(SRC, 'blog'))) {
    const dir = path.join(SRC, 'blog', d);
    const t = readTxt(dir);
    if (!t || t.blocks.length < 2) continue;
    const imgs = pageImages(dir);
    let sub = '';
    const b1 = t.blocks.findIndex(b => b.type === 'p');
    if (b1 >= 0 && t.blocks[b1].text.length < 90) sub = t.blocks[b1].text;
    const set = new Set(cats[t.title.trim()] || []);
    if (/santoral/i.test(sub)) set.add('santoral');
    if (/homil/i.test(t.title + sub)) set.add('homilia-dominical');
    set.delete('blogacontecer');
    if (!set.size) set.add('acontecer');
    const catLabel = { 'santoral': 'Santoral', 'homilia-dominical': 'Homilía dominical', 'la-voz-del-arzobispo': 'La voz del Arzobispo', 'noticias-de-la-arquidiocesis': 'Noticias', 'conajum': 'CONAJUM', 'acontecer': 'Acontecer' }[[...set][0]];
    posts.push({ slug: slugify(d), title: t.title, sub, blocks: t.blocks, url: t.url, cats: [...set], catLabel,
      date: dates[d.normalize('NFC')] || '', excerpt: clip(firstPara(t.blocks.filter(b => b.text !== sub)) || sub, 180), imgPaths: imgs });
  }
  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return posts;
}
const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
function postCard(p, depth = 0) {
  const r = '../'.repeat(depth);
  return `<a class="card" data-cat="${p.cats.join(' ')}" href="${r}noticias/${p.slug}.html">
    <div class="card-img">${p.cover ? `<img src="${r}${p.cover}" alt="" loading="lazy">` : ''}</div>
    <div class="card-body"><span class="tag">${esc(p.catLabel)}</span><h3>${esc(p.title.replace(/^["“]|["”]$/g, ''))}</h3><p>${esc(p.excerpt)}</p><span class="meta">${fmtDate(p.date)}</span></div></a>`;
}

// ---------------- build ----------------
(async () => {
  const posts = await loadBlog();
  console.log('posts', posts.length);
  for (const p of posts) {
    p.cover = p.imgPaths[0] ? img(p.imgPaths[0], 800) : null;
    p.gallery = p.imgPaths.map(f => ({ small: img(f, 800), big: img(f, 1600) })).filter(x => x.small);
  }
  const withCover = posts.filter(p => p.cover);

  // ===== HOME =====
  const inicio = readTxt(P('inicio'));
  const welcome = inicio.blocks.find(b => b.text.startsWith('Por la gracia')).text;
  const historia = readTxt(P('historia'));
  const santos = readTxt(P('santospatrones'));
  const pastoralCards = SECTIONS[3].links.map(([s, t]) => {
    const d = readTxt(P(s)); const ims = pageImages(P(s));
    return { s, t, desc: clip(firstPara(d.blocks), 110), im: ims[0] ? img(ims[0], 900) : IMGS.group };
  });
  const evento = readTxt(path.join(SRC, 'eventos', fs.readdirSync(path.join(SRC, 'eventos'))[0]));
  const tabsCats = [['all', 'Todas'], ['noticias-de-la-arquidiocesis', 'Noticias'], ['la-voz-del-arzobispo', 'La voz del Arzobispo'], ['homilia-dominical', 'Homilía dominical'], ['santoral', 'Santoral'], ['conajum', 'CONAJUM']];

  const home = `
<section class="hero">
  <div class="hero-slide active" data-caption="Morelia, Michoacán"><img src="${IMGS.heroCross}" alt="Vista de Morelia"></div>
  <div class="hero-slide" data-caption="Catedral de Morelia"><img src="${IMGS.heroStreet}" alt=""></div>
  <div class="hero-slide" data-caption="Catedral de Morelia de noche"><img src="${IMGS.heroNight}" alt=""></div>
  <div class="wrap"><div class="hero-content">
    <span class="eyebrow">Arquidiócesis de Morelia</span>
    <h1>Caminar juntos como <em>Pueblo de Dios</em></h1>
    <p class="lead">Más de dos millones y medio de fieles católicos, unidos en la fe desde 1536. ¡Estamos para servirte!</p>
    <div class="hero-actions"><a class="btn btn-gold" href="parroquias.html">${icon('search')}Encuentra tu parroquia</a><a class="btn btn-ghost" href="arzobispo.html">Mensaje del Arzobispo ${icon('arrow')}</a></div>
  </div></div>
  <div class="hero-caption">Morelia, Michoacán</div>
  <div class="hero-dots"><button class="active" aria-label="1"></button><button aria-label="2"></button><button aria-label="3"></button></div>
</section>

<section class="finder"><div class="wrap"><div class="finder-card">
  <div class="finder-search">
    <h2>Encuentra una parroquia</h2>
    <p>Busca por nombre, colonia o municipio y consulta horarios de misa y contacto.</p>
    <form class="finder-form" action="parroquias.html" data-proto="finder">
      <label class="field">${icon('search')}<input type="search" placeholder="Ej. Catedral, Pátzcuaro, Uruapan…" aria-label="Buscar parroquia"></label>
      <button class="btn btn-wine" type="submit">Buscar</button>
    </form>
  </div>
  <div class="finder-quick">
    <a href="tramites.html">${icon('doc')}Trámites<small>Requisitos de sacramentos</small></a>
    <a href="agenda.html">${icon('calendar')}Agenda<small>Eventos y celebraciones</small></a>
    <a href="noticias.html">${icon('book')}Noticias<small>Acontecer diocesano</small></a>
    <a href="${DONATE}" target="_blank" rel="noopener">${icon('heart')}Donar<small>Apoya la misión</small></a>
  </div>
</div></div></section>

<section class="quicklinks"><div class="wrap">
  <div class="ql-head"><span class="eyebrow">Para tu vida de fe</span><h2>Alimenta tu fe cada día</h2></div>
<div class="ql-grid">
  <a class="ql" style="--i:0" href="https://www.vaticannews.va/es/evangelio-de-hoy.html" target="_blank" rel="noopener"><span class="ql-ico">${icon('sun')}</span><strong>Evangelio del día</strong><small data-ql-today>Lecturas de hoy</small><span class="ql-go" aria-hidden="true">Abrir<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></span><span class="sr-only"> (se abre en otra pestaña)</span></a>
  <a class="ql" style="--i:1" href="https://www.vatican.va/archive/ESL0506/_INDEX.HTM" target="_blank" rel="noopener"><span class="ql-ico">${icon('book')}</span><strong>Biblia</strong><small>Sagrada Escritura</small><span class="ql-go" aria-hidden="true">Abrir<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></span><span class="sr-only"> (se abre en otra pestaña)</span></a>
  <a class="ql" style="--i:2" href="https://www.vatican.va/archive/catechism_sp/index_sp.html" target="_blank" rel="noopener"><span class="ql-ico"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h13"/><path d="M12 6.5v8M9.5 9h5"/></svg></span><strong>Catecismo</strong><small>De la Iglesia Católica</small><span class="ql-go" aria-hidden="true">Abrir<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></span><span class="sr-only"> (se abre en otra pestaña)</span></a>
  <a class="ql" style="--i:3" href="https://www.vaticannews.va/es/santos.html" target="_blank" rel="noopener"><span class="ql-ico"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="3.5" rx="4" ry="1.5"/><circle cx="12" cy="9" r="3.2"/><path d="M5 21v-1.5A5.5 5.5 0 0 1 10.5 14h3a5.5 5.5 0 0 1 5.5 5.5V21"/></svg></span><strong>Santoral</strong><small data-ql-today>Santo del día</small><span class="ql-go" aria-hidden="true">Abrir<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></span><span class="sr-only"> (se abre en otra pestaña)</span></a>
  <a class="ql" style="--i:4" href="https://www.vaticannews.va/es.html" target="_blank" rel="noopener"><span class="ql-ico">${icon('globe')}</span><strong>Vatican News</strong><small>Noticias del Papa</small><span class="ql-go" aria-hidden="true">Abrir<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></span><span class="sr-only"> (se abre en otra pestaña)</span></a>
  <a class="ql" style="--i:5" href="https://cem.org.mx/" target="_blank" rel="noopener"><span class="ql-ico">${icon('church')}</span><strong>CEM</strong><small>Episcopado Mexicano</small><span class="ql-go" aria-hidden="true">Abrir<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></span><span class="sr-only"> (se abre en otra pestaña)</span></a>
</div></div></section>

<section class="section"><div class="wrap">
  <div class="pastor-grid">
    <div class="pastor-photo"><img src="${IMGS.arzPortrait}" alt="Mons. José Armando Álvarez Cano"><div class="pastor-badge"><small>X Arzobispo de Morelia</small><strong>Mons. José Armando Álvarez Cano</strong></div></div>
    <div>
      <span class="eyebrow">Palabra del Pastor</span>
      <h2>Bienvenidos a la casa de todos</h2>
      <blockquote class="quote">“${esc(welcome)}”</blockquote>
      <p style="color:var(--ink-2)">Originario de Jiquilpan, Michoacán, fue nombrado Arzobispo de Morelia por Su Santidad el Papa León XIV el 19 de enero de 2026, tras servir como Obispo de Huautla y de Tampico.</p>
      <div class="pastor-links">
        <a class="btn btn-wine" href="arzobispo.html">Conoce a nuestro Arzobispo</a>
        <a class="btn btn-outline" href="noticias.html?cat=homilia-dominical">Homilía dominical</a>
      </div>
    </div>
  </div>
</div></section>

<section class="section" style="background:var(--cantera);padding-top:88px"><div class="wrap">
  <div class="section-head"><div><span class="eyebrow">Acontecer</span><h2>Noticias de la Arquidiócesis</h2></div>
    <div class="tabs" data-tabs="#home-news" data-limit="5">${tabsCats.map(([c, t], i) => `<button class="tab${i ? '' : ' active'}" data-cat="${c}">${t}</button>`).join('')}</div></div>
  <div class="news-grid" id="home-news">${withCover.map((p, i) => postCard(p).replace('class="card"', `class="card${i === 0 ? ' featured' : ''}"${i >= 5 ? ' hidden' : ''}`)).join('')}</div>
  <div style="text-align:center;margin-top:40px"><a class="btn btn-outline" href="noticias.html">Ver todas las noticias ${icon('arrow')}</a></div>
</div></section>

<section class="stats"><div class="stats-bg" style="background-image:url('${IMGS.heroNight}')"></div><div class="wrap">
  <div class="stat"><strong>1536</strong><span>Erigida por el Papa Paulo III como Diócesis de Michoacán</span></div>
  <div class="stat"><strong>4ª</strong><span>Diócesis más antigua de México</span></div>
  <div class="stat"><strong>+2.5 M</strong><span>Fieles católicos en la Arquidiócesis</span></div>
  <div class="stat"><strong>5</strong><span>Diócesis forman la Provincia Eclesiástica de Morelia</span></div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><div><span class="eyebrow">Sacramentos</span><h2>Trámites y sacramentos</h2></div><p>Consulta los requisitos generales antes de acudir a tu parroquia. Cada comunidad te orientará sobre fechas, pláticas y pagos.</p></div>
  <div class="sac-grid">${TRAMITES.map(([s, t, ic, d]) => `<a class="sac" href="tramites/${slugify(s)}.html"><span class="ico">${icon(ic)}</span><div><h3>${t}</h3><p>${d}</p></div></a>`).join('')}</div>
</div></section>

<section class="section pastoral"><div class="wrap">
  <div class="section-head"><div><span class="eyebrow">Organización pastoral</span><h2>Una Iglesia en salida</h2></div><p>Dimensiones que animan, orientan y articulan la acción evangelizadora en comunión con el Plan Diocesano de Pastoral.</p></div>
  <div class="past-grid">${pastoralCards.slice(0, 7).map((c, i) => `<a class="past${i === 0 ? ' wide' : ''}" href="${c.s}.html"><img src="${c.im}" alt="" loading="lazy"><div><h3>${esc(c.t)}</h3><p>${esc(c.desc)}</p></div></a>`).join('')}</div>
</div></section>

<section class="section" style="padding-top:0;background:#fff"><div class="wrap">
  <div class="heritage-grid">
    <a class="heritage" href="historia.html"><img src="${IMGS.catDay}" alt="" loading="lazy"><div><span class="eyebrow" style="color:var(--gold-300)">Desde 1536</span><h3>La obra de Don Vasco</h3><p>${esc(clip(firstPara(historia.blocks), 200))}</p><span class="link-arrow">Nuestra historia ${icon('arrow')}</span></div></a>
    <a class="heritage" href="santospatrones.html"><img src="${IMGS.virgen}" alt="" loading="lazy"><div><span class="eyebrow" style="color:var(--gold-300)">Patrona principal</span><h3>María Inmaculada de la Salud</h3><p>${esc(clip(firstPara(santos.blocks), 200))}</p><span class="link-arrow">Santos patrones ${icon('arrow')}</span></div></a>
  </div>
</div></section>

<section class="section" style="background:var(--cantera)"><div class="wrap">
  <div class="section-head"><div><span class="eyebrow">Comunidad</span><h2>Agenda y medios</h2></div><a class="link-arrow" href="agenda.html">Ver agenda completa ${icon('arrow')}</a></div>
  <div class="am-grid">
    <div class="event"><div class="date"><b>05</b><span>may 2026</span></div><div><span class="tag">Tiempo litúrgico</span><h3 style="font-size:1.45rem;margin:4px 0">${esc(evento.title)}</h3><p style="color:var(--ink-2);font-size:.92rem">Celebremos juntos el Tiempo de Pascua. Consulta la agenda para más celebraciones, retiros y actividades comunitarias.</p><a class="link-arrow" href="agenda.html">Detalles ${icon('arrow')}</a></div></div>
    <div class="media-card spotify"><div><span class="eyebrow" style="color:#9be3b4">Podcast</span><h3>Escucha la reflexión diaria</h3><p>Reflexión diaria y homilía dominical de Mons. Álvarez, ahora también en audio.</p></div><a class="btn btn-ghost" href="${SOC.spotify[0]}" target="_blank" rel="noopener">${icon('mic')}Escuchar en Spotify</a></div>
    <div class="media-card social"><div><span class="eyebrow" style="color:var(--gold-300)">Síguenos</span><h3>#ArquiMorelia</h3><p>Transmisiones, avisos y la vida de nuestras comunidades en redes sociales.</p></div><div class="social-row">${social('facebook')}${social('instagram')}${social('tiktok')}${social('x')}${social('spotify')}</div></div>
  </div>
</div></section>

<section class="donate"><img src="${IMGS.heroCross}" alt="" loading="lazy"><div class="wrap">
  <div><span class="eyebrow">Donativos</span><h2>Tu generosidad sostiene la misión</h2><p>Con tu aportación apoyas la evangelización, la formación de sacerdotes y la atención a los más necesitados en toda la Arquidiócesis.</p></div>
  <div class="donate-box"><strong style="font-family:var(--serif);font-size:1.5rem">Haz un donativo seguro</strong><div class="amounts"><span>$200</span><span>$500</span><span>$1,000</span></div><a class="btn btn-gold" href="${DONATE}" target="_blank" rel="noopener">${icon('heart')}Donar ahora</a></div>
</div></section>

<section class="newsletter"><div class="wrap"><div><span class="eyebrow">Boletín</span><h2>Recibe noticias y mensajes del Arzobispo</h2></div>
  <form data-proto="news"><input type="email" placeholder="Tu correo electrónico" aria-label="Correo" required><button class="btn btn-wine" type="submit">Suscribirme</button></form></div></section>`;
  write('inicio.html', layout({ title: 'Inicio', desc: 'Sitio oficial de la Arquidiócesis de Morelia (propuesta).', body: home }));

  // ===== LOGIN (index.html) =====
  write('index.html', `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Acceso a la propuesta | Arquidiócesis de Morelia</title>
<link rel="icon" href="${IMGS.logo}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/styles.css">
<style>
  body{min-height:100vh;display:grid;grid-template-columns:1.15fr 1fr;background:var(--cream)}
  .login-art{position:relative;overflow:hidden;color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:48px 56px;background:var(--wine-900)}
  .login-art .slide{position:absolute;inset:0;opacity:0;transition:opacity 1.6s ease}
  .login-art .slide.on{opacity:1}
  .login-art .slide img{width:100%;height:100%;object-fit:cover;transform:scale(1.08);transition:transform 9s ease}
  .login-art .slide.on img{transform:scale(1)}
  .login-art::after{content:"";position:absolute;inset:0;background:linear-gradient(160deg,rgba(30,8,14,.55),rgba(30,8,14,.88) 70%)}
  .login-art>*:not(.slide){position:relative;z-index:2}
  .login-art .brand strong{color:#fff}.login-art .brand small{color:#e5d3cc}
  .login-art h1{color:#fff;font-size:clamp(2.4rem,4vw,3.8rem);max-width:560px;margin-bottom:18px}
  .login-art h1 em{color:var(--gold-300)}
  .login-art p{color:#f0e3de;max-width:480px;font-size:1.05rem}
  .login-art .features{display:flex;gap:28px;flex-wrap:wrap;margin-top:28px;font-size:.88rem;color:#ecdcd6}
  .login-art .features span{display:flex;align-items:center;gap:8px}
  .login-art .features .icon{color:var(--gold-300);width:18px;height:18px}
  .login-panel{display:flex;align-items:center;justify-content:center;padding:48px 24px}
  .login-card{width:100%;max-width:420px}
  .login-card .seal{width:84px;height:84px;border-radius:50%;box-shadow:var(--shadow);margin-bottom:26px;background:#fff}
  .login-card h2{font-size:2.5rem;margin-bottom:6px}
  .login-card>p{color:var(--muted);margin-bottom:30px}
  .fld{display:block;margin-bottom:18px}
  .fld span{display:block;font-size:.82rem;font-weight:600;color:var(--ink-2);margin-bottom:8px}
  .fld .box{display:flex;align-items:center;gap:10px;border:1.5px solid var(--line);border-radius:12px;padding:0 16px;background:#fff;transition:.2s}
  .fld .box:focus-within{border-color:var(--gold);box-shadow:0 0 0 4px rgba(195,154,62,.15)}
  .fld .box .icon{color:var(--muted);width:20px;flex-shrink:0}
  .fld input{border:0;outline:none;font:inherit;padding:14px 0;width:100%;background:transparent;color:var(--ink)}
  .fld button{background:none;border:0;cursor:pointer;color:var(--muted);font:600 .8rem var(--sans);padding:6px}
  .row{display:flex;justify-content:space-between;align-items:center;margin:4px 0 26px;font-size:.88rem;color:var(--ink-2)}
  .row label{display:flex;gap:8px;align-items:center;cursor:pointer}
  .row input{accent-color:var(--wine);width:16px;height:16px}
  .login-card .btn{width:100%;justify-content:center;padding:16px;font-size:1rem}
  .err{display:none;background:#fdecee;color:#8a1c2c;border:1px solid #f3c4cb;border-radius:10px;padding:12px 14px;font-size:.88rem;margin-bottom:18px}
  .err.show{display:block;animation:shake .35s}
  @keyframes shake{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
  .login-foot{margin-top:34px;padding-top:22px;border-top:1px solid var(--line);font-size:.8rem;color:var(--muted);display:flex;gap:10px;align-items:flex-start}
  .login-foot .icon{width:18px;height:18px;color:var(--gold);flex-shrink:0}
  @media (max-width:900px){body{grid-template-columns:1fr}.login-art{min-height:300px;padding:28px 22px}.login-art h1{font-size:2.2rem}.login-art .features{display:none}.login-panel{padding:36px 16px 48px}}
</style>
</head>
<body>
<section class="login-art">
  <div class="slide on"><img src="${IMGS.heroCross}" alt=""></div>
  <div class="slide"><img src="${IMGS.heroStreet}" alt=""></div>
  <div class="slide"><img src="${IMGS.virgen}" alt=""></div>
  <a class="brand" href="#"><img src="${IMGS.logo}" alt=""><span class="brand-text"><small>Arquidiócesis de</small><strong>Morelia</strong></span></a>
  <div>
    <span class="eyebrow" style="color:var(--gold-300)">Propuesta de rediseño 2026</span>
    <h1>Un nuevo sitio para <em>caminar juntos</em></h1>
    <p>Presentación privada del nuevo sitio web de la Arquidiócesis de Morelia: diseño moderno, información organizada y servicios al alcance de los fieles.</p>
    <div class="features"><span>${icon('church')}Directorio de parroquias</span><span>${icon('doc')}Trámites y requisitos</span><span>${icon('book')}116 noticias</span></div>
  </div>
  <small style="color:rgba(255,255,255,.6)">Borrador para revisión · No es el sitio oficial</small>
</section>
<main class="login-panel">
  <form class="login-card" id="login" autocomplete="on" novalidate>
    <img class="seal" src="${IMGS.logo}" alt="">
    <h2>Bienvenido</h2>
    <p>Inicia sesión para ver la propuesta.</p>
    <div class="err" id="err" role="alert">Usuario o contraseña incorrectos. Inténtalo de nuevo.</div>
    <label class="fld"><span>Usuario</span><div class="box">${icon('users')}<input id="user" name="username" autocomplete="username" required autofocus></div></label>
    <label class="fld"><span>Contraseña</span><div class="box"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><input id="pass" type="password" name="password" autocomplete="current-password" required><button type="button" id="toggle" aria-label="Mostrar contraseña">Ver</button></div></label>
    <div class="row"><label><input type="checkbox" id="remember"> Recordarme en este equipo</label></div>
    <button class="btn btn-wine" type="submit">Entrar ${icon('arrow')}</button>
    <div class="login-foot">${icon('pin')}<span>Acceso restringido a personas autorizadas. ¿No tienes acceso? Solicítalo a quien te compartió esta propuesta.</span></div>
  </form>
</main>
<script>
(function(){
  var H='${LOGIN_HASH}', q=new URLSearchParams(location.search);
  function store(){try{return localStorage.getItem('am_auth')||sessionStorage.getItem('am_auth')}catch(e){return null}}
  function next(){var n=q.get('next')||'';return /^[\\w\\-\\/\\.%?=&]+\\.html([?].*)?$/.test(n)&&n.indexOf('//')<0&&n.indexOf('index.html')<0?n:'inicio.html'}
  if(q.get('logout')){try{localStorage.removeItem('am_auth');sessionStorage.removeItem('am_auth')}catch(e){}history.replaceState(null,'',location.pathname)}
  else if(store()===H){location.replace(next());return}
  var s=document.querySelectorAll('.login-art .slide'),i=0;setInterval(function(){s[i].classList.remove('on');i=(i+1)%s.length;s[i].classList.add('on')},6000);
  var p=document.getElementById('pass');
  document.getElementById('toggle').onclick=function(){var v=p.type==='password';p.type=v?'text':'password';this.textContent=v?'Ocultar':'Ver'};
  async function sha(t){var b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0')}).join('')}
  document.getElementById('login').addEventListener('submit',async function(e){
    e.preventDefault();var err=document.getElementById('err');err.classList.remove('show');
    var h=await sha(document.getElementById('user').value.trim().toLowerCase()+':'+p.value);
    if(h===H){try{(document.getElementById('remember').checked?localStorage:sessionStorage).setItem('am_auth',h)}catch(e){}location.replace(next())}
    else{void err.offsetWidth;err.classList.add('show');p.value='';p.focus()}
  });
})();
</script>
</body>
</html>`);

  // ===== páginas internas genéricas =====
  const HERO_FALLBACK = { arzobispado: IMGS.arzMass, directorio: IMGS.catDay, pastoral: IMGS.group, documentos: IMGS.darkCat, historia: IMGS.heroStreet };
  const TITLES = Object.fromEntries(SECTIONS.flatMap(s => s.links.map(l => [l[0], l[1]])));
  const SKIP = new Set(['inicio', 'parroquias', 'event-list', 'blogacontecer', 'directorio', 'descargas', 'contacto', 'comunicados', 'subsidiosliturgicos', 'vicariapastoral', 'subsidiosevangelizacion', 'zonapastoral', 'estadisticas']);
  for (const d of fs.readdirSync(path.join(SRC, 'paginas'))) {
    if (SKIP.has(d)) continue;
    const t = readTxt(P(d)); if (!t) continue;
    const sec = sectionOf(d);
    const ims = pageImages(P(d)).map(f => ({ small: img(f, 800), big: img(f, 1600) })).filter(x => x.small);
    const title = TITLES[d] || t.title;
    const heroImg = ims[0] ? ims[0].big : HERO_FALLBACK[sec?.key] || IMGS.heroStreet;
    const body = `${pageHero(title, sec ? [[sec.label, pageFile(sec.links[0][0])], [title]] : [[title]], heroImg, 0)}
<div class="wrap page-body"><article class="prose">${renderBlocks(t.blocks, { skipTitle: title })}${gallery(ims.slice(1), 0)}</article>${sidebar(d, 0)}</div>`;
    write(d + '.html', layout({ title, desc: clip(firstPara(t.blocks), 150), body, active: sec?.key }));
  }

  // ===== páginas con contenido especial =====
  const simple = (slug, title, heroImg, inner, secKey) => {
    const sec = sectionOf(slug);
    write(slug + '.html', layout({ title, body: `${pageHero(title, sec ? [[sec.label, pageFile(sec.links[0][0])], [title]] : [[title]], heroImg, 0)}<div class="wrap page-body"><article class="prose">${inner}</article>${sidebar(slug, 0)}</div>`, active: secKey || sec?.key }));
  };
  const docLink = (href, t, sub, ic = 'file') => `<a class="doc" href="${href}" target="_blank" rel="noopener"><span class="ico">${icon(ic)}</span><span><strong>${esc(t)}</strong><small>${esc(sub)}</small></span></a>`;
  const ugd = f => 'https://www.arquimorelia.org/_files/ugd/' + f;
  const filesOf = d => { const p = path.join(P(d), 'archivos'); return fs.existsSync(p) ? fs.readdirSync(p).sort() : []; };
  const sizeOf = (d, f) => (fs.statSync(path.join(P(d), 'archivos', f)).size / 1048576).toFixed(1) + ' MB';
  const docsFrom = (d) => { const t = readTxt(P(d)); return t.blocks.filter(b => b.type === 'p' && !/^(Otros subsidios|VICARÍA|Hemeroteca)/i.test(b.text)).map(b => b.text); };
  const sub = docsFrom('subsidiosliturgicos'), vic = docsFrom('vicariapastoral');
  const subDocs = filesOf('subsidiosliturgicos').map((f, i) => docLink(ugd(f), sub[i] || 'Subsidio litúrgico', 'PDF · ' + sizeOf('subsidiosliturgicos', f)));
  const vicDocs = filesOf('vicariapastoral').map((f, i) => docLink(ugd(f), vic[i] || 'Catequesis', 'Presentación PowerPoint · ' + sizeOf('vicariapastoral', f)));
  const comDocs = filesOf('comunicados').map(f => docLink(ugd(f), 'Comunicado oficial', 'PDF · ' + sizeOf('comunicados', f)));
  const pairNote = '<div class="notice">Nota de la propuesta: los títulos de los documentos se asignaron en el orden en que aparecen en el sitio actual; conviene verificarlos antes de publicar.</div>';
  simple('subsidiosliturgicos', 'Subsidios Litúrgicos', IMGS.darkCat, `<p class="lead">Materiales para preparar y vivir dignamente las celebraciones litúrgicas en parroquias y comunidades.</p><div class="docs">${subDocs.join('')}</div>${pairNote}`);
  simple('vicariapastoral', 'Catequesis de la Vicaría de Pastoral', IMGS.group, `<p class="lead">Catequesis para la Semana de la Familia, preparadas por la Vicaría de Pastoral.</p><div class="docs">${vicDocs.join('')}</div>${pairNote}`);
  simple('comunicados', 'Comunicados', IMGS.darkCat, `<p class="lead">Avisos y comunicados oficiales de la Arquidiócesis de Morelia.</p><div class="docs">${comDocs.join('')}</div><div class="notice">Propuesta: esta sección puede alimentarse como un listado fechado (número, fecha, título y PDF), igual que la sección de circulares de otras arquidiócesis.</div>`);
  simple('subsidiosevangelizacion', 'Comunidad Cristiana', IMGS.darkCat, `<p class="lead">Hemeroteca digital del semanario <em>Comunidad Cristiana</em>.</p><div class="notice">Propuesta: un archivo con las portadas de cada edición, ordenado por año, y descarga en PDF.</div>`);
  simple('descargas', 'Centro de descargas', IMGS.darkCat, `<p class="lead">Todos los documentos y materiales de la Arquidiócesis en un solo lugar.</p>
    <h2>Subsidios litúrgicos</h2><div class="docs">${subDocs.join('')}</div>
    <h2>Catequesis — Semana de la Familia</h2><div class="docs">${vicDocs.join('')}</div>
    <h2>Comunicados</h2><div class="docs">${comDocs.join('')}</div>`, 'documentos');
  simple('zonapastoral', 'Zonas Pastorales', IMGS.catDay, `<p class="lead">Encuentra la información importante de las zonas pastorales de la Arquidiócesis. Si necesitas apoyo, con gusto te atendemos.</p><div class="notice">Propuesta: un mapa interactivo de Michoacán con las zonas pastorales y sus decanatos; al elegir una zona se listan sus parroquias. (El sitio actual aún no publica estos datos.)</div>`);
  simple('estadisticas', 'Estadísticas', IMGS.heroNight, `<p class="lead">La Arquidiócesis de Morelia en cifras.</p><ul><li>Erigida el 8 de agosto de 1536 por el Papa Paulo III como Diócesis de Michoacán.</li><li>Cuarta diócesis más antigua de México.</li><li>Más de dos millones y medio de fieles católicos.</li><li>Sede de la Provincia Eclesiástica de Morelia, formada por 5 diócesis.</li></ul><div class="notice">Propuesta: tarjetas con número de parroquias, sacerdotes, seminaristas, religiosas y zonas pastorales (datos pendientes de proporcionar).</div>`);

  // parroquias (prototipo)
  write('parroquias.html', layout({ title: 'Parroquias', active: 'directorio', body: `${pageHero('Encuentra tu parroquia', [['Directorio', 'parroquias.html'], ['Parroquias']], IMGS.catDay, 0)}
<div class="wrap" style="padding:56px 24px 96px">
  <div class="finder-card" style="grid-template-columns:1fr;margin-bottom:32px"><div class="finder-search"><h2>Buscador de parroquias y horarios de misa</h2><p>Escribe el nombre de la parroquia, la colonia o el municipio.</p>
    <form class="finder-form" onsubmit="return false"><label class="field">${icon('search')}<input type="search" data-search=".list-grid .card" placeholder="Buscar…" aria-label="Buscar parroquia"></label>
    <label class="field" style="max-width:260px">${icon('pin')}<select aria-label="Zona pastoral"><option>Todas las zonas pastorales</option></select></label></form></div></div>
  <div class="notice"><strong>Módulo propuesto.</strong> El sitio actual no publica todavía el directorio de parroquias, así que aquí no se muestran datos inventados. Al cargar el directorio (nombre, dirección, teléfono, párroco, horarios de misa, zona y ubicación en mapa), cada parroquia aparecerá como una tarjeta filtrable con su propia página.</div>
  <h2 style="margin-top:48px">Mientras tanto</h2>
  <div class="list-grid">
    <a class="card" href="oficinas.html"><div class="card-body"><span class="tag">Curia</span><h3>Oficinas del Arzobispado</h3><p>Dirección, horarios y teléfonos de la Mitra.</p></div></a>
    <a class="card" href="centrosasistenciales.html"><div class="card-body"><span class="tag">Asistencia</span><h3>Centros asistenciales</h3><p>Hospitales y centros de atención de la Iglesia.</p></div></a>
    <a class="card" href="seminarios.html"><div class="card-body"><span class="tag">Formación</span><h3>Seminarios</h3><p>Seminario Menor y Mayor de Morelia.</p></div></a>
  </div>
</div>` }));

  // agenda
  write('agenda.html', layout({ title: 'Agenda', active: 'directorio', body: `${pageHero('Agenda diocesana', [['Directorio', 'parroquias.html'], ['Agenda']], IMGS.heroNight, 0)}
<div class="wrap page-body"><article class="prose"><p class="lead">Encuentra los eventos más importantes de la Arquidiócesis de Morelia: celebraciones litúrgicas, retiros, conferencias y actividades comunitarias.</p>
  <div class="event" style="margin:28px 0"><div class="date"><b>05</b><span>may 2026</span></div><div><h3 style="margin:0 0 6px">${esc(evento.title)}</h3><p style="margin:0">Martes 5 de mayo de 2026, 7:00 p.m. · Estamos en Tiempo de Pascua.</p></div></div>
  <div class="notice">Propuesta: calendario mensual con filtros (liturgia, formación, juventud, visitas pastorales) y opción de añadir eventos al calendario personal.</div></article>${sidebar('agenda', 0)}</div>` }));

  // contacto
  const contacto = `${pageHero('Contacto', [['Contacto']], IMGS.heroStreet, 0)}
<div class="wrap page-body"><article class="prose">
  <p class="lead">“Todo lo puedo en Cristo que me fortalece.” <span style="font-size:1rem;color:var(--muted)">— Filipenses 4,13</span></p>
  <div class="hub-grid" style="margin:30px 0">
    <div class="side-card"><h4>Oficina</h4><p style="margin:0">Lunes a viernes<br><strong>9:30 am – 4:00 pm</strong><br>Sábado y domingo: cerrado</p></div>
    <div class="side-card"><h4>Dirección</h4><p style="margin:0">Costado Pte. de Catedral<br>Apartado Postal 25<br>58000 Morelia, Mich.</p></div>
    <div class="side-card"><h4>Teléfono</h4><p style="margin:0">(443) 312 2936<br>(443) 312 0523</p></div>
    <div class="side-card"><h4>Correo</h4><p style="margin:0"><a href="mailto:contacto@arquimorelia.org">contacto@arquimorelia.org</a></p></div>
  </div>
  <h2>Escríbenos</h2>
  <form data-proto="contact" style="display:grid;gap:14px;max-width:640px">
    <input required placeholder="Nombre" style="padding:14px 18px;border:1.5px solid var(--line);border-radius:10px;font:inherit">
    <input required type="email" placeholder="Correo electrónico" style="padding:14px 18px;border:1.5px solid var(--line);border-radius:10px;font:inherit">
    <textarea required rows="5" placeholder="Mensaje" style="padding:14px 18px;border:1.5px solid var(--line);border-radius:10px;font:inherit"></textarea>
    <button class="btn btn-wine" type="submit" style="justify-self:start">Enviar mensaje</button>
  </form>
  <div style="margin-top:36px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line)"><iframe title="Mapa" src="https://www.google.com/maps?q=Catedral+de+Morelia&output=embed" width="100%" height="340" style="border:0" loading="lazy"></iframe></div>
</article>${sidebar('contacto', 0)}</div>`;
  write('contacto.html', layout({ title: 'Contacto', body: contacto }));

  // trámites
  write('tramites.html', layout({ title: 'Trámites', active: 'tramites', body: `${pageHero('Trámites y sacramentos', [['Trámites']], IMGS.arzMass, 0)}
<div class="wrap" style="padding:64px 24px 96px"><p class="prose lead" style="margin-bottom:36px">Requisitos generales para recibir los sacramentos. Es indispensable acercarse a la parroquia donde se desea celebrar el sacramento.</p>
<div class="sac-grid">${TRAMITES.map(([s, t, ic, d]) => `<a class="sac" href="tramites/${slugify(s)}.html"><span class="ico">${icon(ic)}</span><div><h3>${t}</h3><p>${d}</p></div></a>`).join('')}</div></div>` }));
  for (const [s, t] of TRAMITES) {
    const tx = readTxt(path.join(SRC, 'tramites', s)); if (!tx) continue;
    const slug = 'tramites/' + slugify(s);
    const ims = pageImages(path.join(SRC, 'tramites', s));
    const hero = ims[0] ? img(ims[0], 1600) : IMGS.arzMass;
    write(slug + '.html', layout({ title: t, depth: 1, active: 'tramites', body: fix(`${pageHero(tx.title, [['Trámites', 'tramites.html'], [t]], hero, 1)}<div class="wrap page-body"><article class="prose">${renderBlocks(tx.blocks, { skipTitle: tx.title })}</article>${sidebar(slug, 1)}</div>`, 0) }));
  }

  // noticias
  write('noticias.html', layout({ title: 'Noticias', active: 'noticias', body: `${pageHero('Noticias y Acontecer', [['Noticias']], IMGS.group, 0)}
<div class="wrap" style="padding:56px 24px 96px">
  <div class="section-head"><div class="tabs" data-tabs="#all-news">${tabsCats.concat([['acontecer', 'Acontecer']]).map(([c, t], i) => `<button class="tab${i ? '' : ' active'}" data-cat="${c}">${t}</button>`).join('')}</div>
  <label class="field" style="display:flex;align-items:center;gap:10px;border:1.5px solid var(--line);border-radius:999px;padding:0 18px;background:#fff;min-width:260px">${icon('search')}<input data-search="#all-news .card" placeholder="Buscar noticias…" style="border:0;padding:12px 0;font:inherit;outline:none;width:100%"></label></div>
  <div class="list-grid" id="all-news">${posts.map(p => postCard(p)).join('')}</div>
</div>
<script>(function(){var c=new URLSearchParams(location.search).get('cat');if(c){var b=document.querySelector('[data-tabs="#all-news"] [data-cat="'+c+'"]');b&&setTimeout(function(){b.click()},0)}})();</script>` }));
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const related = posts.filter(x => x !== p && x.cover && x.cats.some(c => p.cats.includes(c))).slice(0, 3);
    const hero = p.gallery[0] ? p.gallery[0].big : IMGS.heroStreet;
    const blocks = p.blocks.filter(b => b.text !== p.sub);
    const body = `${pageHero(p.title.replace(/^["“]|["”]$/g, ''), [['Noticias', 'noticias.html'], [p.catLabel]], hero, 1, `<div class="post-meta"><span>${esc(p.catLabel)}</span>${p.date ? `<span>${fmtDate(p.date)}</span>` : ''}${p.sub ? `<span>${esc(p.sub)}</span>` : ''}</div>`)}
<div class="wrap page-body"><article class="prose">${p.gallery[0] ? `<figure class="figure-lead" style="margin:0 0 36px"><img src="../${p.gallery[0].big}" alt=""></figure>` : ''}${renderBlocks(blocks, { skipTitle: p.title })}${gallery(p.gallery.slice(1), 1)}
  <div class="share"><strong>Compartir:</strong>${social('facebook')}${social('x')}<a class="link-arrow" style="margin-left:auto" href="../noticias.html">Todas las noticias ${icon('arrow')}</a></div>
  ${related.length ? `<h2 style="margin-top:56px">Te puede interesar</h2><div class="list-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${related.map(x => postCard(x, 1)).join('')}</div>` : ''}
</article>${sidebar('noticias', 1)}</div>`;
    write(`noticias/${p.slug}.html`, layout({ title: p.title, desc: p.excerpt, depth: 1, active: 'noticias', body }));
  }
  console.log('LISTO', fs.readdirSync(OUT).length, 'archivos en raíz;', posts.length, 'noticias');
})();
