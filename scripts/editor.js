const editorState = {
  isOpen: false,
  site: null,
  pageId: null,
  panel: null,
  toggle: null,
  config: null
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const resp = await fetch('/api/config');
    if (!resp || !resp.ok) throw new Error('config no disponible');
    const cfg = await resp.json();
        editorState.config = cfg;
    await waitForApp();
    initEditor();
  } catch (err) {
    console.warn('Editor no disponible (backend no activo o deshabilitado)', err);
  }
});

// Lee el token de administrador guardado en el mismo origen
// Para configurarlo manualmente desde la consola del navegador:
// localStorage.setItem('ADMIN_TOKEN', 'TU_TOKEN_LARGO')
const getAdminToken = () => localStorage.getItem('ADMIN_TOKEN') || '';
const withAdmin = (extra = {}) => {
  const t = getAdminToken();
  return t ? { ...extra, 'x-admin-token': t } : extra;
};

// Adjunta el token también por query (?token=...) para mayor compatibilidad
const withAdminUrl = (url) => {
  const t = getAdminToken();
  if (!t) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(t)}`;
};

function waitForApp() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      if (window.siteApp?.getSite) {
        resolve();
      } else if (Date.now() - start > 5000) {
        reject(new Error('Editor could not find siteApp controller'));
      } else {
        setTimeout(check, 50);
      }
    })();
  });
}

function initEditor() {
  editorState.site = window.siteApp.getSite();
  editorState.pageId = editorState.site.pages?.[0]?.id || 'home';
  createToggle();
  createPanel();
}

let panelRenderScheduled = false;

function debounce(fn, ms = 200) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

const debouncedPreview = debounce(() => renderPreview(), 200);

function onFieldInput() {
  debouncedPreview();
}

function renderPreview() {
  if (!editorState.site || !window.siteApp?.setSite) {
    return;
  }
  window.siteApp.setSite(deepClone(editorState.site));
}

function rerenderEditorPreservingScroll(renderFn) {
  const panel = editorState.panel;
  const prevScroll = panel ? panel.scrollTop : 0;

  const active = document.activeElement;
  const activeId = active && active.id;
  const selStart = (active && typeof active.selectionStart === "number") ? active.selectionStart : null;
  const selEnd = (active && typeof active.selectionEnd === "number") ? active.selectionEnd : null;

  renderFn();

  if (panel) panel.scrollTop = prevScroll;

  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus({ preventScroll: true });
      if (selStart != null && selEnd != null && typeof el.setSelectionRange === "function") {
        requestAnimationFrame(() => el.setSelectionRange(selStart, selEnd));
      }
    }
  }
}


async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(withAdminUrl('/api/upload'), {
    method: 'POST',
    headers: withAdmin(), // no establecer Content-Type manual con FormData
    body: fd
  });
  if (!res.ok) throw new Error('No se pudo subir la imagen');
  const { url } = await res.json();
  return url;
}

function setValueByPath(obj, pathArr, value) {
  if (!Array.isArray(pathArr) || pathArr.length === 0) return;
  let current = obj;
  for (let i = 0; i < pathArr.length - 1; i++) {
    const key = pathArr[i];
    const nextKey = pathArr[i + 1];
    if (current[key] === undefined || current[key] === null) {
      current[key] = typeof nextKey === 'number' ? [] : {};
    }
    current = current[key];
  }
  current[pathArr[pathArr.length - 1]] = value;
}

async function onPickImage(event, pathArr) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const url = await uploadImage(file);
    setValueByPath(editorState.site, pathArr, url);
    const textInput = event.target.previousElementSibling?.querySelector('input');
    if (textInput) textInput.value = url;
    debouncedPreview();
  } catch (error) {
    console.error('onPickImage', error);
    alert('No se pudo subir la imagen');
  } finally {
    event.target.value = '';
  }
}

function createToggle() {
  const btn = document.createElement('button');
  btn.id = 'editor-toggle';
  btn.className = 'editor-toggle';
  btn.type = 'button';
  btn.textContent = 'Editar';
  btn.addEventListener('click', () => togglePanel());
  document.body.appendChild(btn);
  editorState.toggle = btn;
}

function createPanel() {
  const panel = document.createElement('aside');
  panel.id = 'editor-panel';
  panel.className = 'editor-panel';

  const header = document.createElement('div');
  header.className = 'editor-panel__header';
  const title = document.createElement('div');
  title.textContent = 'Editor';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Cerrar';
  closeBtn.addEventListener('click', () => togglePanel(false));
  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'editor-panel__body';

  // Controles de autenticación (token ADMIN)
  const auth = document.createElement('div');
  auth.className = 'editor-panel__auth';
  function renderAuth() {
    auth.innerHTML = '';
    const token = getAdminToken();
    const status = document.createElement('div');
    status.textContent = token ? 'Estado: Autenticado' : 'Estado: No autenticado';
    auth.appendChild(status);
    if (token) {
      const masked = token.slice(0, 4) + '...' + token.slice(-4);
      const maskEl = document.createElement('div');
      maskEl.textContent = 'Token: ' + masked;
      auth.appendChild(maskEl);
      const changeBtn = document.createElement('button');
      changeBtn.type = 'button';
      changeBtn.textContent = 'Cambiar token';
      changeBtn.addEventListener('click', () => {
        const next = window.prompt('Pegá el nuevo ADMIN_TOKEN');
        if (typeof next === 'string') {
          if (next) localStorage.setItem('ADMIN_TOKEN', next); else localStorage.removeItem('ADMIN_TOKEN');
          renderAuth();
        }
      });
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.textContent = 'Salir';
      clearBtn.addEventListener('click', () => {
        localStorage.removeItem('ADMIN_TOKEN');
        renderAuth();
      });
      auth.appendChild(changeBtn);
      auth.appendChild(clearBtn);
    } else {
      const input = document.createElement('input');
      input.type = 'password';
      input.placeholder = 'Pegar ADMIN_TOKEN aquí';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = 'Guardar token';
      saveBtn.addEventListener('click', () => {
        const val = input.value.trim();
        if (val) {
          localStorage.setItem('ADMIN_TOKEN', val);
          input.value = '';
          renderAuth();
        } else {
          alert('El token no puede estar vacío');
        }
      });
      auth.appendChild(input);
      auth.appendChild(saveBtn);
    }
  }
  const tokenRequired = !!(editorState.config && editorState.config.tokenRequired);
  if (tokenRequired) {
    renderAuth();
  } else {
    const status = document.createElement('div');
    status.textContent = 'Edición local: no requiere token';
    auth.appendChild(status);
  }

  const actions = document.createElement('div');
  actions.className = 'editor-panel__actions';
  actions.appendChild(auth);
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.textContent = 'Descargar JSON';
  downloadBtn.addEventListener('click', downloadContent);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Guardar cambios';
  saveBtn.addEventListener('click', saveContent);

  actions.appendChild(downloadBtn);
  actions.appendChild(saveBtn);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(actions);
  document.body.appendChild(panel);

  editorState.panel = panel;
  editorState.body = body;
  renderPanel(true);
}

function togglePanel(force) {
  editorState.isOpen = typeof force === 'boolean' ? force : !editorState.isOpen;
  if (!editorState.panel) return;
  editorState.panel.classList.toggle('is-open', editorState.isOpen);
  if (editorState.isOpen) {
    editorState.site = window.siteApp.getSite();
    if (!editorState.site.pages.some(page => page.id === editorState.pageId)) {
      editorState.pageId = editorState.site.pages[0]?.id || 'home';
    }
    renderPanel(true);
  }
}

function renderPanel(immediate = false) {
  if (immediate) {
    panelRenderScheduled = false;
    rerenderEditorPreservingScroll(renderPanelImmediate);
    return;
  }
  if (panelRenderScheduled) return;
  panelRenderScheduled = true;
  requestAnimationFrame(() => {
    panelRenderScheduled = false;
    rerenderEditorPreservingScroll(renderPanelImmediate);
  });
}

function renderPanelImmediate() {
  if (!editorState.body) return;

  editorState.body.innerHTML = '';

  editorState.body.appendChild(renderPageSelector());
  editorState.body.appendChild(renderHeroEditor());
  editorState.body.appendChild(renderSectionsEditor());
  editorState.body.appendChild(renderThemeEditor());
}

function renderPageSelector() {
  const wrapper = document.createElement('div');
  const label = document.createElement('label');
  label.textContent = 'Pagina actual';
  const select = document.createElement('select');
  editorState.site.pages.forEach(page => {
    const option = document.createElement('option');
    option.value = page.id;
    option.textContent = page.title || page.id;
    if (page.id === editorState.pageId) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener('change', event => {
    editorState.pageId = event.target.value;
    window.siteApp.setPage(editorState.pageId);
    editorState.site = window.siteApp.getSite();
    renderPanel(true);
  });
  label.appendChild(select);
  wrapper.appendChild(label);
  return wrapper;
}

function renderHeroEditor() {
  const page = currentPage();
  const pageIndex = currentPageIndex();
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Hero';
  fieldset.appendChild(legend);

  fieldset.appendChild(createInput('Titulo', page.hero?.title || '', value => updateHero(hero => hero.title = value)));
  fieldset.appendChild(createInput('Subtitulo', page.hero?.subtitle || '', value => updateHero(hero => hero.subtitle = value)));
  const heroProfilePath = ['pages', pageIndex, 'hero', 'profileImage'];
  fieldset.appendChild(createImageField('Imagen de perfil', page.hero?.profileImage || '', heroProfilePath, value => updateHero(hero => hero.profileImage = value)));
  const heroBannerPath = ['pages', pageIndex, 'hero', 'bannerImage'];
  fieldset.appendChild(createImageField('Banner', page.hero?.bannerImage || '', heroBannerPath, value => updateHero(hero => hero.bannerImage = value)));

  const buttonsWrapper = document.createElement('div');
  buttonsWrapper.className = 'editor-inline-list';
  (page.hero?.buttons || []).forEach((button, index) => {
    const item = document.createElement('div');
    item.className = 'editor-inline-item';
    const header = document.createElement('div');
    header.className = 'editor-inline-item__header';
    header.textContent = `Boton ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', () => updateHero(hero => hero.buttons.splice(index, 1), { rerenderPanel: true }));
    header.appendChild(remove);
    item.appendChild(header);
    item.appendChild(createInput('Etiqueta', button.label || '', value => updateHero(hero => hero.buttons[index].label = value)));
    item.appendChild(createInput('URL', button.href || '', value => updateHero(hero => hero.buttons[index].href = value)));
    buttonsWrapper.appendChild(item);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Agregar boton';
  addBtn.addEventListener('click', () => updateHero(hero => {
    hero.buttons = hero.buttons || [];
    hero.buttons.push({ label: 'Nuevo boton', href: '#' });
  }, { rerenderPanel: true }));
  const buttonsFieldset = document.createElement('fieldset');
  const buttonsLegend = document.createElement('legend');
  buttonsLegend.textContent = 'Botones';
  buttonsFieldset.appendChild(buttonsLegend);
  buttonsFieldset.appendChild(buttonsWrapper);
  buttonsFieldset.appendChild(addBtn);
  fieldset.appendChild(buttonsFieldset);

  const socialWrapper = document.createElement('div');
  socialWrapper.className = 'editor-inline-list';
  (page.hero?.social || []).forEach((social, index) => {
    const item = document.createElement('div');
    item.className = 'editor-inline-item';
    const header = document.createElement('div');
    header.className = 'editor-inline-item__header';
    header.textContent = `Social ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', () => updateHero(hero => hero.social.splice(index, 1), { rerenderPanel: true }));
    header.appendChild(remove);
    item.appendChild(header);
    item.appendChild(createInput('Plataforma', social.platform || '', value => updateHero(hero => hero.social[index].platform = value)));
    item.appendChild(createInput('URL', social.url || '', value => updateHero(hero => hero.social[index].url = value)));
    socialWrapper.appendChild(item);
  });
  const addSocial = document.createElement('button');
  addSocial.type = 'button';
  addSocial.textContent = 'Agregar social';
  addSocial.addEventListener('click', () => updateHero(hero => {
    hero.social = hero.social || [];
    hero.social.push({ platform: 'instagram', url: '' });
  }, { rerenderPanel: true }));
  const socialFieldset = document.createElement('fieldset');
  const socialLegend = document.createElement('legend');
  socialLegend.textContent = 'Redes sociales';
  socialFieldset.appendChild(socialLegend);
  socialFieldset.appendChild(socialWrapper);
  socialFieldset.appendChild(addSocial);
  fieldset.appendChild(socialFieldset);

  return fieldset;
}

function renderSectionsEditor() {
  const page = currentPage();
  const container = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = 'Secciones';
  container.appendChild(heading);

  page.sections?.forEach((section, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'section-editor';

    const header = document.createElement('div');
    header.className = 'section-editor__heading';
    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${section.type}`;
    const controls = document.createElement('div');
    controls.className = 'section-editor__controls';

    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = 'Ã¢â€ â€˜';
    up.disabled = index === 0;
    up.addEventListener('click', () => moveSection(index, -1));

    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = 'Ã¢â€ â€œ';
    down.disabled = index === page.sections.length - 1;
    down.addEventListener('click', () => moveSection(index, 1));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Ã¢Å“â€¢';
    remove.addEventListener('click', () => removeSection(index));

    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(remove);

    header.appendChild(title);
    header.appendChild(controls);
    wrapper.appendChild(header);

    const body = document.createElement('div');
    body.className = 'section-editor__grid';
    body.appendChild(createInput('Identificador', section.id || '', value => updateSection(index, s => s.id = value)));

    const editor = sectionEditors[section.type];
    if (editor) {
      body.appendChild(editor(section, index));
    } else {
      const notice = document.createElement('p');
      notice.textContent = 'Tipo de seccion no soportado por el editor.';
      body.appendChild(notice);
    }

    wrapper.appendChild(body);
    container.appendChild(wrapper);
  });

  const addWrapper = document.createElement('div');
  addWrapper.className = 'editor-add-section';
  const select = document.createElement('select');
  Object.keys(defaultSections).forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Agregar seccion';
  addBtn.addEventListener('click', () => {
    const type = select.value;
    updatePage(page => {
      page.sections = page.sections || [];
      const base = deepClone(defaultSections[type]);
      base.id = `${type}-${Date.now()}`;
      page.sections.push(base);
    }, { rerenderPanel: true });
  });
  addWrapper.appendChild(select);
  addWrapper.appendChild(addBtn);
  container.appendChild(addWrapper);

  return container;
}

