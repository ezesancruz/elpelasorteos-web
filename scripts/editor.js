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

const PRESET_THEME_COLORS = [
  '#fe9200', '#f5a623', '#ff6f61', '#ff4d4f', '#f8e71c',
  '#7ed321', '#417505', '#50e3c2', '#4a90e2', '#9013fe',
  '#bd10e0', '#b8e986', '#4a4a4a', '#000000', '#ffffff'
];

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
  const payload = await res.json();
  if (!payload || typeof payload.url !== 'string') {
    throw new Error('Respuesta de subida invalida');
  }
  return payload;
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
    const uploaded = await uploadImage(file);
    const payload = { src: uploaded.url };
    if (uploaded.thumb) payload.thumb = uploaded.thumb;
    if (String(pathArr[pathArr.length - 1]) === 'src') {
      setValueByPath(editorState.site, pathArr.slice(0, -1), payload);
    } else {
      setValueByPath(editorState.site, pathArr, payload);
    }
    const textInput = event.target.previousElementSibling?.querySelector('input');
    if (textInput) textInput.value = uploaded.url;
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

  fieldset.appendChild(createRichTextInput('Titulo', page.hero?.title || '', value => updateHero(hero => hero.title = value)));
  fieldset.appendChild(createRichTextInput('Subtitulo', page.hero?.subtitle || '', value => updateHero(hero => hero.subtitle = value)));
  const heroProfilePath = ['pages', pageIndex, 'hero', 'profileImage'];
  fieldset.appendChild(createImageField('Imagen de perfil', page.hero?.profileImage || '', heroProfilePath, value => updateHero(hero => hero.profileImage = value), { aspect: 1 }));
  const heroBannerPath = ['pages', pageIndex, 'hero', 'bannerImage'];
  fieldset.appendChild(createImageField(
    'Banner',
    page.hero?.bannerImage || '',
    heroBannerPath,
    value => updateHero(hero => hero.bannerImage = value),
    { aspect: 16 / 9 }
  ));

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
    const wrapper = document.createElement('details');
    wrapper.className = 'section-editor';
    wrapper.open = true;

    const summary = document.createElement('summary');
    summary.className = 'section-editor__heading';

    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${section.type}`;
    const controls = document.createElement('div');
    controls.className = 'section-editor__controls';

    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.disabled = index === 0;
    up.addEventListener('click', () => moveSection(index, -1));

    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.disabled = index === page.sections.length - 1;
    down.addEventListener('click', () => moveSection(index, 1));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'x';
    remove.addEventListener('click', () => removeSection(index));

    const toggleCollapse = document.createElement('button');
    toggleCollapse.type = 'button';
    toggleCollapse.textContent = wrapper.open ? '▼' : '▲';
    toggleCollapse.addEventListener('click', (event) => {
      event.stopPropagation(); // Prevent the summary from toggling
      wrapper.open = !wrapper.open;
      toggleCollapse.textContent = wrapper.open ? '▼' : '▲';
    });

    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(remove);
    controls.appendChild(toggleCollapse); // Add the new button

    summary.appendChild(title);
    summary.appendChild(controls);
    wrapper.appendChild(summary);

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
    option.textContent = sectionAliases[type] || type;
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
  textoInformativo(section, index) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    const textarea = createRichTextInput('Lineas (una por fila)', (section.data?.lines || []).join('\n'), value => updateSection(index, s => {
      s.data.lines = value.split('\n');
    }));
    wrapper.appendChild(textarea);
    return wrapper;
  },
  opcionesCompra(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
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
      item.appendChild(createRichTextInput('Titulo', card.title || '', value => updateSection(index, s => s.data.cards[cardIndex].title = value)));
      item.appendChild(createRichTextInput('Subtitulo', card.subtitle || '', value => updateSection(index, s => s.data.cards[cardIndex].subtitle = value)));
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
  galeriaImagenes(section, index) {
    const list = document.createElement('div');
    const pageIndex = currentPageIndex();
    list.className = 'editor-inline-list';
    const mutateImage = (cardIndex, mutator) => {
      updateSection(index, s => {
        s.data.images = s.data.images || [];
        let current = s.data.images[cardIndex];
        if (!current || typeof current !== 'object') {
          current = normalizeImageValue(current);
          s.data.images[cardIndex] = current;
        }
        mutator(current);
      });
    };
    (section.data?.images || []).forEach((card, cardIndex) => {
      const image = normalizeImageValue(card);      const item = document.createElement('div');
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
      const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'images', cardIndex];
      item.appendChild(createImageField('Imagen', image, imagePath, value => mutateImage(cardIndex, img => Object.assign(img, normalizeImageValue(value))), { aspect: 3 / 4 }));
      item.appendChild(createInput('Link opcional', image.href || '', value => mutateImage(cardIndex, img => {
        img.href = value;
      })));
      item.appendChild(createRichTextInput('Título (opcional)', image.title || '', value => mutateImage(cardIndex, img => {
        img.title = value;
      })));
      item.appendChild(createRichTextInput('Subtítulo (opcional)', image.subtitle || '', value => mutateImage(cardIndex, img => {
        img.subtitle = value;
      })));
      list.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Agregar imagen';
    addBtn.addEventListener('click', () => updateSection(index, s => {
      s.data.images = s.data.images || [];
      s.data.images.push({ src: '', href: '', title: '', subtitle: '' });
    }, { rerenderPanel: true }));
    const wrapper = document.createElement('div');
    wrapper.appendChild(list);
    wrapper.appendChild(addBtn);
    return wrapper;
  },
  carruselImagenes(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createRichTextInput('Descripcion', section.data?.description || '', value => updateSection(index, s => s.data.description = value)));
    const list = document.createElement('div');
    list.className = 'editor-inline-list';
    const ensureImage = (imgIndex, mutator) => {
      updateSection(index, s => {
        s.data.images = s.data.images || [];
        let current = s.data.images[imgIndex];
        if (!current || typeof current !== 'object') {
          current = normalizeImageValue(current);
          s.data.images[imgIndex] = current;
        }
        mutator(current);
      });
    };
    (section.data?.images || []).forEach((src, imgIndex) => {
      const image = normalizeImageValue(src);
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
                  item.appendChild(createImageField('Imagen', image, imagePath, value => ensureImage(imgIndex, img => Object.assign(img, normalizeImageValue(value))), { aspect: 9 / 16 }));
                  list.appendChild(item);
                });
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.textContent = 'Agregar imagen';
                addBtn.addEventListener('click', () => updateSection(index, s => {
                  s.data.images = s.data.images || [];
                  s.data.images.push({ src: '' });
                }, { rerenderPanel: true }));    wrapper.appendChild(list);
    wrapper.appendChild(addBtn);
    return wrapper;
  },
  detalleVisual(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createRichTextInput('Descripcion', section.data?.body || '', value => updateSection(index, s => s.data.body = value)));
    const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'image'];
    wrapper.appendChild(createImageField(
      'Imagen',
      section.data?.image || '',
      imagePath,
      value => updateSection(index, s => s.data.image = value),
      { aspect: 5 / 6 }
    ));
    return wrapper;
  },
  botonAccion(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createRichTextInput('Mensaje', section.data?.body || '', value => updateSection(index, s => s.data.body = value)));
    wrapper.appendChild(createInput('Texto boton', section.data?.buttonLabel || '', value => updateSection(index, s => s.data.buttonLabel = value)));
    wrapper.appendChild(createInput('URL boton', section.data?.href || '', value => updateSection(index, s => s.data.href = value)));
    const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'image'];
    wrapper.appendChild(createImageField('Imagen', section.data?.image || '', imagePath, value => updateSection(index, s => s.data.image = value)));
    return wrapper;
  },
  muroGanadores(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
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
      item.appendChild(createRichTextInput('Nombre', card.winner || '', value => updateSection(index, s => s.data.cards[cardIndex].winner = value)));
      item.appendChild(createRichTextInput('Premio', card.prize || '', value => updateSection(index, s => s.data.cards[cardIndex].prize = value)));
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
  },
  faq(section, index) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    const list = document.createElement('div');
    list.className = 'editor-inline-list';
    (section.data?.items || []).forEach((item, itemIndex) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'editor-inline-item';
      const header = document.createElement('div');
      header.className = 'editor-inline-item__header';
      header.textContent = `Pregunta ${itemIndex + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Eliminar';
      remove.addEventListener('click', () => updateSection(index, s => s.data.items.splice(itemIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      itemEl.appendChild(header);
      itemEl.appendChild(createRichTextInput('Pregunta', item.q || '', value => updateSection(index, s => s.data.items[itemIndex].q = value)));
      itemEl.appendChild(createRichTextInput('Respuesta', item.a || '', value => updateSection(index, s => s.data.items[itemIndex].a = value)));
      list.appendChild(itemEl);
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Agregar pregunta';
    addBtn.addEventListener('click', () => updateSection(index, s => {
      s.data.items = s.data.items || [];
      s.data.items.push({ q: 'Nueva pregunta', a: 'Nueva respuesta' });
    }, { rerenderPanel: true }));
    wrapper.appendChild(list);
    wrapper.appendChild(addBtn);
    return wrapper;
  }
};

const defaultSections = {
  textoInformativo: {
    id: 'textoInformativo-new',
    type: 'textoInformativo',
    data: { title: 'Nuevo bloque', lines: ['Contenido editable'] }
  },
  opcionesCompra: {
    id: 'opcionesCompra-new',
    type: 'opcionesCompra',
    data: { title: 'Nuevas opciones', cards: [{ title: 'Titulo', subtitle: 'Descripcion', href: '#', image: '' }] }
  },
  galeriaImagenes: {
    id: 'galeriaImagenes-new',
    type: 'galeriaImagenes',
    data: { images: [{ src: '', href: '', title: '', subtitle: '' }] }
  },
  carruselImagenes: {
    id: 'carruselImagenes-new',
    type: 'carruselImagenes',
    data: { title: 'Galeria', description: '', images: [{ src: '' }] }
  },
  detalleVisual: {
    id: 'detalleVisual-new',
    type: 'detalleVisual',
    data: { title: 'Destacado', body: 'Descripcion', image: '' }
  },
  botonAccion: {
    id: 'botonAccion-new',
    type: 'botonAccion',
    data: { title: 'Llamado a la accion', body: 'Descripcion', href: '#', buttonLabel: 'Ver mas', image: '' }
  },
  muroGanadores: {
    id: 'muroGanadores-new',
    type: 'muroGanadores',
    data: { title: 'Ganadores', cards: [{ winner: 'Nombre', prize: 'Premio', ticket: '', date: '', location: '', image: '' }] }
  },
  faq: {
    id: 'faq-new',
    type: 'faq',
    data: {
        title: 'Preguntas frecuentes',
        items: [{
            q: '¿Cómo sé si gané?',
            a: 'Lo publicamos en la web y redes; además te contactamos.'
        }]
    }
  }
};

const sectionAliases = {
  textoInformativo: 'Tarjeta texto',
  opcionesCompra: 'Tarjeta productos',
  galeriaImagenes: 'Tarjeta galería de imágenes',
  carruselImagenes: 'Tarjeta carrusel de imágenes',
  detalleVisual: 'Tarjeta detalle visual',
  botonAccion: 'Tarjeta tienda',
  muroGanadores: 'Tarjeta muro de ganadores',
  faq: 'Tarjeta FAQ'
};

function renderThemeEditor() {
  const theme = editorState.site.theme || {};
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'Tema y fondos';
  fieldset.appendChild(legend);

  fieldset.appendChild(createColorField('Color de botón', theme.colors?.primary || '#fe9200', value => updateTheme(themeDraft => themeDraft.colors.primary = value)));
  fieldset.appendChild(createColorField('Color de fondo', theme.colors?.accent || '#000000', value => updateTheme(themeDraft => themeDraft.colors.accent = value)));
  fieldset.appendChild(createColorField('Color texto', theme.colors?.text || '#ffffff', value => updateTheme(themeDraft => themeDraft.colors.text = value)));


  fieldset.appendChild(createInput('Video de fondo (URL)', theme.background?.video || '', value => updateTheme(themeDraft => themeDraft.background.video = value)));
          fieldset.appendChild(createRadioGroup(
            'Tipo de fondo',
            [
              { value: 'none', label: 'Ninguno' },
              { value: 'video', label: 'Video' },
              { value: 'image', label: 'Imagen' }
            ],
            theme.background?.backgroundMode || 'none',
            value => updateTheme(themeDraft => themeDraft.background.backgroundMode = value, { rerenderPanel: true })
          ));
        
          // Video background fields
          const videoFields = document.createElement('div');
          videoFields.style.display = (theme.background?.backgroundMode === 'video') ? 'block' : 'none';
          videoFields.appendChild(createInput('Video de fondo (URL)', theme.background?.video || '', value => updateTheme(themeDraft => themeDraft.background.video = value)));
          const posterPath = ['theme', 'background', 'poster'];
          videoFields.appendChild(createImageField('Poster video', theme.background?.poster || '', posterPath, value => updateTheme(themeDraft => themeDraft.background.poster = value)));
          fieldset.appendChild(videoFields);
        
          // Image background fields
          const imageFields = document.createElement('div');
          imageFields.style.display = (theme.background?.backgroundMode === 'image') ? 'block' : 'none';
          const backgroundImagePath = ['theme', 'background', 'image'];
          imageFields.appendChild(createImageField('Imagen de fondo', theme.background?.image || '', backgroundImagePath, value => updateTheme(themeDraft => themeDraft.background.image = value)));
          fieldset.appendChild(imageFields);  return fieldset;
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

function createColorField(labelText, value, onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'editor-color-field';

  const controls = document.createElement('div');
  controls.className = 'editor-color-field__controls';

  const label = document.createElement('label');
  label.className = 'editor-color-field__label';

  const title = document.createElement('span');
  title.textContent = labelText;
  label.appendChild(title);

  controls.appendChild(label);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'editor-color-field__toggle';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.textContent = 'Mostrar/Ocultar colores';

  const preview = document.createElement('span');
  preview.className = 'editor-color-field__preview';
  toggleBtn.prepend(preview);

  controls.appendChild(toggleBtn);
  wrapper.appendChild(controls);

  const palette = document.createElement('div');
  palette.className = 'editor-color-field__palette';
  palette.hidden = true;

  const swatchList = document.createElement('div');
  swatchList.className = 'editor-color-field__swatches';
  PRESET_THEME_COLORS.slice(0, 6).forEach(color => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'editor-color-field__swatch';
    swatch.style.setProperty('--swatch-color', color);
    swatch.setAttribute('aria-label', `Usar ${color}`);
    swatch.addEventListener('click', () => updateColor(color));
    swatchList.appendChild(swatch);
  });
  palette.appendChild(swatchList);

  const pickColorBtn = document.createElement('button');
  pickColorBtn.type = 'button';
  pickColorBtn.className = 'editor-color-field__pick-btn';
  pickColorBtn.textContent = 'Elegir de paleta';
  pickColorBtn.addEventListener('click', () => colorInput.click());
  palette.appendChild(pickColorBtn);

  const customRow = document.createElement('div');
  customRow.className = 'editor-color-field__custom';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = expandHexToSix(value) || '#ffffff';
  customRow.appendChild(colorInput);

  const codeLabel = document.createElement('label');
  codeLabel.className = 'editor-color-field__code';
  codeLabel.textContent = 'Código';
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = '#rrggbb';
  codeInput.value = value || '';
  codeLabel.appendChild(codeInput);
  customRow.appendChild(codeLabel);

  palette.appendChild(customRow);
  wrapper.appendChild(palette);

  toggleBtn.addEventListener('click', () => {
    const isHidden = palette.hidden;
    palette.hidden = !isHidden;
    toggleBtn.setAttribute('aria-expanded', String(isHidden));
  });



  let syncing = false;

  function updateColor(rawValue, { silent = false } = {}) {
    if (syncing) return;
    syncing = true;

    const normalized = normalizeColorValue(rawValue);
    const expanded = expandHexToSix(normalized);

    if (codeInput.value !== normalized) codeInput.value = normalized;

    if (expanded) {
      colorInput.value = expanded;
      preview.style.backgroundColor = expanded;
      preview.classList.remove('is-empty');
    } else {
      preview.style.backgroundColor = normalized || 'transparent';
      preview.classList.toggle('is-empty', !normalized);
    }

    if (!silent) {
      onChange(normalized);
      onFieldInput();
    }

    syncing = false;
  }

  colorInput.addEventListener('input', event => updateColor(event.target.value));
  codeInput.addEventListener('input', event => updateColor(event.target.value));

  updateColor(value || '', { silent: true });

  return wrapper;
}

function normalizeColorValue(value) {
  if (typeof value !== 'string') return '';
  let hex = value.trim();
  if (!hex) return '';
  if (!hex.startsWith('#') && /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
    hex = `#${hex}`;
  }
  const matchShort = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (matchShort) {
    return `#${matchShort[1].toLowerCase()}`;
  }
  const matchLong = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (matchLong) {
    return `#${matchLong[1].toLowerCase()}`;
  }
  if (hex.startsWith('#')) {
    return `#${hex.slice(1).toLowerCase()}`;
  }
  return hex;
}

function expandHexToSix(value) {
  if (typeof value !== 'string') return null;
  const hex = value.trim();
  if (!hex) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toLowerCase();
  }
  const short = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

function normalizeImageValue(value) {
  if (!value) return { src: '' };
  if (typeof value === 'string') return { src: value };
  if (typeof value !== 'object') return { src: '' };
  const copy = { ...value };
  if (!copy.src && copy.url) copy.src = copy.url;
  if (copy.focusX != null || copy.focusY != null || copy.align) {
    const legacy = convertLegacyCrop(copy);
    if (legacy) {
      copy.crop = legacy;
    }
  }
  return copy;
}

function convertLegacyCrop(obj) {
  try {
    if (!obj) return null;
    const crop = { zoom: 1, offsetX: 0.5, offsetY: 0.5 };
    if (typeof obj.focusX === 'number') {
      crop.offsetX = Math.max(0, Math.min(100, obj.focusX)) / 100;
    } else if (typeof obj.align === 'string') {
      const mapX = { 'left': 0.1, 'center': 0.5, 'right': 0.9 };
      const mapY = { 'top': 0.1, 'center': 0.5, 'bottom': 0.9 };
      const [y, x] = obj.align.split('-');
      crop.offsetX = mapX[x] ?? mapX[y] ?? 0.5;
      crop.offsetY = mapY[y] ?? mapY[x] ?? 0.5;
    }
    if (typeof obj.focusY === 'number') {
      crop.offsetY = Math.max(0, Math.min(100, obj.focusY)) / 100;
    }
    return crop;
  } catch (_) {
    return null;
  }
}

function guessAspectFromPath(pathArr = []) {
  const joined = pathArr.map(String).join('.').toLowerCase();
  if (joined.includes('banner') || joined.includes('background')) return 16 / 9;
  if (joined.includes('profile')) return 1;
  if (joined.includes('winner')) return 3 / 4;
  if (joined.includes('galeria') || joined.includes('gallery')) return 3 / 4;
  if (joined.includes('carousel') || joined.includes('carrusel')) return 9 / 16;
  if (joined.includes('card')) return 4 / 3;
  return 4 / 3;
}

let cropperOverlay;

function ensureCropperOverlay() {
  if (cropperOverlay) return cropperOverlay;
  const overlay = document.createElement('div');
  overlay.className = 'editor-cropper-overlay';

  const panel = document.createElement('div');
  panel.className = 'editor-cropper';
  overlay.appendChild(panel);

  const title = document.createElement('div');
  title.className = 'editor-cropper__title';
  title.textContent = 'Ajustar recorte';
  panel.appendChild(title);

  const body = document.createElement('div');
  body.className = 'editor-cropper__body';
  panel.appendChild(body);

  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 400;
  canvas.className = 'editor-cropper__canvas';
  body.appendChild(canvas);

  const aside = document.createElement('div');
  aside.className = 'editor-cropper__aside';
  body.appendChild(aside);

  const previewLabel = document.createElement('div');
  previewLabel.className = 'editor-cropper__label';
  previewLabel.textContent = 'Miniatura';
  aside.appendChild(previewLabel);

  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 200;
  previewCanvas.height = 200;
  previewCanvas.className = 'editor-cropper__preview';
  aside.appendChild(previewCanvas);

  const zoomWrapper = document.createElement('label');
  zoomWrapper.className = 'editor-cropper__zoom';
  zoomWrapper.textContent = 'Zoom';
  const zoomInput = document.createElement('input');
  zoomInput.type = 'range';
  zoomInput.min = '1';
  zoomInput.max = '4';
  zoomInput.step = '0.01';
  zoomWrapper.appendChild(zoomInput);
  aside.appendChild(zoomWrapper);

  const actions = document.createElement('div');
  actions.className = 'editor-cropper__actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'editor-cropper__cancel';
  cancelBtn.textContent = 'Cancelar';
  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'editor-cropper__confirm';
  confirmBtn.textContent = 'Aplicar';
  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  panel.appendChild(actions);

  cropperOverlay = { overlay, panel, canvas, previewCanvas, zoomInput, cancelBtn, confirmBtn };
  document.body.appendChild(overlay);
  return cropperOverlay;
}

function openImageCropper({ src, aspect = 1, initialCrop }) {
  return new Promise((resolve, reject) => {
    const { overlay, canvas, previewCanvas, zoomInput, cancelBtn, confirmBtn } = ensureCropperOverlay();
    overlay.classList.add('is-open');

    let active = true;
    const ctx = canvas.getContext('2d');
    const previewCtx = previewCanvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const state = {
      aspect,
      baseScale: 1,
      zoom: 1,
      centerX: 0.5,
      centerY: 0.5
    };

    let pointerId = null;
    let lastX = 0;
    let lastY = 0;

    function clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    }

    function updateCanvasSize() {
      const maxWidth = 600;
      const maxHeight = 450;
      const aspect = state.aspect;

      let width = maxWidth;
      let height = width / aspect;

      if (height > maxHeight) {
        height = maxHeight;
        width = height * aspect;
      }

      canvas.width = width;
      canvas.height = height;
      previewCanvas.width = 200;
      previewCanvas.height = Math.round(previewCanvas.width / aspect);
    }

    function updateBaseScale() {
      const vw = canvas.width;
      const vh = canvas.height;
      const scaleX = vw / img.width;
      const scaleY = vh / img.height;
      state.baseScale = Math.max(scaleX, scaleY);
    }

    function clampCenter() {
      const scale = state.baseScale * state.zoom;
      const halfWidth = canvas.width / (2 * scale);
      const halfHeight = canvas.height / (2 * scale);
      state.centerX = clamp(state.centerX, halfWidth / img.width, 1 - halfWidth / img.width);
      state.centerY = clamp(state.centerY, halfHeight / img.height, 1 - halfHeight / img.height);
    }

    function draw() {
      if (!active) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = state.baseScale * state.zoom;
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      const dx = canvas.width / 2 - state.centerX * drawWidth;
      const dy = canvas.height / 2 - state.centerY * drawHeight;
      ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.fillStyle = '#000';
      previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      const scalePreview = previewCanvas.width / canvas.width;
      previewCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, previewCanvas.width, previewCanvas.height);
    }

    function close(result) {
      if (!active) return;
      active = false;
      overlay.classList.remove('is-open');
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      zoomInput.removeEventListener('input', onZoomChange);
      window.removeEventListener('keydown', onKeyDown);
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      if (result) {
        resolve(result);
      } else {
        reject(new Error('cancelled'));
      }
    }

    function onPointerDown(event) {
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(pointerId);
    }

    function onPointerMove(event) {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      const scale = state.baseScale * state.zoom;
      state.centerX -= dx / (img.width * scale);
      state.centerY -= dy / (img.height * scale);
      clampCenter();
      draw();
    }

    function onPointerUp(event) {
      if (pointerId !== event.pointerId) return;
      canvas.releasePointerCapture(pointerId);
      pointerId = null;
    }

    function setZoom(z) {
      const newZoom = clamp(z, 1, 4);
      if (newZoom === state.zoom) return;
      state.zoom = newZoom;
      zoomInput.value = String(state.zoom);
      clampCenter();
      draw();
    }

    function onZoomChange(event) {
      setZoom(Number(event.target.value));
    }

    function onWheel(event) {
      event.preventDefault();
      const delta = -event.deltaY / 500;
      setZoom(state.zoom + delta);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }

    function onCancel() {
      close(null);
    }

    function onConfirm() {
      const scale = state.baseScale * state.zoom;
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      const dx = canvas.width / 2 - state.centerX * drawWidth;
      const dy = canvas.height / 2 - state.centerY * drawHeight;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const exportCtx = exportCanvas.getContext('2d');
      exportCtx.fillStyle = '#000';
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      exportCtx.drawImage(img, dx, dy, drawWidth, drawHeight);
      const thumb = exportCanvas.toDataURL('image/webp', 0.85);
      close({
        crop: {
          zoom: state.zoom,
          offsetX: state.centerX,
          offsetY: state.centerY,
          aspect: state.aspect
        },
        thumb
      });
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    zoomInput.addEventListener('input', onZoomChange);
    window.addEventListener('keydown', onKeyDown);
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);

    function initCrop() {
      if (initialCrop) {
        state.zoom = initialCrop.zoom ? Math.max(1, Number(initialCrop.zoom)) : 1;
        state.centerX = typeof initialCrop.offsetX === 'number' ? initialCrop.offsetX : 0.5;
        state.centerY = typeof initialCrop.offsetY === 'number' ? initialCrop.offsetY : 0.5;
        state.aspect = initialCrop.aspect ? Number(initialCrop.aspect) : aspect;
      }
      updateCanvasSize();
      updateBaseScale();
      clampCenter();
      zoomInput.value = String(state.zoom);
      draw();
    }

    img.onload = () => {
      updateCanvasSize();
      updateBaseScale();
      initCrop();
    };
    img.onerror = () => {
      overlay.classList.remove('is-open');
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      reject(new Error('No se pudo cargar la imagen para recortar'));
    };
    img.src = src;
  });
}

