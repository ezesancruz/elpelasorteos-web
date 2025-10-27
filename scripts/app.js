import { newLightbox } from './new-lightbox.js';

const appState = {
  site: null,
  pageId: null,
  root: null
};

(async () => {
  const dataUrl = getDataUrl();
  const site = await loadSite(dataUrl);
  const pageId = resolvePageId(site);
  const root = document.getElementById('app') || document.body;
  initAppState(site, pageId, root);
  render();
  newLightbox.init();
})();

// Analytics helper (GA4 compatible)
function track(eventName, params = {}) {
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, params);
    } else if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: eventName, ...params });
    } else {
      console.debug('[track]', eventName, params);
    }
  } catch (_) {}
}

function initAppState(site, pageId, root) {
  appState.site = site;
  appState.pageId = pageId;
  appState.root = root;
  window.siteApp = {
    getSite() {
      return deepClone(appState.site);
    },
    setSite(nextSite) {
      appState.site = deepClone(nextSite);
      const currentPage = appState.site.pages?.find(p => p.id === appState.pageId);
      if (!currentPage || currentPage.hidden) {
        const firstVisiblePage = appState.site.pages?.find(p => !p.hidden);
        appState.pageId = firstVisiblePage?.id || appState.site.pages?.[0]?.id || 'home';
      }
      render();
    },
    setPage(nextPageId) {
      if (appState.pageId === nextPageId) return;
      appState.pageId = nextPageId;
      render();
    },
    rerender() {
      render();
    }
  };
}

function render() {
  const { site, pageId } = appState;
  if (!site) return;
  const page = site.pages.find(p => p.id === pageId) || site.pages[0];
  if (!page) return;
  document.title = `${page.title} | ${site.meta.title}`;
  applyTheme(site.theme || {});
  renderBackground(site.theme?.background || {});
  renderShell(site, pageId, page);
}

function getDataUrl() {
  const base = document.currentScript?.dataset?.contentPath;
  if (base) return base;
  const current = window.location.pathname;
  if (current.endsWith('/')) return '../data/site-content.json';
  return 'data/site-content.json';
}

async function loadSite(url) {
  const response = await fetch(url).catch(() => null);
  if (!response || !response.ok) {
    throw new Error(`Unable to load content from ${url}`);
  }
  return response.json();
}

function resolvePageId(site) {
  const path = normalisePath(window.location.pathname);
  const navMatch = site.navigation?.find(nav => normalisePath(nav.path) === path);
  let pageId = navMatch?.pageId || site.pages?.[0]?.id || 'home';

  const page = site.pages.find(p => p.id === pageId);
  if (page?.hidden) {
    const firstVisiblePage = site.pages.find(p => !p.hidden);
    pageId = firstVisiblePage?.id || site.pages?.[0]?.id || 'home';
  }

  return pageId;
}

function normalisePath(pathname) {
  if (!pathname) return '/';
  const path = pathname.toLowerCase();
  return path.endsWith('/') ? path : `${path}/`;
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (!theme) return;
  if (theme.colors) {
    root.style.setProperty('--color-primary', theme.colors.primary || '#fe9200');
    root.style.setProperty('--color-accent', theme.colors.accent || '#000000');
    root.style.setProperty('--color-text', theme.colors.text || '#ffffff');
    root.style.setProperty('--color-muted', theme.colors.muted || '#111111');
  }
  if (theme.fonts) {
    root.style.setProperty('--font-heading', theme.fonts.heading || 'Fredoka One, sans-serif');
    root.style.setProperty('--font-body', theme.fonts.body || 'Poppins, sans-serif');
  }
}

function renderBackground(background) {
  console.log('renderBackground called with:', JSON.stringify(background, null, 2));
  let media = document.getElementById('background-media');
  if (!media) {
    media = document.createElement('div');
    media.id = 'background-media';
    document.body.prepend(media);
  }
  media.innerHTML = '';

  const backgroundMode =
    background?.backgroundMode ||
    (background?.video ? 'video' : (background?.image ? 'image' : 'none'));
  console.log('backgroundMode:', backgroundMode);

  if (backgroundMode === 'video' && background?.video) {
    console.log('Rendering video:', background.video);
    const video = document.createElement('video');
    video.setAttribute('autoplay', 'true');
    video.setAttribute('muted', 'true');
    video.setAttribute('loop', 'true');
    video.setAttribute('playsinline', 'true');
    if (background.poster) video.poster = background.poster;
    const source = document.createElement('source');
    source.src = background.video;
    video.appendChild(source);
    media.appendChild(video);
  } else if (backgroundMode === 'image' && background?.image) {
    console.log('Rendering image:', background.image);
    const img = createImg(background.image, '');
    media.appendChild(img);
  } else {
    console.log('No background media rendered.');
  }

  let overlay = document.getElementById('background-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'background-overlay';
    document.body.prepend(overlay);
  }

  // Adjust overlay visibility based on backgroundMode
  if (backgroundMode === 'video' || backgroundMode === 'image') {
    overlay.style.opacity = '0'; // Hide overlay for video and image
  } else {
    overlay.style.opacity = '1'; // Show overlay for none
  }
}

