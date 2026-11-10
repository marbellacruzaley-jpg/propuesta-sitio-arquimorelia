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