function renderImagePreview(previewEl, imageObj) {
  if (!previewEl) return;
  const thumb = imageObj?.thumb;
  if (thumb) {
    previewEl.style.backgroundImage = `url(${thumb})`;
    previewEl.classList.remove('is-empty');
    return;
  }
  if (imageObj?.src) {
    previewEl.style.backgroundImage = `url(${imageObj.src})`;
    previewEl.classList.remove('is-empty');
  } else {
    previewEl.style.backgroundImage = '';
    previewEl.classList.add('is-empty');
  }
}

function cleanupLegacyImageFields(obj) {
  if (!obj || typeof obj !== 'object') return;
  delete obj.fit;
  delete obj.align;
  delete obj.focusX;
  delete obj.focusY;
}

function createImageField(labelText, value, pathArr, onChange, options = {}) {
  const container = document.createElement('div');
  container.className = 'editor-image-field';

  const isSrcPath = String(pathArr[pathArr.length - 1]) === 'src';
  const basePath = isSrcPath ? pathArr.slice(0, -1) : pathArr.slice();

  function ensureImageObject() {
    const parent = basePath.slice(0, -1).reduce((acc, key) => {
      if (acc[key] == null) acc[key] = typeof key === 'number' ? [] : {};
      return acc[key];
    }, editorState.site);
    const last = basePath[basePath.length - 1];
    let curr = parent[last];
    if (typeof curr === 'string') {
      curr = { src: curr };
    } else if (!curr || typeof curr !== 'object') {
      curr = { src: '' };
    }
    parent[last] = curr;
    return curr;
  }

  let imageObj = normalizeImageValue(value);
  if (!imageObj || typeof imageObj !== 'object') imageObj = { src: '' };
  const stateObj = ensureImageObject();
  Object.assign(stateObj, imageObj);
  imageObj = stateObj;
  cleanupLegacyImageFields(imageObj);

  let aspectHint = imageObj.crop?.aspect || guessAspectFromPath(basePath);

  const parseAspectOption = (value) => {
    if (value == null) return null;
    if (typeof value === 'string' && value.includes('/')) {
      const [numPart, denPart] = value.split('/');
      const numerator = Number(numPart.trim());
      const denominator = Number(denPart.trim());
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
        const ratio = numerator / denominator;
        return ratio > 0 ? ratio : null;
      }
      return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric;
  };

  const optionAspect = parseAspectOption(options.aspect ?? options.aspectRatio);
  if (optionAspect) {
    aspectHint = optionAspect;
  }

  const textLabel = document.createElement('label');
  textLabel.textContent = labelText;
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.value = imageObj.src || '';
  textInput.addEventListener('input', event => {
    imageObj.src = event.target.value.trim();
    cleanupLegacyImageFields(imageObj);
    renderImagePreview(preview, imageObj);
    debouncedPreview();
    onFieldInput(event);
  });
  textLabel.appendChild(textInput);
  container.appendChild(textLabel);

  const preview = document.createElement('div');
  preview.className = 'editor-image-preview';
  renderImagePreview(preview, imageObj);
  container.appendChild(preview);

  const controls = document.createElement('div');
  controls.className = 'editor-image-controls';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadImage(file);
      imageObj.src = uploaded.url;
      if (uploaded.thumb) imageObj.thumb = uploaded.thumb;
      cleanupLegacyImageFields(imageObj);
      textInput.value = imageObj.src || '';
      renderImagePreview(preview, imageObj);
      debouncedPreview();
      try {
        const result = await openImageCropper({
          src: imageObj.src,
          aspect: aspectHint,
          initialCrop: imageObj.crop
        });
        if (result?.crop) {
          imageObj.crop = result.crop;
          if (result.crop.aspect) aspectHint = result.crop.aspect;
          if (result.thumb) imageObj.thumb = result.thumb;
          cleanupLegacyImageFields(imageObj);
          renderImagePreview(preview, imageObj);
          debouncedPreview();
        }
      } catch (cropError) {
        if (cropError && cropError.message !== 'cancelled') {
          console.error('openImageCropper', cropError);
        }
      }
    } catch (e) {
      console.error('uploadImage', e);
      alert('No se pudo subir la imagen');
    } finally {
      event.target.value = '';
    }
  });
  controls.appendChild(fileInput);

  const customFileButton = document.createElement('button');
  customFileButton.type = 'button';
  customFileButton.textContent = 'Archivo';
  customFileButton.className = 'editor-file-button'; // Add a class for styling if needed
  customFileButton.addEventListener('click', () => fileInput.click());
  controls.appendChild(customFileButton);

  const cropButton = document.createElement('button');
  cropButton.type = 'button';
  cropButton.textContent = 'Editar recorte';
  cropButton.addEventListener('click', async () => {
    if (!imageObj.src) {
      alert('Cargá o ingresa una imagen primero');
      return;
    }
    try {
      const result = await openImageCropper({
        src: imageObj.src,
        aspect: imageObj.crop?.aspect || aspectHint,
        initialCrop: imageObj.crop
      });
      if (result?.crop) {
        imageObj.crop = result.crop;
        if (result.crop.aspect) aspectHint = result.crop.aspect;
        if (result.thumb) imageObj.thumb = result.thumb;
        cleanupLegacyImageFields(imageObj);
        renderImagePreview(preview, imageObj);
        debouncedPreview();
      }
    } catch (err) {
      if (err && err.message !== 'cancelled') {
        console.error('openImageCropper', err);
      }
    }
  });
  controls.appendChild(cropButton);

  container.appendChild(controls);

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