function renderShell(site, activePageId, page) {
  const shell = document.createElement('div');
  shell.className = 'site-shell';

  const nav = renderNav(site, activePageId);
  const main = document.createElement('main');
  const sectionWrapper = document.createElement('div');
  sectionWrapper.className = 'section-wrapper';

  sectionWrapper.appendChild(renderHero(page.hero));
  page.sections?.forEach(section => {
    const rendered = renderSection(section);
    if (rendered) sectionWrapper.appendChild(rendered);
  });

  main.appendChild(sectionWrapper);

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  const small = document.createElement('small');
  small.innerHTML = `© ${new Date().getFullYear()} ${site.meta.title}. Todos los derechos reservados. `;
  const devButton = document.createElement('button');
  devButton.id = 'dev-mode-trigger';
  devButton.className = 'dev-link';
  devButton.setAttribute('aria-haspopup', 'dialog');
  devButton.textContent = 'Modo desarrollador';
  small.appendChild(devButton);
  footer.appendChild(small);

  shell.appendChild(nav);
  shell.appendChild(main);
  shell.appendChild(footer);

  appState.root.innerHTML = '';
  appState.root.appendChild(shell);
}

// --- Estado auth & UI edición ---
async function checkAdmin() {
  try {
    const r = await fetch('/api/auth/check', { credentials: 'include' });
    const { isAdmin } = await r.json();
    document.documentElement.classList.toggle('admin', !!isAdmin);

    const editToggle = document.getElementById('edit-toggle');
    if (editToggle) {
        editToggle.style.display = isAdmin ? 'inline-flex' : 'none';
    }

    const logoutBtn = document.getElementById('logout-admin');
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !isAdmin);
  } catch (e) {
    console.warn('No se pudo comprobar auth', e);
  }
}

// --- Modal login ---
function setupDevLoginUI() {
  const trigger = document.getElementById('dev-mode-trigger');
  const modal = document.getElementById('dev-login');
  const form = document.getElementById('dev-login-form');
  const cancel = document.getElementById('dev-cancel');
  const error = document.getElementById('dev-error');

  if (!trigger || !modal || !form) {
    setTimeout(setupDevLoginUI, 100);
    return;
  }

  const open = () => {
    modal.classList.remove('hidden');
    error.textContent = '';
    form.reset();
    form.elements.username.focus();
  };
  const close = () => modal.classList.add('hidden');

  trigger.addEventListener('click', open);
  cancel.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        error.textContent = j?.error || 'Error al iniciar sesión';
        return;
      }
      close();
      await checkAdmin();
      document.getElementById('edit-toggle')?.click?.();
    } catch (err) {
      error.textContent = 'No se pudo conectar con el servidor';
    }
  });
}

// --- Logout (opcional dentro de tu panel de edición) ---
function setupLogout() {
  const btn = document.getElementById('logout-admin');
  if (!btn) {
    setTimeout(setupLogout, 100);
    return;
  }
  btn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    await checkAdmin();
    document.querySelector('.editor-panel')?.classList.remove('is-open');
  });
}

// Init en DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setupDevLoginUI();
  setupLogout();
  checkAdmin();
});

function renderNav(site, activePageId) {
  const nav = document.createElement('header');
  nav.className = 'top-nav';

  const brand = document.createElement('div');
  brand.className = 'top-nav__brand';
  brand.textContent = site.meta.title || 'Ojeda';

  const links = document.createElement('nav');
  links.className = 'top-nav__links';

  const visiblePageIds = new Set((site.pages || []).filter(p => !p.hidden).map(p => p.id));

  (site.navigation || []).forEach(item => {
    if (!visiblePageIds.has(item.pageId)) return;
    const anchor = document.createElement('a');
    anchor.href = item.path;
    anchor.textContent = capitalise(item.label || item.pageId);
    if (item.pageId === activePageId) anchor.classList.add('is-active');
    links.appendChild(anchor);
  });

  nav.appendChild(brand);
  nav.appendChild(links);
  return nav;
}

