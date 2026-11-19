(function () {
  // sticky header shadow
  var header = document.querySelector('.header');
  if (header) window.addEventListener('scroll', function () { header.classList.toggle('scrolled', window.scrollY > 10); }, { passive: true });

  // mobile nav
  var mob = document.querySelector('.mobilenav');
  document.querySelectorAll('[data-open-menu]').forEach(function (b) { b.addEventListener('click', function () { mob.classList.add('open'); document.body.style.overflow = 'hidden'; }); });
  document.querySelectorAll('[data-close-menu]').forEach(function (b) { b.addEventListener('click', function () { mob.classList.remove('open'); document.body.style.overflow = ''; }); });

  // hero slider
  var slides = document.querySelectorAll('.hero-slide');
  var dots = document.querySelectorAll('.hero-dots button');
  var caption = document.querySelector('.hero-caption');
  if (slides.length > 1) {
    var i = 0, timer;
    var go = function (n) {
      slides[i].classList.remove('active'); dots[i] && dots[i].classList.remove('active');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('active'); dots[i] && dots[i].classList.add('active');
      if (caption) caption.textContent = slides[i].dataset.caption || '';
    };
    var start = function () { clearInterval(timer); timer = setInterval(function () { go(i + 1); }, 6500); };
    dots.forEach(function (d, n) { d.addEventListener('click', function () { go(n); start(); }); });
    start();
  }

  // news tabs / filters
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var target = document.querySelector(group.dataset.tabs);
    var limit = parseInt(group.dataset.limit || '0', 10);
    group.querySelectorAll('.tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        group.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var cat = tab.dataset.cat, shown = 0;
        target.querySelectorAll('.card').forEach(function (c) {
          var ok = cat === 'all' || (c.dataset.cat || '').split(' ').indexOf(cat) >= 0;
          if (ok && limit && shown >= limit) ok = false;
          c.hidden = !ok; if (ok) shown++;
          c.classList.toggle('featured', ok && shown === 1 && target.classList.contains('news-grid'));
        });
      });
    });
  });

  // search filter on listing pages
  var q = document.querySelector('[data-search]');
  if (q) {
    var items = document.querySelectorAll(q.dataset.search);
    q.addEventListener('input', function () {
      var v = q.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      items.forEach(function (it) {
        var t = it.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        it.hidden = v && t.indexOf(v) < 0;
      });
    });
  }

  // lightbox
  var lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = '<img alt="">';
  document.body.appendChild(lb);
  lb.addEventListener('click', function () { lb.classList.remove('open'); });
  document.querySelectorAll('.gallery a').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); lb.querySelector('img').src = a.getAttribute('href'); lb.classList.add('open'); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { lb.classList.remove('open'); mob && mob.classList.remove('open'); document.body.style.overflow = ''; } });

  // prototype forms
  document.querySelectorAll('form[data-proto]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (f.dataset.proto === 'finder') { var v = f.querySelector('input').value; location.href = f.getAttribute('action') + (v ? '?q=' + encodeURIComponent(v) : ''); return; }
      var b = f.querySelector('button'); b.textContent = '¡Gracias! (demostración)'; b.disabled = true;
    });
  });
  var params = new URLSearchParams(location.search);
  if (q && params.get('q')) { q.value = params.get('q'); q.dispatchEvent(new Event('input')); }
})();

/* ---------- Asistente diocesano (chatbot) ----------
   Funciona sin servidor: responde con una base de conocimiento local
   tomada del contenido público del sitio. Para editar respuestas, modifica KB. */