function createRichTextInput(labelText, value, onChange) {
  const container = document.createElement('div');
  container.className = 'editor-rich-text-container';

  const label = document.createElement('label');
  label.textContent = labelText;
  container.appendChild(label);

  const toolbar = document.createElement('div');
  toolbar.className = 'editor-rich-text-toolbar';

  const buttons = [
    { tag: 'strong', label: 'B' },
    { tag: 'em', label: 'I' },
    { tag: 's', label: 'S' },
    { tag: 'u', label: 'U' }
  ];

  const textarea = document.createElement('textarea');
  textarea.value = value || '';
  textarea.addEventListener('input', event => {
    onChange(event.target.value);
    onFieldInput(event);
  });

  buttons.forEach(({ tag, label }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = 'format-button';
    button.addEventListener('click', () => {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = textarea.value.substring(start, end);
      const textBefore = textarea.value.substring(0, start);
      const textAfter = textarea.value.substring(end);

      if (selectedText) {
        const formattedText = `<${tag}>${selectedText}</${tag}>`;
        textarea.value = textBefore + formattedText + textAfter;
        textarea.focus();
        textarea.setSelectionRange(start + tag.length + 2, end + tag.length + 2);
      } else {
        const newText = `<${tag}></${tag}>`;
        textarea.value = textBefore + newText + textAfter;
        textarea.focus();
        textarea.setSelectionRange(start + tag.length + 2, start + tag.length + 2);
      }

      onChange(textarea.value);
      onFieldInput();
    });
    toolbar.appendChild(button);
  });

  label.appendChild(toolbar);
  label.appendChild(textarea);

  return container;
}