const SOCIAL_ICONS = {
  instagram: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-instagram" viewBox="0 0 16 16"><path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92.28-.28.546-.453.92-.598.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334"/></svg>',
  tiktok: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-tiktok" viewBox="0 0 16 16"><path d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/></svg>',
  youtube: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-youtube" viewBox="0 0 16 16"><path d="M8.051 1.999h.089c.822.003 4.987.033 6.11.335a2.01 2.01 0 0 1 1.415 1.42c.101.38.172.883.22 1.402l.01.104.022.26.008.104c.065.914.073 1.77.074 1.957v.075c-.001.194-.01 1.108-.082 2.06l-.008.105-.009.104c-.05.572-.124 1.14-.235 1.558a2.01 2.01 0 0 1-1.415 1.42c-1.16.312-5.569.334-6.18.335h-.142c-.309 0-1.587-.006-2.927-.052l-.17-.006-.087-.004-.171-.007-.171-.007c-1.11-.049-2.167-.128-2.654-.26a2.01 2.01 0 0 1-1.415-1.419c-.111-.417-.185-.986-.235-1.558L.09 9.82l-.008-.104A31 31 0 0 1 0 7.68v-.123c.002-.215.01-.958.064-1.778l.007-.103.003-.052.008-.104.022-.26.01-.104c.048-.519.119-1.023.22-1.402a2.01 2.01 0 0 1 1.415-1.42c.487-.13 1.544-.21 2.654-.26l.17-.007.172-.006.086-.003.171-.007A100 100 0 0 1 7.858 2zM6.4 5.209v4.818l4.157-2.408z"/></svg>',
  facebook: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-facebook" viewBox="0 0 16 16"><path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/></svg>',
  whatsapp: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-whatsapp" viewBox="0 0 16 16"><path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/></svg>',
  telegram: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-telegram" viewBox="0 0 16 16"><path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.168.486-4.666 2.01-.567.225-.595.442c-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294q.39.01.868-.32 3.269-2.206 3.374-2.23c.05-.012.12-.026.166.016s.042.12.037.141c-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8 8 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629q.14.092.27.187c.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.4 1.4 0 0 0-.013-.315.34.34 0 0 0-.114-.217.53.53 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09"/></svg>',
  default: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>'
};

function resolvePlatform(url = "") {
  const u = url.toLowerCase();
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('facebook.com')) return 'facebook';
  if (u.includes('wa.me') || u.includes('whatsapp.com')) return 'whatsapp';
  if (u.includes('t.me')) return 'telegram';
  return 'default';
}

function renderSocial(links = []) {
  if (!Array.isArray(links) || !links.length) return null;
  const list = document.createElement('ul');
  list.className = 'social-list';
  list.setAttribute('aria-label', 'Redes sociales');
  links.forEach(link => {
    if (!link?.url) return;
    const key = resolvePlatform(link.url);
    const icon = SOCIAL_ICONS[key] || SOCIAL_ICONS.default;
    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.setAttribute('aria-label', link.label || key);
    anchor.addEventListener('click', () => {
      track('social_click', { platform: key });
    });
    anchor.innerHTML = icon;
    item.appendChild(anchor);
    list.appendChild(item);
  });
  return list.children.length ? list : null;
}

function resolveImageSrc(input, preferThumb = false) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  const thumbFirst = preferThumb ? resolveVariantFrom(input, THUMB_VARIANT_KEYS) : '';
  if (thumbFirst) return thumbFirst;
  const primary = resolveVariantFrom(input, PRIMARY_VARIANT_KEYS);
  if (primary) return primary;
  const fallbackFull = resolveVariantFrom(input, FULL_VARIANT_KEYS);
  if (fallbackFull) return fallbackFull;
  if (!preferThumb) {
    const thumbFallback = resolveVariantFrom(input, THUMB_VARIANT_KEYS);
    if (thumbFallback) return thumbFallback;
  }
  return '';
}

function resolveFullImageSrc(input) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  const full = resolveVariantFrom(input, FULL_VARIANT_KEYS);
  if (full) return full;
  return resolveVariantFrom(input, PRIMARY_VARIANT_KEYS) || '';
}

const THUMB_VARIANT_KEYS = ['thumb', 'thumbnail', 'preview', 'small'];
const PRIMARY_VARIANT_KEYS = ['src', 'image', 'url', 'path'];
const FULL_VARIANT_KEYS = ['full', 'original', 'raw', 'large', 'hd', 'source'];

function resolveVariantFrom(input, keys, visited = new Set()) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (visited.has(input)) return '';
  if (Array.isArray(input)) {
    visited.add(input);
    for (const item of input) {
      const resolved = resolveVariantFrom(item, keys, visited);
      if (resolved) return resolved;
    }
    return '';
  }
  if (typeof input !== 'object') return '';
  visited.add(input);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const value = input[key];
    const direct = resolveVariantValue(value);
    if (direct) return direct;
  }
  const nestedKeys = ['variants', 'sources', 'images', 'files', 'sizes', 'crop'];
  for (const nestedKey of nestedKeys) {
    if (!Object.prototype.hasOwnProperty.call(input, nestedKey)) continue;
    const nested = input[nestedKey];
    const resolved = resolveVariantFrom(nested, keys, visited);
    if (resolved) return resolved;
  }
  return '';
}

function resolveVariantValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = resolveVariantValue(item);
      if (resolved) return resolved;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const key of ['src', 'url', 'href', 'path', 'value', 'data']) {
      if (typeof value[key] === 'string' && value[key]) {
        return value[key];
      }
    }
  }
  return '';
}