const sectionEditors = {
  richText(section, index) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(createInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    const textarea = createTextarea('Lineas (una por fila)', (section.data?.lines || []).join('\n'), value => updateSection(index, s => {
      s.data.lines = value.split('\n').map(line => line.trim()).filter(Boolean);
    }, { rerenderPanel: true }));
    wrapper.appendChild(textarea);
    return wrapper;
  },
  linkCards(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    const list = document.createElement('div');
    list.className = 'editor-inline-list';
    section.data?.cards?.forEach((card, cardIndex) => {
      const item = document.createElement('div');
      item.className = 'editor-inline-item';
      const header = document.createElement('div');
      header.className = 'editor-inline-item__header';
      header.textContent = `Opcion ${cardIndex + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Eliminar';
      remove.addEventListener('click', () => updateSection(index, s => s.data.cards.splice(cardIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      item.appendChild(header);
      item.appendChild(createInput('Titulo', card.title || '', value => updateSection(index, s => s.data.cards[cardIndex].title = value)));
      item.appendChild(createInput('Subtitulo', card.subtitle || '', value => updateSection(index, s => s.data.cards[cardIndex].subtitle = value)));
      item.appendChild(createInput('URL', card.href || '', value => updateSection(index, s => s.data.cards[cardIndex].href = value)));
      const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'cards', cardIndex, 'image'];
      item.appendChild(createImageField('Imagen', card.image || '', imagePath, value => updateSection(index, s => s.data.cards[cardIndex].image = value)));
      list.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Agregar opcion';
    addBtn.addEventListener('click', () => updateSection(index, s => {
      s.data.cards = s.data.cards || [];
      s.data.cards.push({ title: 'Nueva opcion', subtitle: '', href: '#', image: '' });
    }, { rerenderPanel: true }));
    wrapper.appendChild(list);
    wrapper.appendChild(addBtn);
    return wrapper;
  },
  imageGrid(section, index) {
    const list = document.createElement('div');
    const pageIndex = currentPageIndex();
    list.className = 'editor-inline-list';
    section.data?.images?.forEach((card, cardIndex) => {
      const item = document.createElement('div');
      item.className = 'editor-inline-item';
      const header = document.createElement('div');
      header.className = 'editor-inline-item__header';
      header.textContent = `Imagen ${cardIndex + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Eliminar';
      remove.addEventListener('click', () => updateSection(index, s => s.data.images.splice(cardIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      item.appendChild(header);
      const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'images', cardIndex, 'src'];
      item.appendChild(createImageField('Imagen', card.src || '', imagePath, value => updateSection(index, s => s.data.images[cardIndex].src = value)));
      item.appendChild(createInput('Link opcional', card.href || '', value => updateSection(index, s => s.data.images[cardIndex].href = value)));
      list.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Agregar imagen';
    addBtn.addEventListener('click', () => updateSection(index, s => {
      s.data.images = s.data.images || [];
      s.data.images.push({ src: '', href: '' });
    }, { rerenderPanel: true }));
    const wrapper = document.createElement('div');
    wrapper.appendChild(list);
    wrapper.appendChild(addBtn);
    return wrapper;
  },
  imageCarousel(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createInput('Descripcion', section.data?.description || '', value => updateSection(index, s => s.data.description = value)));
    const list = document.createElement('div');
    list.className = 'editor-inline-list';
    section.data?.images?.forEach((src, imgIndex) => {
      const item = document.createElement('div');
      item.className = 'editor-inline-item';
      const header = document.createElement('div');
      header.className = 'editor-inline-item__header';
      header.textContent = `Imagen ${imgIndex + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Eliminar';
      remove.addEventListener('click', () => updateSection(index, s => s.data.images.splice(imgIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      item.appendChild(header);
      const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'images', imgIndex];
      item.appendChild(createImageField('Imagen', src || '', imagePath, value => updateSection(index, s => s.data.images[imgIndex] = value)));
      list.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Agregar imagen';
    addBtn.addEventListener('click', () => updateSection(index, s => {
      s.data.images = s.data.images || [];
      s.data.images.push('');
    }, { rerenderPanel: true }));
    wrapper.appendChild(list);
    wrapper.appendChild(addBtn);
    return wrapper;
  },
  imageHighlight(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createInput('Descripcion', section.data?.body || '', value => updateSection(index, s => s.data.body = value)));
    const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'image'];
    wrapper.appendChild(createImageField('Imagen', section.data?.image || '', imagePath, value => updateSection(index, s => s.data.image = value)));
    return wrapper;
  },
  cta(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createInput('Mensaje', section.data?.body || '', value => updateSection(index, s => s.data.body = value)));
    wrapper.appendChild(createInput('Texto boton', section.data?.buttonLabel || '', value => updateSection(index, s => s.data.buttonLabel = value)));
    wrapper.appendChild(createInput('URL boton', section.data?.href || '', value => updateSection(index, s => s.data.href = value)));
    const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'image'];
    wrapper.appendChild(createImageField('Imagen', section.data?.image || '', imagePath, value => updateSection(index, s => s.data.image = value)));
    return wrapper;
  },
  winnerCards(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    const list = document.createElement('div');
    list.className = 'editor-inline-list';
    section.data?.cards?.forEach((card, cardIndex) => {
      const item = document.createElement('div');
      item.className = 'editor-inline-item';
      const header = document.createElement('div');
      header.className = 'editor-inline-item__header';
      header.textContent = `Ganador ${cardIndex + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Eliminar';
      remove.addEventListener('click', () => updateSection(index, s => s.data.cards.splice(cardIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      item.appendChild(header);
      item.appendChild(createInput('Nombre', card.winner || '', value => updateSection(index, s => s.data.cards[cardIndex].winner = value)));
      item.appendChild(createInput('Premio', card.prize || '', value => updateSection(index, s => s.data.cards[cardIndex].prize = value)));
      item.appendChild(createInput('Ticket', card.ticket || '', value => updateSection(index, s => s.data.cards[cardIndex].ticket = value)));
      item.appendChild(createInput('Fecha', card.date || '', value => updateSection(index, s => s.data.cards[cardIndex].date = value)));
      item.appendChild(createInput('Ubicacion', card.location || '', value => updateSection(index, s => s.data.cards[cardIndex].location = value)));
      const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'cards', cardIndex, 'image'];
      item.appendChild(createImageField('Imagen', card.image || '', imagePath, value => updateSection(index, s => s.data.cards[cardIndex].image = value)));
      list.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Agregar ganador';
    addBtn.addEventListener('click', () => updateSection(index, s => {
      s.data.cards = s.data.cards || [];
      s.data.cards.push({ winner: 'Nuevo ganador', prize: '', ticket: '', date: '', location: '', image: '' });
    }, { rerenderPanel: true }));
    wrapper.appendChild(list);
    wrapper.appendChild(addBtn);
    return wrapper;
  }
};

const defaultSections = {
  richText: {
    id: 'richText-new',
    type: 'richText',
    data: { title: 'Nuevo bloque', lines: ['Contenido editable'] }
  },
  linkCards: {
    id: 'linkCards-new',
    type: 'linkCards',
    data: { title: 'Nuevas opciones', cards: [{ title: 'Titulo', subtitle: 'Descripcion', href: '#', image: '' }] }
  },
  imageGrid: {
    id: 'imageGrid-new',
    type: 'imageGrid',
    data: { images: [{ src: '', href: '' }] }
  },
  imageCarousel: {
    id: 'imageCarousel-new',
    type: 'imageCarousel',
    data: { title: 'Galeria', description: '', images: [''] }
  },
  imageHighlight: {
    id: 'imageHighlight-new',
    type: 'imageHighlight',
    data: { title: 'Destacado', body: 'Descripcion', image: '' }
  },
  cta: {
    id: 'cta-new',
    type: 'cta',
    data: { title: 'Llamado a la accion', body: 'Descripcion', href: '#', buttonLabel: 'Ver mas', image: '' }
  },
  winnerCards: {
    id: 'winnerCards-new',
    type: 'winnerCards',
    data: { title: 'Ganadores', cards: [{ winner: 'Nombre', prize: 'Premio', ticket: '', date: '', location: '', image: '' }] }
  }
};

function renderThemeEditor() {
  const theme = editorState.site.theme || {};
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Tema y fondos';
  fieldset.appendChild(legend);

  fieldset.appendChild(createInput('Color primario', theme.colors?.primary || '#fe9200', value => updateTheme(themeDraft => themeDraft.colors.primary = value)));
  fieldset.appendChild(createInput('Color secundario', theme.colors?.accent || '#000000', value => updateTheme(themeDraft => themeDraft.colors.accent = value)));
  fieldset.appendChild(createInput('Color texto', theme.colors?.text || '#ffffff', value => updateTheme(themeDraft => themeDraft.colors.text = value)));

  fieldset.appendChild(createInput('Video de fondo (URL)', theme.background?.video || '', value => updateTheme(themeDraft => themeDraft.background.video = value)));
  const posterPath = ['theme', 'background', 'poster'];
  fieldset.appendChild(createImageField('Poster video', theme.background?.poster || '', posterPath, value => updateTheme(themeDraft => themeDraft.background.poster = value)));
  const backgroundImagePath = ['theme', 'background', 'image'];
  fieldset.appendChild(createImageField('Imagen de fondo', theme.background?.image || '', backgroundImagePath, value => updateTheme(themeDraft => themeDraft.background.image = value)));

  return fieldset;
}

function createInput(labelText, value, onChange) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.addEventListener('input', event => {
    onChange(event.target.value);
    onFieldInput(event);
  });
  label.appendChild(input);
  return label;
}

function createImageField(labelText, value, pathArr, onChange) {
  const container = document.createElement('div');
  container.className = 'editor-image-field';

  // Helpers
  const isSrcPath = String(pathArr[pathArr.length - 1]) === 'src';
  const objPath = isSrcPath ? pathArr.slice(0, -1) : pathArr.slice();

  function getValueByPath(obj, p) {
    return p.reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
  }
  function ensureImageObjectAtPath(p) {
    const parent = p.slice(0, -1).reduce((acc, key) => (acc[key] == null ? (acc[key] = (typeof key === 'number' ? [] : {})) : acc[key]), editorState.site);
    const last = p[p.length - 1];
    const curr = parent[last];
    if (typeof curr === 'string') {
      parent[last] = { src: curr };
    } else if (curr == null) {
      parent[last] = { src: '' };
    }
    return parent[last];
  }
  function setObjField(field, val) {
    if (isSrcPath) {
      // parent object is at objPath
      const base = getValueByPath(editorState.site, objPath) || ensureImageObjectAtPath(pathArr);
      base[field] = val;
    } else {
      const base = ensureImageObjectAtPath(pathArr);
      base[field] = val;
    }
    debouncedPreview();
  }

  // Valor actual normalizado
  const current = (() => {
    if (typeof value === 'string') return { src: value };
    if (value && typeof value === 'object') return { ...value };
    return { src: '' };
  })();

  // URL
  const textLabel = document.createElement('label');
  textLabel.textContent = labelText;
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.value = current.src || '';
  textInput.addEventListener('input', event => {
    const url = event.target.value;
    if (isSrcPath) {
      onChange(url);
    } else {
      ensureImageObjectAtPath(pathArr).src = url;
      debouncedPreview();
    }
    onFieldInput(event);
  });
  textLabel.appendChild(textInput);
  container.appendChild(textLabel);

  // Subir archivo
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      if (isSrcPath) {
        onChange(url);
      } else {
        ensureImageObjectAtPath(pathArr).src = url;
        debouncedPreview();
      }
      if (textInput) textInput.value = url;
    } catch (e) {
      console.error('uploadImage', e);
      alert('No se pudo subir la imagen');
    } finally {
      event.target.value = '';
    }
  });
  container.appendChild(fileInput);

  // Ajuste: cover/contain
  const fitLabel = document.createElement('label');
  fitLabel.textContent = 'Ajuste';
  const fitSelect = document.createElement('select');
  ;[
    { v: '', l: 'Por defecto (slot)' },
    { v: 'cover', l: 'Cubrir' },
    { v: 'contain', l: 'Contener' }
  ].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.v; o.textContent = opt.l;
    if (opt.v === (current.fit || '')) o.selected = true;
    fitSelect.appendChild(o);
  });
  fitSelect.addEventListener('change', (e) => {
    const val = e.target.value || undefined;
    setObjField('fit', val);
    onFieldInput(e);
  });
  fitLabel.appendChild(fitSelect);
  container.appendChild(fitLabel);

  // Alineación 3x3
  const alignLabel = document.createElement('label');
  alignLabel.textContent = 'Alineación';
  const alignSelect = document.createElement('select');
  const alignOpts = [
    { v: '', l: 'Por defecto (centro)' },
    { v: 'top-left', l: 'Arriba Izquierda' },
    { v: 'top-center', l: 'Arriba Centro' },
    { v: 'top-right', l: 'Arriba Derecha' },
    { v: 'center-left', l: 'Centro Izquierda' },
    { v: 'center', l: 'Centro' },
    { v: 'center-right', l: 'Centro Derecha' },
    { v: 'bottom-left', l: 'Abajo Izquierda' },
    { v: 'bottom-center', l: 'Abajo Centro' },
    { v: 'bottom-right', l: 'Abajo Derecha' }
  ];
  alignOpts.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.v; o.textContent = opt.l;
    if (opt.v === (current.align || '')) o.selected = true;
    alignSelect.appendChild(o);
  });
  alignSelect.addEventListener('change', (e) => {
    const val = e.target.value || undefined;
    setObjField('align', val);
    onFieldInput(e);
  });
  alignLabel.appendChild(alignSelect);
  container.appendChild(alignLabel);

  // Foco fino XY
  const xyWrapper = document.createElement('div');
  const fxLabel = document.createElement('label');
  fxLabel.textContent = 'Foco X (%)';
  const fxInput = document.createElement('input');
  fxInput.type = 'number';
  fxInput.min = '0'; fxInput.max = '100'; fxInput.step = '1';
  fxInput.value = (typeof current.focusX === 'number') ? String(current.focusX) : '';
  fxInput.placeholder = '0–100';
  fxInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    const num = val === '' ? undefined : Math.max(0, Math.min(100, Number(val)));
    setObjField('focusX', num);
    onFieldInput(e);
  });
  fxLabel.appendChild(fxInput);

  const fyLabel = document.createElement('label');
  fyLabel.textContent = 'Foco Y (%)';
  const fyInput = document.createElement('input');
  fyInput.type = 'number';
  fyInput.min = '0'; fyInput.max = '100'; fyInput.step = '1';
  fyInput.value = (typeof current.focusY === 'number') ? String(current.focusY) : '';
  fyInput.placeholder = '0–100';
  fyInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    const num = val === '' ? undefined : Math.max(0, Math.min(100, Number(val)));
    setObjField('focusY', num);
    onFieldInput(e);
  });
  fyLabel.appendChild(fyInput);

  xyWrapper.appendChild(fxLabel);
  xyWrapper.appendChild(fyLabel);
  container.appendChild(xyWrapper);

  return container;
}

