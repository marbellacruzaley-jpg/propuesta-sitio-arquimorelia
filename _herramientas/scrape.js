// Scraper for arquimorelia.org (Wix). Usage: node scrape.js <outDir> [limit]
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const { Document, Packer, Paragraph, HeadingLevel, TextRun, ExternalHyperlink } = require('docx');

const BASE = 'https://www.arquimorelia.org';
const OUT = process.argv[2];
const LIMIT = process.argv[3] ? parseInt(process.argv[3]) : Infinity;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const SITEMAPS = {
  'paginas': 'pages-sitemap.xml',
  'blog': 'blog-posts-sitemap.xml',
  'blog-categorias': 'blog-categories-sitemap.xml',
  'eventos': 'event-pages-sitemap.xml',
  'tramites': 'dynamic-tramites_p_96708c5b_bba1_4925_95da_a5960d58aaf1_0_5000-sitemap.xml',
  'autores': 'member-profiles_p_author-profile-chunk-sitemap.xml',
};

const log = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchRetry(url, asBuffer = false) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 404) throw new Error('404');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) {
      if (e.message === '404' || i === 3) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

function safeName(s, max = 80) {
  s = decodeURIComponent(s).normalize('NFC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim()
    .replace(/[. ]+$/, '');
  return (s.slice(0, max) || 'inicio').replace(/[. ]+$/, '');
}

function encodeUrl(u) {
  try { return new URL(u).href; } catch { return encodeURI(u); }
}

async function sitemapUrls(file) {
  const xml = await fetchRetry(`${BASE}/${file}`);
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
}

// ---- text extraction ----
function extractBlocks($, root) {
  const blocks = [];
  const sel = 'h1,h2,h3,h4,h5,h6,p,li,blockquote';
  root.find(sel).each((_, el) => {
    const $el = $(el);
    const tag = el.tagName.toLowerCase();
    if ((tag === 'li' || tag === 'blockquote') && $el.find('p,h1,h2,h3,h4,h5,h6').length) return;
    if ($el.parents(sel).length && tag !== 'p') return;
    if (tag === 'p' && $el.parents('h1,h2,h3,h4,h5,h6,p').length) return;
    if ($el.closest('[aria-hidden="true"],nav,[data-hook="recent-post-list-item"],[data-hook="post-footer"]').length) return;
    $el.find('br').replaceWith('\n');
    const text = $el.text().replace(/​/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (!text) return;
    const links = [];
    $el.find('a[href]').each((_, a) => {
      const href = $(a).attr('href');
      if (href && /^https?:/.test(href)) links.push({ text: $(a).text().trim(), href });
    });
    const prev = blocks[blocks.length - 1];
    if (prev && prev.text === text) return;
    blocks.push({ tag, text, links });
  });
  return blocks;
}

// ---- media extraction ----
const MEDIA_RE = /static\.wixstatic\.com\/media\/([A-Za-z0-9_]+(?:~mv2)?\.(?:jpe?g|png|gif|webp|svg|bmp|tiff?|avif))/gi;
const FILE_RE = /(?:static\.wixstatic\.com\/ugd\/|\/_files\/ugd\/|ugd\/)([a-f0-9]{6}_[a-f0-9]{32}\.(?:pdf|docx?|xlsx?|pptx?|zip|mp3))/gi;

function extractMedia(html) {
  const imgs = new Set();
  for (const m of html.replace(/%7E/gi, '~').matchAll(MEDIA_RE)) imgs.add(m[1]);
  const files = new Set();
  for (const m of html.matchAll(FILE_RE)) files.add(m[1].toLowerCase());
  return { imgs: [...imgs], files: [...files] };
}

function imgFileName(id, idx) {
  const ext = path.extname(id).toLowerCase();
  return `${String(idx + 1).padStart(3, '0')}_${id.replace(/~mv2/, '').replace(/\.[^.]+$/, '')}${ext}`;
}

async function downloadAll(items, dir, makeUrl, makeName) {
  let ok = 0;
  if (!items.length) return 0;
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < items.length; i++) {
    const dest = path.join(dir, makeName(items[i], i));
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { ok++; continue; }
    try {
      const buf = await fetchRetry(makeUrl(items[i]), true);
      fs.writeFileSync(dest, buf);
      ok++;
    } catch (e) {
      log.push(`FALLO descarga ${makeUrl(items[i])}: ${e.message}`);
    }
  }
  return ok;
}

// ---- docx ----
async function writeDocx(file, title, url, blocks, extra) {
  const HL = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3, h4: HeadingLevel.HEADING_4, h5: HeadingLevel.HEADING_5, h6: HeadingLevel.HEADING_6 };
  const children = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
    new Paragraph({ children: [new TextRun({ text: 'Fuente: ', bold: true }), new ExternalHyperlink({ link: encodeUrl(url), children: [new TextRun({ text: url, style: 'Hyperlink' })] })] }),
    new Paragraph({ children: [new TextRun({ text: `Descargado: ${new Date().toISOString().slice(0, 10)}`, italics: true })] }),
    new Paragraph(''),
  ];
  const runsFor = text => text.split('\n').map((line, i) => new TextRun({ text: line, break: i ? 1 : 0 }));
  for (const b of blocks) {
    if (HL[b.tag]) children.push(new Paragraph({ heading: HL[b.tag], children: runsFor(b.text) }));
    else if (b.tag === 'li') children.push(new Paragraph({ bullet: { level: 0 }, children: runsFor(b.text) }));
    else if (b.tag === 'blockquote') children.push(new Paragraph({ indent: { left: 720 }, children: runsFor(b.text).map(r => r) }));
    else children.push(new Paragraph({ children: runsFor(b.text) }));
    for (const l of b.links) {
      if (l.href.includes('arquimorelia.org')) continue;
      children.push(new Paragraph({ indent: { left: 360 }, children: [new TextRun({ text: '↳ enlace: ', italics: true }), new ExternalHyperlink({ link: encodeUrl(l.href), children: [new TextRun({ text: l.href, style: 'Hyperlink' })] })] }));
    }
  }
  if (extra.length) {
    children.push(new Paragraph(''));
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Archivos e imágenes descargados')] }));
    for (const e of extra) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(e)] }));
  }
  const doc = new Document({ creator: 'arquimorelia.org (copia)', title, sections: [{ children }] });
  fs.writeFileSync(file, await Packer.toBuffer(doc));
  // plain-text copy as well
  fs.writeFileSync(file.replace(/\.docx$/, '.txt'),
    `${title}\nFuente: ${url}\n\n` + blocks.map(b => (HL[b.tag] ? '\n## ' : b.tag === 'li' ? '• ' : '') + b.text).join('\n\n') + '\n', 'utf8');
}