function createImg(srcOrObj, alt = '', opts = {}) {
  const preferThumb = !!opts.preferThumb;
  const resolved = resolveImageSrc(srcOrObj, preferThumb);
  const frame = document.createElement('div');
  frame.setAttribute('data-img-frame', '');

  // FULL para el visor (priorizar original si existe)
  const full = resolveFullImageSrc(srcOrObj) || resolved;

  if (preferThumb && srcOrObj && srcOrObj.thumb) {
    // Tu rama “recortes perfectos” via background
    frame.style.backgroundImage = `url(${srcOrObj.thumb})`;
    frame.style.backgroundSize = 'cover';
    frame.style.backgroundPosition = 'center';
    frame.style.backgroundRepeat = 'no-repeat';
    // Importante si el contenedor usa aspect-ratio
    if (opts.aspect) frame.style.aspectRatio = String(opts.aspect);
    // <- antes aquí NO había click; ahora lo agregamos:
    attachLightbox(frame, full);
  } else {
    // Rama <img> tradicional (ya te funcionaba)
    const img = document.createElement('img');
    img.src = resolved;
    img.alt = alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    frame.appendChild(img);

    if (opts.objectFit) img.style.objectFit = opts.objectFit;
    if (opts.aspect) frame.style.aspectRatio = String(opts.aspect);

    attachLightbox(frame, full);
  }

  try {
    const title = (typeof srcOrObj === 'object' && srcOrObj && (srcOrObj.title || srcOrObj.caption)) || '';
    if (frame.title !== title) frame.title = String(title);
  } catch (_) {}

  const fallbackAspect = toPositiveNumber(opts.aspect ?? opts.aspectRatio, null);
  if (fallbackAspect && !frame.style.aspectRatio) {
    frame.style.aspectRatio = String(fallbackAspect);
  }

  if (opts.objectFit && !frame.style.objectFit) {
    frame.dataset.fit = opts.objectFit;
    if (frame.firstChild?.style) {
      frame.firstChild.style.objectFit = opts.objectFit;
    }
  }

  return frame;
}

function applyImageDisplay(frame, img, srcOrObj) {
  frame.style.removeProperty('--crop-zoom');
  frame.style.removeProperty('--crop-inv-zoom');
  frame.style.removeProperty('--crop-offset-x');
  frame.style.removeProperty('--crop-offset-y');
  frame.style.removeProperty('aspect-ratio');
  delete frame.dataset.hasCrop;
  delete frame.dataset.fit;
  delete frame.dataset.cropMode;

  img.style.removeProperty('object-fit');
  img.style.removeProperty('object-position');
  img.style.removeProperty('transform');
  img.style.removeProperty('transform-origin');
  img.style.removeProperty('clip-path');
  img.style.removeProperty('will-change');

  if (!srcOrObj || typeof srcOrObj !== 'object') return;

  let crop = srcOrObj.crop;
  if (!crop && srcOrObj.display && typeof srcOrObj.display === 'object') {
    crop = srcOrObj.display;
  }  
  if (!crop && (srcOrObj.focusX != null || srcOrObj.focusY != null || srcOrObj.align)) {
    crop = legacyAlignToCrop(srcOrObj);
  }
  crop = normalizeCropDescriptor(crop);
  if (!crop) return;

  const aspect = toPositiveNumber(crop.aspect, null);
  if (aspect) {
    frame.style.aspectRatio = String(aspect);
  }

  let fit = typeof crop.objectFit === 'string' ? crop.objectFit : (typeof crop.fit === 'string' ? crop.fit : '');
  if (!fit && typeof crop.mode === 'string') {
    const candidate = crop.mode.trim().toLowerCase();
    if (candidate === 'cover' || candidate === 'contain' || candidate === 'fill' || candidate === 'scale-down' || candidate === 'none') {
      fit = candidate;
    }
  }
  if (fit) {
    frame.dataset.fit = fit;
    img.style.objectFit = fit;
  }

  const objectPosition = resolveObjectPosition(crop);
  if (objectPosition) {
    img.style.objectPosition = objectPosition;
  }

  if (typeof crop.clipPath === 'string' && crop.clipPath) {
    img.style.clipPath = crop.clipPath;
    frame.dataset.cropMode = 'clip-path';
  }

  const transform = resolveCropTransform(crop);
  if (transform) {
    img.style.transform = transform.value;
    if (transform.origin) {
      img.style.transformOrigin = transform.origin;
    }
    if (transform.willChange) {
      img.style.willChange = transform.willChange;
    }
    if (transform.mode) {
      frame.dataset.cropMode = transform.mode;
    }
  }
}

function normalizeCropDescriptor(rawCrop) {
  if (!rawCrop || typeof rawCrop !== 'object') return null;
  const descriptor = { ...rawCrop };
  if (rawCrop.css && typeof rawCrop.css === 'object') {
    Object.assign(descriptor, rawCrop.css);
  }
  if (rawCrop.display && typeof rawCrop.display === 'object') {
    Object.assign(descriptor, rawCrop.display);
  }
  if (descriptor.mode == null && typeof descriptor.type === 'string') {
    descriptor.mode = descriptor.type;
  }
  if (descriptor.objectPosition == null && typeof rawCrop.focus === 'object') {
    descriptor.objectPosition = rawCrop.focus;
  }
  if (descriptor.objectPosition == null && typeof rawCrop.position === 'object') {
    descriptor.objectPosition = rawCrop.position;
  }
  return descriptor;
}