function createTextarea(labelText, value, onChange) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const textarea = document.createElement('textarea');
  textarea.value = value || '';
  textarea.addEventListener('input', event => {
    onChange(event.target.value);
    onFieldInput(event);
  });
  label.appendChild(textarea);
  return label;
}

function updateSite(mutator, { rerenderPanel = false } = {}) {
  if (!editorState.site) return;
  mutator(editorState.site);
  debouncedPreview();
  if (rerenderPanel) renderPanel(true);
}

function updateHero(mutator, options = {}) {
  updatePage(page => {
    page.hero = page.hero || {};
    page.hero.buttons = Array.isArray(page.hero.buttons) ? page.hero.buttons : [];
    page.hero.social = Array.isArray(page.hero.social) ? page.hero.social : [];
    mutator(page.hero);
  }, options);
}

function moveSection(index, delta) {
  updatePage(page => {
    const sections = page.sections || [];
    const target = sections.splice(index, 1)[0];
    sections.splice(index + delta, 0, target);
  }, { rerenderPanel: true });
}

function removeSection(index) {
  updatePage(page => {
    page.sections.splice(index, 1);
  }, { rerenderPanel: true });
}

function updateSection(index, mutator, options = {}) {
  updatePage(page => {
    const section = page.sections[index];
    if (!section) return;
    mutator(section);
  }, options);
}