async function processPage(section, url, index) {
  const pre = process.env.RENDERED && path.join(process.env.RENDERED, decodeURIComponent(new URL(encodeUrl(url)).pathname).split('/').pop() + '.html');
  const html = pre && fs.existsSync(pre) ? fs.readFileSync(pre, 'utf8') : await fetchRetry(encodeUrl(url));
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();
  let root = $('article[data-hook="post"]').first();
  if (!root.length) root = $('#PAGES_CONTAINER').first();
  if (!root.length) root = $('main').first();
  if (!root.length) root = $('body');

  const slug = new URL(encodeUrl(url)).pathname.replace(/^\/+|\/+$/g, '') || 'inicio';
  const segs = slug.split('/');
  const name = safeName(segs[segs.length - 1] === 'profile' && segs.length > 1 ? segs[segs.length - 2] : segs.pop());
  let title = root.find('h1').first().text().trim() || $('title').text().replace(/\|.*$/, '').trim() || name;
  const dir = path.join(OUT, section, name);
  fs.mkdirSync(dir, { recursive: true });

  const blocks = extractBlocks($, root);
  const rootHtml = $.html(root);
  const { imgs, files } = extractMedia(rootHtml);

  const nImg = await downloadAll(imgs, path.join(dir, 'imagenes'),
    id => `https://static.wixstatic.com/media/${id}`, imgFileName);
  const nFiles = await downloadAll(files, path.join(dir, 'archivos'),
    f => `https://www.arquimorelia.org/_files/ugd/${f}`, f => f);

  const extra = [];
  if (nImg) extra.push(`${nImg} imagen(es) en la subcarpeta "imagenes"`);
  if (nFiles) extra.push(`${nFiles} archivo(s) descargable(s) en la subcarpeta "archivos": ${files.join(', ')}`);
  await writeDocx(path.join(dir, `${name}.docx`), title, url, blocks, extra);
  index.push({ section, title, url, folder: path.relative(OUT, dir), paragraphs: blocks.length, images: nImg, files: nFiles });
  console.log(`[${section}] ${name}: ${blocks.length} bloques, ${nImg} imgs, ${nFiles} archivos`);
}

async function processGeneral(index) {
  const html = await fetchRetry(BASE + '/');
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();
  const dir = path.join(OUT, '_general (encabezado y pie)');
  fs.mkdirSync(dir, { recursive: true });
  const notMain = (i, e) => !$(e).closest('main').length;
  const parts = [$('header').filter(notMain).first(), $('footer').filter(notMain).first()].filter(r => r.length);
  let blocks = [], imgs = new Set();
  for (const r of parts) {
    blocks.push(...extractBlocks($, r));
    extractMedia($.html(r)).imgs.forEach(i => imgs.add(i));
  }
  const nImg = await downloadAll([...imgs], path.join(dir, 'imagenes'), id => `https://static.wixstatic.com/media/${id}`, imgFileName);
  await writeDocx(path.join(dir, 'encabezado_y_pie.docx'), 'Encabezado y pie de página (común a todo el sitio)', BASE, blocks, nImg ? [`${nImg} imagen(es) en "imagenes"`] : []);
  index.push({ section: '_general', title: 'Encabezado y pie', url: BASE, folder: path.relative(OUT, dir), paragraphs: blocks.length, images: nImg, files: 0 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const index = [];
  await processGeneral(index);
  const queue = [];
  for (const [section, sm] of Object.entries(SITEMAPS)) {
    for (const u of await sitemapUrls(sm)) queue.push([section, u]);
  }
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const jobs = (only ? queue.filter(([, u]) => only.includes(decodeURIComponent(u).split('/').pop())) : queue).slice(0, LIMIT);
  console.log(`Total URLs: ${jobs.length}`);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const [s, u] = jobs[next++];
      try { await processPage(s, u, index); }
      catch (e) { log.push(`FALLO página ${u}: ${e.message}`); console.log('FALLO', u, e.message); }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  index.sort((a, b) => (a.section + a.folder).localeCompare(b.section + b.folder));
  const csv = ['seccion,titulo,url,carpeta,parrafos,imagenes,archivos',
    ...index.map(r => [r.section, r.title, r.url, r.folder, r.paragraphs, r.images, r.files].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  fs.writeFileSync(path.join(OUT, 'INDICE.csv'), '﻿' + csv, 'utf8');
  fs.writeFileSync(path.join(OUT, 'errores.log'), log.join('\n') || 'Sin errores', 'utf8');
  console.log(`LISTO. Páginas: ${index.length}, errores: ${log.length}`);
})();
