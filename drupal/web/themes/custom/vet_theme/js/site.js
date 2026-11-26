/** Menú accesible y reutilizable con la API de comportamientos de Drupal. */
(function (Drupal, once) {
  'use strict';
  Drupal.behaviors.baltoNavigation = {
    attach(context) {
      once('balto-navigation', '.menu-toggle', context).forEach((button) => {
        const navigation = document.getElementById(button.getAttribute('aria-controls'));
        if (!navigation) return;
        const setOpen = (open) => {
          button.setAttribute('aria-expanded', String(open));
          const english = document.documentElement.lang === 'en';
          button.setAttribute('aria-label', english ? (open ? 'Close menu' : 'Open menu') : (open ? 'Cerrar menú' : 'Abrir menú'));
          navigation.classList.toggle('is-open', open);
        };
        button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
        navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
            setOpen(false);
            button.focus();
          }
        });
        document.addEventListener('click', (event) => {
          if (!navigation.contains(event.target) && !button.contains(event.target)) setOpen(false);
        });
        window.matchMedia('(min-width: 1100px)').addEventListener('change', () => setOpen(false));
      });
    },
  };
  Drupal.behaviors.baltoLocationMap = {
    attach(context) {
      once('balto-location-map', 'iframe[data-map-src]', context).forEach((frame) => {
        const load = () => { frame.src = frame.dataset.mapSrc; };
        if (!('IntersectionObserver' in window)) {
          load();
          return;
        }
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            load();
            observer.disconnect();
          }
        }, {rootMargin: '600px 0px'});
        observer.observe(frame);
      });
    },
  };
})(Drupal, once);

/* Aparición de secciones al hacer scroll en navegadores sin animation-timeline. */
(function () {
  'use strict';
  if (!('IntersectionObserver' in window) || !window.CSS || CSS.supports('animation-timeline: view()') || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  var items = document.querySelectorAll('.services-section .service-card,.clinic-work-card,.retail-pets > a,.about-grid > *,.story-card,.location-grid > *,.contact-inner > *');
  if (!items.length) { return; }
  var titles = document.querySelectorAll('.section-heading h2,.retail-heading h2');
  var imgs = document.querySelectorAll('.clinic-work-card img,.story-photo img,.about-photo img');
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
    });
  }, { threshold: 0.12 });
  items.forEach(function (el) { el.classList.add('reveal'); io.observe(el); });
  titles.forEach(function (el) { el.classList.add('reveal-title'); io.observe(el); });
  imgs.forEach(function (el) { el.classList.add('reveal-img'); io.observe(el); });
})();

/* Encabezado: sombra fina al bajar por la página (sin cambiar su altura). */
(function () {
  'use strict';
  var header = document.querySelector('.site-header');
  if (!header) { return; }
  var on = false, queued = false;
  function update() {
    queued = false;
    var scrolled = window.scrollY > 8;
    if (scrolled !== on) { on = scrolled; header.classList.toggle('is-scrolled', scrolled); }
  }
  window.addEventListener('scroll', function () {
    if (!queued) { queued = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();