function updateTheme(mutator, options = {}) {
  updateSite(site => {
    site.theme = site.theme || { colors: {}, fonts: {}, background: {} };
    site.theme.colors = site.theme.colors || {};
    site.theme.background = site.theme.background || {};
    mutator(site.theme);
  }, options);
}

function updatePage(mutator, options = {}) {
  updateSite(site => {
    const page = site.pages.find(p => p.id === editorState.pageId);
    if (!page) return;
    page.sections = Array.isArray(page.sections) ? page.sections : [];
    mutator(page);
  }, options);
}
function currentPageIndex() {
  const index = editorState.site.pages.findIndex(page => page.id === editorState.pageId);
  return index === -1 ? 0 : index;
}
function currentPage() {
  return editorState.site.pages.find(p => p.id === editorState.pageId) || editorState.site.pages[0];
}

function downloadContent() {
  const blob = new Blob([JSON.stringify(editorState.site, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'site-content.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function saveContent() {
  try {
    const response = await fetch(withAdminUrl('/api/content'), {
      method: 'PUT',
      headers: withAdmin({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(editorState.site, null, 2)
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    alert('Contenido guardado correctamente.');
  } catch (error) {
    alert('No se pudo guardar automaticamente. DescargÃƒÂ¡ el JSON y reemplazalo manualmente.');
    console.error(error);
  }
}

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}


















