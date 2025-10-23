// Lightbox minimalista con zoom, teclado, móvil y captions
// Detecta imágenes renderizadas en .section y las envuelve con un enlace a la versión completa.

const LB = {
  overlay: null,
  imgEl: null,
  captionEl: null,
  closeBtn: null,
  items: [],
  index: 0,
  scale: 1,
  tx: 0,
  ty: 0,
  dragging: false,
  lastTap: 0,
  touchState: null,
};

function ready(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
  else fn();
}

function createOverlay() {
  if (LB.overlay) return LB.overlay;
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.setAttribute('hidden', '');

  const backdrop = document.createElement('div');
  backdrop.className = 'lightbox__backdrop';

  const stage = document.createElement('div');
  stage.className = 'lightbox__stage';

  const img = document.createElement('img');
  img.className = 'lightbox__img';
  img.alt = '';

  const caption = document.createElement('div');
  caption.className = 'lightbox__caption';

  const close = document.createElement('button');
  close.className = 'lightbox__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  close.textContent = '×';

  stage.appendChild(img);
  stage.appendChild(caption);
  stage.appendChild(close);
  overlay.appendChild(backdrop);
  overlay.appendChild(stage);
  document.body.appendChild(overlay);

  LB.overlay = overlay;
  LB.imgEl = img;
  LB.captionEl = caption;
  LB.closeBtn = close;

  backdrop.addEventListener('click', closeLightbox);
  close.addEventListener('click', closeLightbox);
  overlay.addEventListener('wheel', onWheel, { passive: false });
  overlay.addEventListener('keydown', onKey);

  // Gestos táctiles
  overlay.addEventListener('touchstart', onTouchStart, { passive: false });
  overlay.addEventListener('touchmove', onTouchMove, { passive: false });
  overlay.addEventListener('touchend', onTouchEnd, { passive: false });
  overlay.addEventListener('touchcancel', onTouchEnd, { passive: false });

  // Arrastre con mouse cuando hay zoom
  stage.addEventListener('mousedown', onDragStart);
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);

  // Doble click para zoom
  stage.addEventListener('dblclick', toggleZoom);

  return overlay;
}

function enhanceImages() {
  const scope = document.getElementById('app') || document.body;
  const imgs = scope.querySelectorAll('.section img, .carousel img');
  imgs.forEach(img => {
    // No intervenir imágenes de navegación externa explícita
    if (img.closest('.top-nav')) return;

    const fullsrc = img.dataset.fullsrc || img.currentSrc || img.src;
    if (!fullsrc) return;

    // Si ya tiene un wrapper lightbox, omitir
    if (img.closest('a.lb-link')) return;

    const a = img.closest('a');
    if (a) {
      // Si es externo (target _blank), respetar
      if (a.target === '_blank') return;
      a.classList.add('lb-link');
      a.dataset.lbHref = a.getAttribute('href') || fullsrc;
      a.addEventListener('click', (ev) => {
        // Si href parece imagen, abrir lightbox
        const href = a.dataset.lbHref || a.href;
        if (isImageHref(href)) {
          ev.preventDefault();
          openLightboxFrom(img);
        }
      });
      return;
    }

    // Envolver con vínculo a versión completa
    const wrapper = document.createElement('a');
    wrapper.href = fullsrc;
    wrapper.className = 'lb-link';
    wrapper.addEventListener('click', (ev) => {
      ev.preventDefault();
      openLightboxFrom(img);
    });
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);
  });
}

function collectItems() {
  // Ordenar por aparición en el DOM
  LB.items = Array.from(document.querySelectorAll('a.lb-link'))
    .filter(a => isImageHref(a.getAttribute('href') || a.dataset.lbHref || ''));
}

function isImageHref(href) {
  try {
    const u = href.toLowerCase();
    return u.endsWith('.jpg') || u.endsWith('.jpeg') || u.endsWith('.png') || u.endsWith('.webp') || u.endsWith('.gif') || u.startsWith('data:image');
  } catch (_) { return false; }
}

function openLightboxFrom(img) {
  createOverlay();
  enhanceImages();
  collectItems();
  const anchor = img.closest('a.lb-link');
  const idx = Math.max(0, LB.items.indexOf(anchor));
  openAt(idx, img);
}

function openAt(index, imgForCaption) {
  LB.index = index;
  const a = LB.items[index];
  if (!a) return;
  const src = a.dataset.lbHref || a.getAttribute('href');
  const img = imgForCaption || a.querySelector('img');
  const caption = (img && (img.getAttribute('alt') || img.getAttribute('title'))) || '';

  LB.imgEl.style.transition = 'none';
  LB.imgEl.src = src;
  LB.imgEl.alt = caption;
  LB.captionEl.textContent = caption || '';
  resetTransform();

  LB.overlay.removeAttribute('hidden');
  LB.overlay.setAttribute('aria-hidden', 'false');
  LB.overlay.tabIndex = -1;
  LB.overlay.focus();
}

function closeLightbox() {
  if (!LB.overlay) return;
  LB.overlay.setAttribute('hidden', '');
  LB.overlay.setAttribute('aria-hidden', 'true');
}

function prev() {
  if (!LB.items.length) return;
  const next = (LB.index - 1 + LB.items.length) % LB.items.length;
  openAt(next);
}

function next() {
  if (!LB.items.length) return;
  const next = (LB.index + 1) % LB.items.length;
  openAt(next);
}