function resolveObjectPosition(crop) {
  if (!crop) return '';
  if (typeof crop.objectPosition === 'string' && crop.objectPosition.trim()) {
    return crop.objectPosition.trim();
  }
  const source = crop.objectPosition || crop.position || crop.focus;
  let x;
  let y;
  if (source && typeof source === 'object') {
    x = source.x ?? source.cx ?? source.left ?? source.right;
    y = source.y ?? source.cy ?? source.top ?? source.bottom;
  }
  if (x == null && crop.offsetX != null) x = crop.offsetX;
  if (y == null && crop.offsetY != null) y = crop.offsetY;
  const nx = toClamped01(x, null);
  const ny = toClamped01(y, null);
  if (nx == null && ny == null) return '';
  if (nx != null && ny != null) {
    return `${formatPercent(nx)} ${formatPercent(ny)}`;
  }
  if (nx != null) return `${formatPercent(nx)} center`;
  return `center ${formatPercent(ny)}`;
}

function resolveCropTransform(crop) {
  if (!crop) return null;
  if (typeof crop.transform === 'string' && crop.transform.trim()) {
    return { value: crop.transform.trim(), origin: crop.transformOrigin || crop.origin || '', mode: 'custom-transform' };
  }
  if (crop.transform && typeof crop.transform === 'object') {
    const candidate = crop.transform.value || crop.transform.css || '';
    if (typeof candidate === 'string' && candidate.trim()) {
      return { value: candidate.trim(), origin: crop.transform.origin || crop.transformOrigin || '', mode: 'custom-transform' };
    }
  }
  return resolveLegacyTransform(crop);
}

function resolveLegacyTransform(crop) {
  const zoom = toPositiveNumber(crop.zoom, 1) || 1;
  const offsetX = toClamped01(crop.offsetX, 0.5);
  const offsetY = toClamped01(crop.offsetY, 0.5);

  // If there is no crop at all, do nothing.
  if (zoom === 1 && offsetX === 0.5 && offsetY === 0.5) {
    return null;
  }

  // Only apply scale. The translate part was conflicting with object-position.
  const value = `scale(${zoom})`;
  return { value, origin: 'center center', willChange: 'transform', mode: 'legacy-transform' };
}

