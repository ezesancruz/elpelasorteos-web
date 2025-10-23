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
      if (!appState.site.pages?.some(p => p.id === appState.pageId)) {
        appState.pageId = appState.site.pages?.[0]?.id || 'home';
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
  return navMatch?.pageId || site.pages?.[0]?.id || 'home';
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
  let media = document.getElementById('background-media');
  if (!media) {
    media = document.createElement('div');
    media.id = 'background-media';
    document.body.prepend(media);
  }
  media.innerHTML = '';
  if (background?.video) {
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
  } else if (background?.image) {
    const img = createImg(background.image, '');
    media.appendChild(img);
  }
  if (!document.getElementById('background-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'background-overlay';
    document.body.prepend(overlay);
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
  footer.textContent = `Â© ${new Date().getFullYear()} ${site.meta.title}. Todos los derechos reservados.`;

  shell.appendChild(nav);
  shell.appendChild(main);
  shell.appendChild(footer);

  appState.root.innerHTML = '';
  appState.root.appendChild(shell);
}

function renderNav(site, activePageId) {
  const nav = document.createElement('header');
  nav.className = 'top-nav';

  const brand = document.createElement('div');
  brand.className = 'top-nav__brand';
  brand.textContent = site.meta.title || 'Ojeda';

  const links = document.createElement('nav');
  links.className = 'top-nav__links';

  site.navigation?.forEach(item => {
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
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="7" r="1.3"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2h2a4.8 4.8 0 0 0 4.8 4.8v2a6.8 6.8 0 0 1-4-1.2v7.4a5.5 5.5 0 1 1-5.5-5.5c.32 0 .64.02.95.08V6.5h2v5.2a3.5 3.5 0 1 0 1.8 3.1V2z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.2c0-1.2.9-2.2 2.1-2.3C7.5 4.6 10.3 4.5 12 4.5s4.5.1 6.9.4c1.2.1 2.1 1.1 2.1 2.3v7.6c0 1.2-.9 2.2-2.1 2.3-2.4.3-5.2.4-6.9.4s-4.5-.1-6.9-.4C3.9 17 3 16 3 14.8V7.2z"/><path d="M10.5 8.25 15.5 12l-5 3.75V8.25z" fill="currentColor"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 9.5V7.8c0-1 .2-1.5 1.6-1.5h1.4V4h-2.4c-2.9 0-4.1 1.3-4.1 3.7v1.8H8v2.3h2v8.2h3v-8.2h2.1l.3-2.3H13.5z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3zm0 2a7 7 0 0 1 5.9 10.8l-.2.3a1 1 0 0 1-.7.5 1 1 0 0 1-.9-.3l-.7-.7a1 1 0 0 0-1.2-.2c-1.2.6-2.6-.4-4-1.8s-2.4-2.9-1.8-4a1 1 0 0 0-.2-1.2l-.7-.7a1 1 0 0 1-.1-1.3A7 7 0 0 1 12 5z"/></svg>',
  telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.7 4.3 3.8 11.3c-.9.3-.9 1.5-.1 1.9l4.3 1.9 1.6 4.8c.3.9 1.5 1 1.9.1l2.2-4.3 4.6 2c.8.3 1.7-.1 1.9-.9l2.2-11c.2-.9-.7-1.6-1.7-1.2z"/></svg>',
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
  const full = resolveFullImageSrc(srcOrObj);
  const img = document.createElement('img');
  img.src = resolved;
  img.alt = alt || '';
  img.loading = 'lazy';
  img.decoding = 'async';
  frame.appendChild(img);

  try {
    if (full) img.dataset.fullsrc = full;
    const title = (typeof srcOrObj === 'object' && srcOrObj && (srcOrObj.title || srcOrObj.caption)) || '';
    if (!img.title && title) img.title = String(title);
  } catch (_) {}

  applyImageDisplay(frame, img, srcOrObj);

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
  if (zoom === 1 && offsetX === 0.5 && offsetY === 0.5) {
    return null;
  }
  const invZoom = 1 / zoom;
  const translateX = (0.5 - offsetX) * invZoom * 100;
  const translateY = (0.5 - offsetY) * invZoom * 100;
  const value = `translate(${translateX}%, ${translateY}%) scale(${zoom})`;
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
    const banner = createImg(hero.bannerImage, hero.title || 'Banner');
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
    const profile = createImg(hero.profileImage, hero.title || 'Perfil');
    profile.className = 'hero-profile';
    profileWrapper.appendChild(profile);
    body.appendChild(profileWrapper);
  }

  const title = document.createElement('h1');
  title.className = 'hero__title';
  title.textContent = hero.title || '';
  body.appendChild(title);

  if (hero.subtitle) {
    const subtitle = document.createElement('p');
    subtitle.className = 'hero__subtitle';
    subtitle.textContent = hero.subtitle;
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
  muroGanadores: renderWinnerCardsSection,
  keyValue: renderKeyValueSection,
  faq: renderFAQSection
};

function renderRichTextSection(section) {
  const container = baseSection('textoInformativo');
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.textContent = section.data.title;
    container.appendChild(heading);
  }
  if (section.data?.html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = section.data.html;
    container.appendChild(wrapper);
  } else {
    section.data?.lines?.forEach(line => {
      const p = document.createElement('p');
      p.textContent = line;
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
    heading.textContent = section.data.title;
    container.appendChild(heading);
  }
  const list = document.createElement('dl');
  list.className = 'key-value';
  (section.data?.items || []).forEach(it => {
    const dt = document.createElement('dt');
    dt.textContent = it.k || '';
    const dd = document.createElement('dd');
    dd.textContent = it.v || '';
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
    h.textContent = title;
    container.appendChild(h);
  }
  const list = document.createElement('div');
  list.className = 'faq-list';
  (section.data?.items || section.items || []).forEach(i => {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = i.q || '';
    const answer = document.createElement('div');
    answer.className = 'answer';
    answer.textContent = i.a || '';
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
    heading.textContent = section.data.title;
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
      const imageEl = createImg(card.image, card.title || 'Link');
      anchor.appendChild(imageEl);
    }
    const title = document.createElement('div');
    title.className = 'link-card__title';
    title.textContent = card.title || 'Link';
    const subtitle = document.createElement('div');
    subtitle.className = 'link-card__subtitle';
    subtitle.textContent = card.subtitle || '';
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
    const frame = createImg(image, altText, { preferThumb: true });
    media.appendChild(frame);
    card.appendChild(media);

    const hasTitle = Boolean(image.title && image.title.trim());
    const hasSubtitle = Boolean(image.subtitle && image.subtitle.trim());
    if (hasTitle || hasSubtitle) {
      const body = document.createElement('div');
      body.className = 'image-card__body';
      if (hasTitle) {
        const title = document.createElement('div');
        title.className = 'image-card__title';
        title.textContent = image.title || '';
        body.appendChild(title);
      }
      if (hasSubtitle) {
        const subtitle = document.createElement('div');
        subtitle.className = 'image-card__subtitle';
        subtitle.textContent = image.subtitle || '';
        body.appendChild(subtitle);
      }
      card.appendChild(body);
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
    heading.textContent = section.data.title;
    container.appendChild(heading);
  }
  if (section.data?.description) {
    const description = document.createElement('p');
    description.textContent = section.data.description;
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
    const img = createImg(section.data.image, section.data?.title || 'Destacado');
    media.appendChild(img);
  }
  const body = document.createElement('div');
  body.className = 'imageHighlight__body';
  if (section.data?.title) {
    const heading = document.createElement('h3');
    heading.textContent = section.data.title;
    body.appendChild(heading);
  }
  if (section.data?.body) {
    const paragraph = document.createElement('p');
    paragraph.textContent = section.data.body;
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
    heading.textContent = section.data.title;
    container.appendChild(heading);
  }
  if (section.data?.body) {
    const paragraph = document.createElement('p');
    paragraph.textContent = section.data.body;
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

function renderWinnerCardsSection(section) {
  const container = baseSection('muroGanadores');
  if (section.data?.title) {
    const heading = document.createElement('h2');
    heading.textContent = section.data.title;
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
    title.textContent = card.winner || 'Ganador';
    cardEl.appendChild(title);

    const prize = document.createElement('div');
    prize.textContent = card.prize || '';
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