(function () {
  if (!document.querySelector('.header')) return; // no en la pantalla de acceso
  var me = document.currentScript || document.querySelector('script[src*="assets/main.js"]');
  var ROOT = me ? me.getAttribute('src').replace(/assets\/main\.js.*$/, '') : '';
  var DONAR = 'https://donate.stripe.com/cN2cQL0z26Sc7Nm4gg';
  function link(href, text) {
    return /^https?:/.test(href) ? '<a href="' + href + '" target="_blank" rel="noopener">' + text + '</a>' : '<a href="' + ROOT + href + '">' + text + '</a>';
  }
  function li(a) { return '<ul>' + a.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  var NOTA = '<p class="cb-note">Son requisitos generales: confirma siempre en la parroquia donde celebrarás el sacramento.</p>';
  var PADR = 'Padrinos: pláticas de formación + boleta de matrimonio eclesiástico (si son solteros, copia de INE). Por regla general no puede apadrinar quien vive en unión libre.';
  var TEL = '(443) 312 0523';

  var KB = [
    { id: 'saludo', k: ['hola', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal', 'saludos'],
      a: '¡Hola! Que la paz del Señor esté contigo. ¿En qué te puedo ayudar?',
      chips: ['Bautismo', 'Matrimonio', 'Horarios de oficina', 'Donar'] },
    { id: 'bautismo', tramite: true, k: ['bautiz', 'bautism', 'bautic'],
      a: '<strong>Bautismo de los niños</strong>' + li(['Acta de nacimiento del niño o niña.', 'Papás: comprobante de pláticas de formación.', PADR, 'Pagos en la Notaría de tu parroquia y agendar la ceremonia.']) + NOTA + link('tramites/bautismo-de-los-ninos.html', 'Ver trámite completo →'),
      chips: ['Padrinos', 'Costos', 'Encontrar parroquia'] },
    { id: 'comunion', tramite: true, k: ['primera comunion', 'comunion', 'eucarist'],
      a: '<strong>Primera Comunión</strong>' + li(['Boleta de bautismo.', 'Constancia de formación pre-sacramental (catequesis).', 'Papás: comprobante de pláticas.', PADR, 'Pagos en la Notaría de tu parroquia.']) + '<p>Suele celebrarse en forma comunitaria; también puede ser individual según la agenda de la parroquia.</p>' + NOTA + link('tramites/primera-comunion.html', 'Ver trámite completo →'),
      chips: ['Confirmación', 'Encontrar parroquia'] },
    { id: 'confirmacion', tramite: true, k: ['confirma'],
      a: '<strong>Confirmación</strong>' + li(['Boleta de bautismo y de Primera Comunión.', 'Constancia de formación pre-sacramental.', 'Papás: comprobante de pláticas.', PADR, 'Pagos en la Notaría de tu parroquia.']) + '<p>La confiere el Obispo o un Vicario Episcopal, normalmente en ceremonia comunitaria y en fechas especiales.</p>' + NOTA + link('tramites/confirmacion.html', 'Ver trámite completo →'),
      chips: ['Padrinos', 'Encontrar parroquia'] },
    { id: 'matrimonio', tramite: true, k: ['matrimonio', 'casar', 'casamos', 'boda', 'novios', 'presentacion matrimonial', 'prematrimonial'],
      a: '<strong>Matrimonio</strong>' + li(['Boleta de bautismo actualizada de cada novio (y de confirmación si no trae nota marginal).', 'INE y 2 fotos tamaño infantil.', '2 testigos por cada novio (papás o parientes directos) con identificación oficial.', 'Pláticas pre-sacramentales y pagos en la Notaría de la parroquia.']) + '<p>La presentación matrimonial debe hacerse con anticipación, y la boda se celebra en el templo.</p>' + NOTA + link('tramites/matrimonio.html', 'Ver trámite completo →'),
      chips: ['Nulidad matrimonial', 'Encontrar parroquia'] },
    { id: 'correccion', tramite: true, k: ['correg', 'correccion', 'error', 'mal escrit', 'fe de erratas', 'equivoca'],
      a: '<strong>Corrección de actas o boletas</strong><p>Cuando un dato está mal registrado (por lo general nombres o apellidos):</p>' + li(['Acude en persona al Arzobispado (Mitra), a un costado de Catedral.', 'Lleva identificación oficial.', 'Fe de erratas sellada y firmada por el párroco.', 'La boleta actualizada donde aparece el error.']) + link('tramites/correccion-de-actas-boletas.html', 'Ver trámite →'),
      chips: ['Horarios de oficina'] },
    { id: 'otros', tramite: true, k: ['otro tramite', 'otros tramites', 'constancia', 'boleta', 'acta', 'certificado', 'papeleo'],
      a: 'Las boletas de sacramentos se piden en la <strong>parroquia donde se recibió el sacramento</strong>. Para otros trámites con la Arquidiócesis, llama primero al Arzobispado en horario de oficina para que te orienten: (443) 312 0523, 312 3738 o 312 3744.<p>' + link('tramites/otros-tramites.html', 'Otros trámites →') + '</p>',
      chips: ['Corregir una boleta', 'Contacto'] },
    { id: 'padrinos', k: ['padrino', 'madrina', 'apadrinar', 'union libre'],
      a: '<strong>Requisitos para padrinos</strong>' + li(['Pláticas de formación (presentar comprobante).', 'Boleta de matrimonio eclesiástico; si son solteros, copia de INE.']) + '<p>Por regla general no puede ser padrino o madrina quien vive en unión libre.</p>' + NOTA },
    { id: 'costos', w: 2, k: ['costo', 'cuesta', 'precio', 'cobran', 'pago', 'cuanto es', 'arancel'],
      a: 'Los pagos de los sacramentos se realizan en la <strong>Notaría de cada parroquia</strong> y pueden variar. Pregunta directamente ahí.',
      chips: ['Encontrar parroquia'] },
    { id: 'misa', k: ['misa', 'parroquia', 'templo', 'iglesia cerca', 'capilla'],
      a: 'En el ' + link('parroquias.html', 'buscador de parroquias') + ' podrás encontrar dirección y horarios de misa. <em>(En esta propuesta el directorio aún está pendiente de datos.)</em><p>Para la Catedral: (443) 312 2936.</p>',
      chips: ['Catedral', 'Zonas pastorales'] },
    { id: 'catedral', k: ['catedral'],
      a: '<strong>Catedral Metropolitana de Morelia</strong><br>Av. Madero Poniente s/n, Centro Histórico.<br>Tel. (443) 312 2936<br>Oficina: lunes a viernes 10:00–13:30 y 17:00–19:00 h.<p>' + link('https://www.catedraldemorelia.mx/blog/', 'catedraldemorelia.mx') + '</p>' },
    { id: 'contacto', k: ['contact', 'telefono', 'llamar', 'correo', 'email', 'direccion', 'donde estan', 'ubicacion', 'horario', 'oficina', 'abren', 'arzobispado', 'mitra', 'curia'],
      a: '<strong>Oficinas del Arzobispado</strong><br>Costado de Catedral s/n, frente a Av. Madero, 58000 Morelia, Mich.<br>Tels. (443) 312 0523 · 312 3738 · 312 3744<br>Lunes a viernes, 9:30 a 13:30 h. Sábado y domingo cerrado.<br>Correo: contacto@arquimorelia.org<p>' + link('contacto.html', 'Escríbenos →') + ' · ' + link('oficinas.html', 'Directorio de oficinas') + '</p>' },
    { id: 'tribunal', w: 2, k: ['tribunal', 'nulidad', 'anular', 'anulacion', 'divorci'],
      a: '<strong>Tribunal Eclesiástico</strong> (procesos de nulidad matrimonial)<br>Aldama No. 138, Centro Histórico, Morelia.<br>Tels. 443 312 8858 · 443 312 1924<br>Lunes a viernes, 9:30 a 13:30 h.<br>tribunaldemorelia@gmail.com' },
    { id: 'donar', k: ['dona', 'diezmo', 'ofrenda', 'apoyar', 'aportacion', 'limosna'],
      a: 'Gracias por tu generosidad. Tu donativo sostiene la labor pastoral y social de la Iglesia en Michoacán.<p>' + link(DONAR, 'Donar en línea →') + '</p>' },
    { id: 'arzobispo', k: ['arzobispo', 'obispo', 'armando', 'alvarez cano'],
      a: 'El X Arzobispo de Morelia es <strong>Mons. José Armando Álvarez Cano</strong>, nacido en Jiquilpan, Mich., en 1960.<p>' + link('arzobispo.html', 'Conoce al Arzobispo →') + ' · ' + link('obispos.html', 'Obispos') + '</p>' },
    { id: 'noticias', k: ['noticia', 'novedad', 'comunicado', 'homilia', 'mensaje'],
      a: link('noticias.html', 'Noticias') + ' · ' + link('comunicados.html', 'Comunicados') + '<p>Homilías, mensajes del Arzobispo y la vida de la Arquidiócesis.</p>' },
    { id: 'agenda', k: ['agenda', 'evento', 'actividad', 'calendario'],
      a: 'Consulta los próximos eventos en la ' + link('agenda.html', 'Agenda diocesana') + '.' },
    { id: 'liturgia', k: ['liturgi', 'subsidio', 'lecturas', 'evangelio', 'descarga', 'material'],
      a: link('liturgia.html', 'Liturgia') + ' · ' + link('subsidiosliturgicos.html', 'Subsidios litúrgicos') + ' · ' + link('subsidiosevangelizacion.html', 'Subsidios de evangelización') + ' · ' + link('descargas.html', 'Descargas') },
    { id: 'retiro', k: ['retiro', 'ejercicios espirituales'],
      a: 'Información de ' + link('casaderetiro.html', 'Casas de Retiro') + '. Oficina Centro: 29 02 10 07.' },
    { id: 'seminario', k: ['seminari', 'sacerdote', 'vocacion', 'ser padre', 'ser cura', 'religios', 'monja', 'vida consagrada'],
      a: 'Si sientes el llamado: ' + link('seminarios.html', 'Seminarios') + ' · ' + link('vidaconsagrada.html', 'Vida consagrada') + '.' },
    { id: 'social', k: ['pastoral social', 'caritas', 'asistencia', 'necesito ayuda', 'albergue', 'migrant', 'escucha'],
      a: link('pastoralsocial.html', 'Pastoral social') + ' · ' + link('centrosasistenciales.html', 'Centros asistenciales') + '<p>Si necesitas hablar con alguien, acércate a tu parroquia o llama al Arzobispado: ' + TEL + '.</p>' },
    { id: 'pastoral', k: ['pastoral', 'juventud', 'jovenes', 'familia', 'laicos', 'catequesis', 'catequista', 'zona', 'vicaria'],
      a: link('vicariapastoral.html', 'Vicaría de Pastoral') + ' · ' + link('familiajuventudlaicosyvida.html', 'Familia, juventud, laicos y vida') + ' · ' + link('profetica.html', 'Pastoral profética') + ' · ' + link('zonapastoral.html', 'Zonas pastorales') },
    { id: 'historia', k: ['historia', 'fundacion', 'provincia', 'santo', 'patron', 'estadistica'],
      a: link('historia.html', 'Historia') + ' · ' + link('santospatrones.html', 'Santos patrones') + ' · ' + link('provincia.html', 'Provincia eclesiástica') + ' · ' + link('estadisticas.html', 'Estadísticas') },
    { id: 'gracias', k: ['gracias', 'muy amable', 'adios', 'hasta luego', 'bendicion'],
      a: '¡Con gusto! Dios te bendiga. Aquí estaré si necesitas algo más.' }
  ];
  var BYID = {}; KB.forEach(function (e) { BYID[e.id] = e; });
  // chips cuyo texto no coincide directamente con una palabra clave
  var CHIPMAP = { 'horarios de oficina': 'contacto', 'encontrar parroquia': 'misa', 'nulidad matrimonial': 'tribunal', 'corregir una boleta': 'correccion', 'zonas pastorales': 'pastoral' };

  function norm(s) {
    return ' ' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  }
  var GENERIC = / (requisito|documento|papeles|que necesito|que ocupo|que piden|que se necesita)/;
  var last = null;

  function answer(text) {
    var t = norm(text);
    if (CHIPMAP[t.trim()]) return BYID[CHIPMAP[t.trim()]];
    var best = null, score = 0;
    KB.forEach(function (e) {
      var s = 0;
      e.k.forEach(function (kw) { if (t.indexOf(' ' + kw) >= 0) s += (kw.length > 6 ? 2 : 1) * (e.w || 1); });
      if (s > score) { score = s; best = e; }
    });
    if (!best && GENERIC.test(t)) {
      return last && last.tramite ? last : { a: '¿De qué trámite? Puedo ayudarte con:', chips: ['Bautismo', 'Primera Comunión', 'Confirmación', 'Matrimonio'] };
    }
    return best;
  }

  // ---- interfaz ----
  var box = document.createElement('div');
  box.className = 'cb';
  box.innerHTML =
    '<button class="cb-fab" type="button" aria-expanded="false" aria-controls="cb-panel" aria-label="Abrir asistente">' +
      '<svg viewBox="0 0 24 24" class="icon"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M12 8v6M9 11h6"/></svg><span>¿Te ayudamos?</span></button>' +
    '<section class="cb-panel" id="cb-panel" role="dialog" aria-label="Asistente diocesano" hidden>' +
      '<header><div><strong>Asistente diocesano</strong><small>Trámites, horarios y contacto</small></div>' +
      '<button type="button" class="cb-close" aria-label="Cerrar">×</button></header>' +
      '<div class="cb-log" aria-live="polite"></div>' +
      '<form class="cb-form"><input type="text" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta" autocomplete="off" maxlength="300">' +
      '<button type="submit" aria-label="Enviar"><svg viewBox="0 0 24 24" class="icon"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>' +
    '</section>';
  document.body.appendChild(box);
  var fab = box.querySelector('.cb-fab'), panel = box.querySelector('.cb-panel'), log = box.querySelector('.cb-log');
  var form = box.querySelector('.cb-form'), input = form.querySelector('input');

  function add(who, html, chips) {
    var m = document.createElement('div');
    m.className = 'cb-msg cb-' + who;
    if (who === 'user') m.textContent = html; else m.innerHTML = html;
    log.appendChild(m);
    if (chips && chips.length) {
      var row = document.createElement('div'); row.className = 'cb-chips';
      chips.forEach(function (c) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = c;
        b.addEventListener('click', function () { row.remove(); ask(c); });
        row.appendChild(b);
      });
      log.appendChild(row);
    }
    log.scrollTop = log.scrollHeight;
  }
  function ask(text) {
    text = text.trim(); if (!text) return;
    add('user', text);
    var typing = document.createElement('div');
    typing.className = 'cb-msg cb-bot cb-typing'; typing.innerHTML = '<i></i><i></i><i></i>';
    log.appendChild(typing); log.scrollTop = log.scrollHeight;
    setTimeout(function () {
      typing.remove();
      var r = answer(text);
      if (r) { if (r.id) last = r; add('bot', r.a, r.chips); }
      else add('bot', 'Perdón, no encontré una respuesta para eso. Puedes llamar al Arzobispado al ' + TEL + ' (lunes a viernes, 9:30–13:30 h) o ' + link('contacto.html', 'escribirnos') + '.', ['Bautismo', 'Matrimonio', 'Encontrar parroquia', 'Donar']);
    }, 450);
  }
  function toggle(open) {
    panel.hidden = !open;
    fab.setAttribute('aria-expanded', String(open));
    box.classList.toggle('open', open);
    if (open) {
      if (!log.children.length) add('bot', '¡Hola! Soy el asistente de la Arquidiócesis de Morelia. Pregúntame por requisitos de sacramentos, horarios de oficina, contacto o cómo donar.', ['Bautismo', 'Primera Comunión', 'Confirmación', 'Matrimonio', 'Horarios de oficina', 'Donar']);
      setTimeout(function () { input.focus(); }, 50);
    } else fab.focus();
  }
  fab.addEventListener('click', function () { toggle(panel.hidden); });
  box.querySelector('.cb-close').addEventListener('click', function () { toggle(false); });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); input.value = ''; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) toggle(false); });
})();

/* ---------- accesos rápidos: fecha de hoy, brillo que sigue al cursor y entrada animada ---------- */
(function () {
  var grid = document.querySelector('.ql-grid');
  if (!grid) return;
  try {
    var hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    grid.querySelectorAll('[data-ql-today]').forEach(function (s) { s.textContent = hoy; });
  } catch (e) {}
  grid.querySelectorAll('.ql').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || !('IntersectionObserver' in window)) return;
  grid.classList.add('ql-anim');
  var io = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    grid.classList.add('in'); io.disconnect();
    setTimeout(function () { grid.classList.remove('ql-anim', 'in'); }, 1200);
  }, { threshold: 0.15 });
  io.observe(grid);
})();