function toPositiveNumber(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'string' && value.includes('/')) {
    const [numPart, denPart] = value.split('/');
    const numerator = Number(numPart.trim());
    const denominator = Number(denPart.trim());
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      const ratio = numerator / denominator;
      if (ratio > 0) return ratio;
    }
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function toClamped01(value, fallback) {
  if (value == null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(4).replace(/\.0+$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1')}%`;
}

function legacyAlignToCrop(data) {
  const crop = { zoom: 1, offsetX: 0.5, offsetY: 0.5 };
  if (typeof data.focusX === 'number') {
    crop.offsetX = clamp01(data.focusX / 100);
  } else if (typeof data.align === 'string') {
    const mapX = { left: 0.0, center: 0.5, right: 1.0 };
    const mapY = { top: 0.0, center: 0.5, bottom: 1.0 };
    const parts = data.align.split('-');
    const [first, second] = parts;
    crop.offsetX = clamp01(mapX[second] ?? mapX[first] ?? 0.5);
    crop.offsetY = clamp01(mapY[first] ?? mapY[second] ?? 0.5);
  }
  if (typeof data.focusY === 'number') {
    crop.offsetY = clamp01(data.focusY / 100);
  }
  return crop;
}

function clamp01(value) {
  if (value == null) return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return num;
}

function renderHero(hero = {}) {
  const section = document.createElement('section');
  section.className = 'section section--hero';

  const heroEl = document.createElement('div');
  heroEl.className = 'hero';
  section.appendChild(heroEl);

  if (hero.bannerImage) {
    const media = document.createElement('div');
    media.className = 'hero__media';
    const banner = createImg(hero.bannerImage, hero.title || 'Banner', { preferThumb: true });
    banner.className = 'hero-banner';
    media.appendChild(banner);
    heroEl.appendChild(media);
  }

  const body = document.createElement('div');
  const hasProfileImage = Boolean(hero.profileImage);
  body.className = `hero-body${hasProfileImage ? ' hero-body--with-profile' : ''}`;
  heroEl.appendChild(body);

  if (hero.profileImage) {
    const profileWrapper = document.createElement('div');
    profileWrapper.className = 'hero__profile-wrapper';
    const profile = createImg(hero.profileImage, hero.title || 'Perfil', { aspect: 1, objectFit: 'cover', preferThumb: true });
    profile.className = 'hero-profile';
    profileWrapper.appendChild(profile);
    body.appendChild(profileWrapper);
  }

  const title = document.createElement('h1');
  title.className = 'hero__title';
  title.innerHTML = hero.title || '';
  body.appendChild(title);

  if (hero.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'hero__subtitle';
    subtitle.innerHTML = hero.subtitle;
    body.appendChild(subtitle);
  }

  if (hero.buttons?.length) {
    const buttonRow = document.createElement('div');
    buttonRow.className = 'button-row';
    hero.buttons.forEach((btn, index) => {
      const anchor = document.createElement('a');
      anchor.className = `button ${index === 0 ? 'button--primary' : 'button--ghost'}`;
      anchor.href = btn.href || '#';
      anchor.textContent = btn.label || 'Ver mas';
      anchor.addEventListener('click', () => {
        const label = (btn.label || '').toLowerCase();
        const ev = label.includes('particip') ? 'cta_participar_click' : 'cta_click';
        track(ev, { location: 'hero', label: btn.label || '' });
      });
      buttonRow.appendChild(anchor);
    });
    body.appendChild(buttonRow);
  }
  
  const social = renderSocial(hero.social);
  if (social) body.appendChild(social);

  return section;
}

function renderSection(section) {
  const renderer = sectionRenderers[section.type];
  if (!renderer) {
    console.warn('No renderer for section type', section.type);
    return null;
  }
  const element = renderer(section);
  if (!element) return null;
  element.dataset.sectionId = section.id || '';
  return element;
}

const sectionRenderers = {
  textoInformativo: renderRichTextSection,
  opcionesCompra: renderLinkCardsSection,
  linkCards: renderLinkCardsSection,
  galeriaImagenes: renderImageGridSection,
  carruselImagenes: renderImageCarouselSection,
  detalleVisual: renderImageHighlightSection,
  imageHighlight: renderImageHighlightSection,
  botonAccion: renderCTASection,
  tarjetaValidacion: renderValidationCardSection,
  muroGanadores: renderWinnerCardsSection,
  keyValue: renderKeyValueSection,
  faq: renderFAQSection
};

function renderRichTextSection(section) {
  const container = baseSection('textoInformativo');
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.innerHTML = section.data.title;
    container.appendChild(heading);
  }
  if (section.data?.html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = section.data.html;
    container.appendChild(wrapper);
  } else {
    section.data?.lines?.forEach(line => {
      const p = document.createElement('p');
      p.innerHTML = line;
      container.appendChild(p);
    });
  }
  return container;
}

// Delegación de eventos GA4 (fallback global)
if (!window.__ga4DelegatedClicks) {
  document.addEventListener('click', (e) => {
    const a = e.target && (e.target.closest ? e.target.closest('a') : null);
    if (!a) return;

    // Evitar duplicados en componentes que ya disparan eventos
    if (a.closest('.social-list, .link-cards, .button-row')) return;

    // Clicks en packs (links a MercadoPago) presentes en contenido libre
    if (/mpago\.la|mercadopago/i.test(a.href || '')) {
      const label = (a.textContent || '').trim();
      track('pack_click', { label });
      if (/participar|comprar/i.test(a.textContent || '')) {
        track('cta_participar_click', { location: 'content' });
      }
    }
  }, true);
  window.__ga4DelegatedClicks = true;
}

function renderKeyValueSection(section) {
  const container = baseSection('keyValue');
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.innerHTML = section.data.title;
    container.appendChild(heading);
  }
  const list = document.createElement('dl');
  list.className = 'key-value';
  (section.data?.items || []).forEach(it => {
    const dt = document.createElement('dt');
    dt.innerHTML = it.k || '';
    const dd = document.createElement('dd');
    dd.innerHTML = it.v || '';
    list.appendChild(dt);
    list.appendChild(dd);
  });
  container.appendChild(list);
  return container;
}

function renderFAQSection(section) {
  const container = baseSection('faq');
  const title = section.data?.title || section.title || 'Preguntas frecuentes';
  if (title) {
    const h = document.createElement('h3');
    h.innerHTML = title;
    container.appendChild(h);
  }
  const list = document.createElement('div');
  list.className = 'faq-list';
  (section.data?.items || section.items || []).forEach(i => {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.innerHTML = i.q || '';
    const answer = document.createElement('div');
    answer.className = 'answer';
    answer.innerHTML = i.a || '';
    details.appendChild(summary);
    details.appendChild(answer);
    list.appendChild(details);
  });
  container.appendChild(list);
  return container;
}

function renderLinkCardsSection(section) {
  const container = baseSection('opcionesCompra');
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.innerHTML = section.data.title;
    container.appendChild(heading);
  }
  const grid = document.createElement('div');
  grid.className = 'link-cards';
  section.data?.cards?.forEach(card => {
    const anchor = document.createElement('a');
    anchor.className = 'link-card';
    anchor.href = card.href || '#';
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.addEventListener('click', () => {
      const m = String(card.title || '').match(/(\d+)/);
      const amount = m ? Number(m[1]) : undefined;
      track('pack_click', { amount, title: card.title || '' });
    });
    if (card.image) {
      const imageEl = createImg(card.image, card.title || 'Link', { preferThumb: true });
      anchor.appendChild(imageEl);
    }
    const title = document.createElement('div');
    title.className = 'link-card__title';
    title.innerHTML = card.title || 'Link';
    const subtitle = document.createElement('div');
    subtitle.className = 'link-card__subtitle';
    subtitle.innerHTML = card.subtitle || '';
    anchor.appendChild(title);
    anchor.appendChild(subtitle);
    grid.appendChild(anchor);
  });
  container.appendChild(grid);
  return container;
}