function resetTransform() {
  LB.scale = 1; LB.tx = 0; LB.ty = 0; LB.dragging = false;
  applyTransform();
}

function applyTransform() {
  const t = `translate(${LB.tx}px, ${LB.ty}px) scale(${LB.scale})`;
  LB.imgEl.style.transform = t;
  LB.imgEl.style.cursor = LB.scale > 1 ? 'grab' : 'zoom-in';
}

function setScale(nextScale, cx, cy) {
  const prevScale = LB.scale;
  LB.scale = Math.max(1, Math.min(4, nextScale));
  // Ajustar traslación básica para zoom alrededor del punto (cx,cy)
  if (LB.scale !== prevScale && cx != null && cy != null) {
    const dx = (cx - (window.innerWidth / 2) - LB.tx) / prevScale;
    const dy = (cy - (window.innerHeight / 2) - LB.ty) / prevScale;
    LB.tx -= dx * (LB.scale - prevScale);
    LB.ty -= dy * (LB.scale - prevScale);
  }
  applyTransform();
}

function toggleZoom(ev) {
  const x = (ev && ev.clientX) || (window.innerWidth / 2);
  const y = (ev && ev.clientY) || (window.innerHeight / 2);
  setScale(LB.scale > 1 ? 1 : 2, x, y);
}

function onWheel(ev) {
  if (!LB.overlay || LB.overlay.hasAttribute('hidden')) return;
  ev.preventDefault();
  const delta = Math.sign(ev.deltaY) * -0.1;
  const next = LB.scale + delta;
  setScale(next, ev.clientX, ev.clientY);
}

function onKey(ev) {
  if (ev.key === 'Escape') return void closeLightbox();
  if (ev.key === 'ArrowLeft') return void prev();
  if (ev.key === 'ArrowRight') return void next();
  if (ev.key === '+') return void setScale(LB.scale + 0.25);
  if (ev.key === '-') return void setScale(LB.scale - 0.25);
}

function onDragStart(ev) {
  if (LB.scale <= 1) return;
  LB.dragging = true;
  LB.imgEl.style.cursor = 'grabbing';
  LB._dragStart = { x: ev.clientX, y: ev.clientY, tx: LB.tx, ty: LB.ty };
}
function onDragMove(ev) {
  if (!LB.dragging || !LB._dragStart) return;
  const dx = ev.clientX - LB._dragStart.x;
  const dy = ev.clientY - LB._dragStart.y;
  LB.tx = LB._dragStart.tx + dx;
  LB.ty = LB._dragStart.ty + dy;
  applyTransform();
}
function onDragEnd() {
  LB.dragging = false;
  if (LB.imgEl) LB.imgEl.style.cursor = LB.scale > 1 ? 'grab' : 'zoom-in';
}

// Gestos: doble tap para zoom, swipe para navegar, pinch para zoom
function onTouchStart(ev) {
  if (ev.touches.length === 1) {
    const now = Date.now();
    if (now - LB.lastTap < 300) {
      ev.preventDefault();
      const t = ev.touches[0];
      setScale(LB.scale > 1 ? 1 : 2, t.clientX, t.clientY);
      LB.lastTap = 0;
      return;
    }
    LB.lastTap = now;
    LB.touchState = { mode: 'pan', startX: ev.touches[0].clientX, startY: ev.touches[0].clientY, tx: LB.tx, ty: LB.ty };
  } else if (ev.touches.length === 2) {
    ev.preventDefault();
    const d = dist(ev.touches[0], ev.touches[1]);
    LB.touchState = { mode: 'pinch', startD: d, startScale: LB.scale };
  }
}

function onTouchMove(ev) {
  if (!LB.touchState) return;
  if (LB.touchState.mode === 'pan' && LB.scale > 1 && ev.touches.length === 1) {
    ev.preventDefault();
    const dx = ev.touches[0].clientX - LB.touchState.startX;
    const dy = ev.touches[0].clientY - LB.touchState.startY;
    LB.tx = LB.touchState.tx + dx;
    LB.ty = LB.touchState.ty + dy;
    applyTransform();
  } else if (LB.touchState.mode === 'pinch' && ev.touches.length === 2) {
    ev.preventDefault();
    const d = dist(ev.touches[0], ev.touches[1]);
    const next = LB.touchState.startScale * (d / LB.touchState.startD);
    setScale(next);
  }
}

function onTouchEnd(ev) {
  // Swipe navegación cuando no hay zoom
  if (LB.scale <= 1 && LB.touchState && LB.touchState.mode === 'pan') {
    const dx = (ev.changedTouches && ev.changedTouches[0]) ? (ev.changedTouches[0].clientX - LB.touchState.startX) : 0;
    if (Math.abs(dx) > 60) {
      if (dx > 0) prev(); else next();
    }
  }
  LB.touchState = null;
}

function dist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

// Reaplicar mejoras tras cambios dinámicos (render del sitio)
function observeMutations() {
  const root = document.getElementById('app') || document.body;
  const mo = new MutationObserver((list) => {
    let needs = false;
    for (const m of list) {
      if (m.addedNodes && m.addedNodes.length) { needs = true; break; }
    }
    if (needs) enhanceImages();
  });
  mo.observe(root, { subtree: true, childList: true });
}

ready(() => {
  createOverlay();
  enhanceImages();
  observeMutations();
});

export {};