function createToggleSwitch(labelText, value, onChange) {
  const label = document.createElement('label');
  label.className = 'editor-toggle-switch';

  const span = document.createElement('span');
  span.textContent = labelText;
  label.appendChild(span);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!value;
  input.addEventListener('change', event => {
    onChange(event.target.checked);
    onFieldInput(event);
  });

  const slider = document.createElement('span');
  slider.className = 'slider round';
  label.appendChild(input);
  label.appendChild(slider);

  return label;
}

function createRadioGroup(labelText, options, selectedValue, onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'editor-radio-group';

  const label = document.createElement('div');
  label.textContent = labelText;
  wrapper.appendChild(label);

  const optionsWrapper = document.createElement('div');
  optionsWrapper.className = 'editor-radio-options';

  options.forEach(option => {
    const optionLabel = document.createElement('label');
    optionLabel.className = 'editor-radio-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = labelText.replace(/\s/g, ''); // Unique name for the radio group
    input.value = option.value;
    input.checked = option.value === selectedValue;
    input.addEventListener('change', event => {
      console.log('Radio button changed:', event.target.value);
      onChange(event.target.value);
      onFieldInput(event);
    });

    const span = document.createElement('span');
    span.textContent = option.label;

    optionLabel.appendChild(input);
    optionLabel.appendChild(span);
    optionsWrapper.appendChild(optionLabel);
  });

  wrapper.appendChild(optionsWrapper);
  return wrapper;
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
    if (site.theme.background.backgroundMode === undefined) {
      site.theme.background.backgroundMode = 'none'; // Default to no background
    }
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


