function renderImageGridSection(section) {
  const container = baseSection('galeriaImagenes');
  const grid = document.createElement('div');
  grid.className = 'image-grid';
  (section.data?.images || []).forEach(entry => {
    if (!entry) return;
    const image = typeof entry === 'object' && entry ? entry : { src: entry };
    const src = image.src || image.image;
    if (!src) return;

    const card = document.createElement('div');
    card.className = 'image-card';

    const altText = image.alt || image.title || section.data?.title || 'Imagen';
    const titleText = (image.title || '').trim();
    const descriptionText = (image.subtitle || image.description || '').trim();

    const media = document.createElement('a');
    media.className = 'image-card__media';
    media.href = image.href || src;
    if (image.href) {
      media.target = '_blank';
      media.rel = 'noopener';
    } else {
      media.removeAttribute('target');
      media.removeAttribute('rel');
    }
    const frame = createImg(image, altText, { preferThumb: true, aspect: 3 / 4, objectFit: 'cover' });
    media.appendChild(frame);
    card.appendChild(media);

    if (titleText || descriptionText) {
      const content = document.createElement('div');
      content.className = 'image-card__content';

      if (titleText) {
        const heading = document.createElement('h3');
        heading.className = 'image-card__heading';
        heading.innerHTML = titleText;
        content.appendChild(heading);
      }

      if (descriptionText) {
        const bodyText = document.createElement('p');
        bodyText.className = 'image-card__description';
        bodyText.innerHTML = descriptionText;
        content.appendChild(bodyText);
      }

      card.appendChild(content);
    }

    grid.appendChild(card);
  });
  container.appendChild(grid);
  return container;
}

function renderImageCarouselSection(section) {
  const container = baseSection('imageCarousel');
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.innerHTML = section.data.title;
    container.appendChild(heading);
  }
  if (section.data?.description) {
    const description = document.createElement('p');
    description.innerHTML = section.data.description;
    container.appendChild(description);
  }
  const track = document.createElement('div');
  track.className = 'carousel';
  (section.data?.images || []).forEach(entry => {
    if (!entry) return;
    const image = typeof entry === 'object' && entry ? entry : { src: entry };
    if (!image.src) return;
    const item = document.createElement('div');
    item.className = 'carousel__item';
    const frame = createImg(image, image.alt || image.title || section.data?.title || 'Galeria', { preferThumb: true });
    item.appendChild(frame);
    track.appendChild(item);
  });
  container.appendChild(track);
  return container;
}

function renderImageHighlightSection(section) {
  const container = baseSection('detalleVisual');
  const media = document.createElement('div');
  media.className = 'imageHighlight__media';
  if (section.data?.image) {
    const imageObj = typeof section.data.image === 'object' && section.data.image ? section.data.image : { src: section.data.image };
    const img = createImg(imageObj, section.data?.title || 'Destacado', { aspect: 3 / 2, preferThumb: true });
    media.appendChild(img);
  }
  const body = document.createElement('div');
  body.className = 'imageHighlight__body';
  if (section.data?.title) {
    const heading = document.createElement('h3');
    heading.innerHTML = section.data.title;
    body.appendChild(heading);
  }
  if (section.data?.body) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = section.data.body;
    body.appendChild(paragraph);
  }
  container.appendChild(media);
  container.appendChild(body);
  return container;
}

function renderCTASection(section) {
  const container = baseSection('botonAccion');
  if (section.data?.image) {
    const img = createImg(section.data.image, section.data?.title || 'CTA');
    container.appendChild(img);
  }
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.innerHTML = section.data.title;
    container.appendChild(heading);
  }
  if (section.data?.body) {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = section.data.body;
    container.appendChild(paragraph);
  }
  if (section.data?.href) {
    const button = document.createElement('a');
    button.href = section.data.href;
    button.className = 'button button--primary';
    button.textContent = section.data.buttonLabel || 'Ver mÃ¡s';
    button.target = '_blank';
    button.rel = 'noopener';
    container.appendChild(button);
  }
  return container;
}

function renderValidationCardSection(section) {
  const container = baseSection('tarjetaValidacion');
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.innerHTML = section.data.title;
    container.appendChild(heading);
  }
  if (section.data?.description) {
    const description = document.createElement('p');
    description.innerHTML = section.data.description;
    container.appendChild(description);
  }

  const box = document.createElement('div');
  box.className = 'validation-box';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Numero de participacion';
  input.className = 'validation-input';
  input.style.width = '100%';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button--primary';
  button.textContent = 'comprobar';
  button.style.width = '100%';

  const feedback = document.createElement('div');
  feedback.className = 'validation-feedback';
  feedback.style.marginTop = '8px';
  feedback.style.minHeight = '1.25em';

  // Helpers para replicar el mensaje del microservicio
  const formatLocalDate = (isoString) => {
    try {
      const date = new Date(isoString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day} / ${month} / ${year} – ${hours}:${minutes} hs`;
    } catch (_) {
      return '';
    }
  };

  const promoMessages = [
    '👉 Seguí el canal de <a href="https://whatsapp.com/channel/0029VbBolV5A2pL9zNnhfT0n" target="_blank">WhatsApp</a> para enterarte de todas las novedades',
    '👀 ¡No te lo pierdas! Seguime en <a href="https://www.tiktok.com/@_milpeso" target="_blank">TikTok</a> para ver los vivos y próximos sorteos 🎥🍀',
    '👉 Seguime en <a href="https://www.facebook.com/elpelaaaaaaa/" target="_blank">Facebook</a> y activá las notificaciones 🔔 Así no te perdés de nada 💥',
    '👉 Entrá a mi <a href="https://www.instagram.com/__elpelaaa/" target="_blank">Instagram</a> y seguime 💚 Ahí aviso todos los sorteos, ganadores y promos 🔥'
  ];

  const getApiBase = () => {
    // Permite configurar en runtime: window.VALIDATION_API_BASE
    // Fallback al backend integrado en Node
    return (window && window.VALIDATION_API_BASE) || '/api/payments';
  };

  const setBusy = (busy) => {
    button.disabled = busy;
    input.disabled = busy;
  };

  const show = (text, color) => {
    feedback.textContent = text || '';
    feedback.style.color = color || 'inherit';
  };

  button.addEventListener('click', async () => {
    const raw = String(input.value || '').trim();
    if (!/^[0-9]{6,24}$/.test(raw)) {
      show('Ingresá un número válido (6-24 dígitos).', '#ff4d4f');
      return;
    }
    setBusy(true);
    show('Comprobando…', '#999');
    try {
      const url = `${getApiBase()}/verificar?op=${encodeURIComponent(raw)}`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && data.verified) {
        const participantName = String(data.payer_name || 'Participante').replace(/[0-9]/g, '');
        const formattedDate = data.fecha ? formatLocalDate(data.fecha) : '';
        const randomPromo = promoMessages[Math.floor(Math.random() * promoMessages.length)];
        const dateLine = formattedDate ? `\ndesde el <strong>${formattedDate}</strong><br><br>` : '';
        feedback.innerHTML = `💥 ¡Confirmado, <strong>${participantName}</strong>, ya estás jugando! 💪<br>
<br><em>Tu oportunidad está buscándote 🙂</em><br>
🎟️ Número: <strong>${data.numero_operacion || ''}</strong><br>
🤑 Participás en la promo <strong>${data.description || ''}</strong><br>${dateLine}
Guardá tu comprobante y preparate para el vivo 🔴<br><br>
${randomPromo}`;
        feedback.style.color = 'inherit';
      } else {
        show((data && data.mensaje) || 'No encontrado o no acreditado.', '#ff4d4f');
      }
    } catch (e) {
      console.error('validacion_error', e);
      show('No se pudo comprobar ahora. Intentá más tarde.', '#ff4d4f');
    } finally {
      setBusy(false);
    }
  });

  box.appendChild(input);
  box.appendChild(button);
  box.appendChild(feedback);
  container.appendChild(box);
  return container;
}

function renderWinnerCardsSection(section) {
  const container = baseSection('muroGanadores');
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.innerHTML = section.data.title;
    container.appendChild(heading);
  }
  const grid = document.createElement('div');
  grid.className = 'winner-grid';
  section.data?.cards?.forEach(card => {
    const cardEl = document.createElement('div');
    cardEl.className = 'winner-card';
    cardEl.addEventListener('click', () => {
      track('ganador_click', { name: card.winner || '', prize: card.prize || '' });
    });
    if (card.image) {
      const img = createImg(card.image, card.prize || 'Ganador');
      cardEl.appendChild(img);
    }
    const title = document.createElement('div');
    title.className = 'winner-card__title';
    title.innerHTML = card.winner || 'Ganador';
    cardEl.appendChild(title);

    const prize = document.createElement('div');
    prize.innerHTML = card.prize || '';
    cardEl.appendChild(prize);

    const meta = document.createElement('div');
    meta.className = 'winner-card__meta';
    meta.textContent = [card.date, card.location, card.ticket].filter(Boolean).join(' â€¢ ');
    cardEl.appendChild(meta);

    grid.appendChild(cardEl);
  });
  container.appendChild(grid);
  return container;
}

function baseSection(modifier) {
  const section = document.createElement('section');
  section.className = `section section--${modifier}`;
  return section;
}

function capitalise(value = '') {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function attachLightbox(frame, full) {
  if (!full || !frame) return;
  frame.dataset.fullsrc = full;
  frame.style.cursor = 'pointer';

  const open = (e) => {
    // Si está dentro de un <a>, evitamos navegar
    const anchor = frame.closest('a');
    if (anchor) e.preventDefault();
    e.stopPropagation();
    newLightbox.open(full);
  };

  frame.addEventListener('click', open);

  // Accesibilidad: Enter/Espacio
  frame.setAttribute('role', 'button');
  frame.setAttribute('tabindex', '0');
  frame.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(e);
    }
  });
}

