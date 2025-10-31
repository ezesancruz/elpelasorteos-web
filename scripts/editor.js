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
    await waitForApp();
    initEditor();
  } catch (err) {
    console.warn('Editor no disponible', err);
  }
});


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

// Helper: convierte un item de edición en plegable con <details>/<summary>
function makeInlineItemCollapsible(itemEl, headerEl, { open = false } = {}) {
  if (!itemEl || !headerEl) return null;

  const details = document.createElement('details');
  details.className = itemEl.className;
  details.open = !!open;

  const summary = document.createElement('summary');
  summary.className = headerEl.className;

  while (headerEl.firstChild) summary.appendChild(headerEl.firstChild);
  details.appendChild(summary);

  // Evita que los botones dentro del header plieguen/desplieguen
  summary.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) { e.preventDefault(); }
  }, true);

  const body = document.createElement('div');
  body.className = 'editor-inline-item__body';

  const rest = [];
  for (let n = headerEl.nextSibling; n; n = n.nextSibling) rest.push(n);
  rest.forEach(n => body.appendChild(n));

  details.appendChild(body);

  if (itemEl.parentNode) itemEl.parentNode.replaceChild(details, itemEl);
  return { details, summary, body };
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
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: fd
  });
  if (!res.ok) throw new Error('No se pudo subir la imagen');
  const payload = await res.json();
  if (!payload || typeof payload.url !== 'string') {
    throw new Error('Respuesta de subida invalida');
  }
  return payload;
}

// Subida de videos (para fondo de video)
async function uploadVideo(file) {
  const fd = new FormData();
  fd.append('video', file);
  const res = await fetch('/api/upload-video', {
    method: 'POST',
    body: fd
  });
  if (!res.ok) throw new Error('No se pudo subir el video');
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
  btn.id = 'edit-toggle';
  btn.className = 'editor-toggle';
  btn.type = 'button';
  btn.textContent = '✍️';
  btn.setAttribute('aria-label', 'Editar');
  btn.title = 'Editar';
  btn.style.display = 'none'; // Oculto por defecto
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

  const actions = document.createElement('div');
  actions.className = 'editor-panel__actions';
  
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.textContent = '⬇️ JSON';
  downloadBtn.addEventListener('click', downloadContent);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = '💾 Cambios';
  saveBtn.addEventListener('click', saveContent);

  const logoutBtn = document.createElement('button');
  logoutBtn.type = 'button';
  logoutBtn.id = 'logout-admin';
  logoutBtn.textContent = 'Salir del modo edición';

  logoutBtn.textContent = '❌ Editor';
  actions.appendChild(downloadBtn);
  actions.appendChild(saveBtn);
  actions.appendChild(logoutBtn);

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
  // Card plegable
  const card = document.createElement('details');
  card.className = 'section-editor section-editor--page-config';
  card.open = false;

  const summary = document.createElement('summary');
  summary.className = 'section-editor__heading page-config-summary';
  const title = document.createElement('strong');
  title.textContent = 'Configuración página';
  const chevron = document.createElement('button');
  chevron.type = 'button';
  chevron.className = 'section-editor__chevron editor-action';
  chevron.textContent = card.open ? '▾' : '▸';
  chevron.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.open = !card.open;
    chevron.textContent = card.open ? '▾' : '▸';
  });
  // Sincronizar icono cuando el <details> abre/cierra por cualquier medio
  card.addEventListener('toggle', () => {
    chevron.textContent = card.open ? '▾' : '▸';
  });
  summary.appendChild(title);
  summary.appendChild(chevron);
  card.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'section-editor__grid page-selector-wrapper';

  // Selector de página actual
  const row = document.createElement('div');
  row.className = 'page-config-row';
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
  row.appendChild(label);

  const page = currentPage();
  const hiddenToggle = createToggleSwitch('Oculta', page.hidden, isHidden => {
    updatePage(p => p.hidden = isHidden);
    // Si se hace visible, asegurar solapa en navegación
    if (!isHidden) {
      ensurePageNavEntry(editorState.pageId, page.title || editorState.pageId);
    }
  });
  row.appendChild(hiddenToggle);
  body.appendChild(row);

  // Campo para renombrar la página (afecta title, no id)
  const nameInput = createInput('Nombre de la página', page.title || '', value => {
    updatePage(p => { p.title = value; });
    // Reflejar el cambio en el select sin re-render completo
    const opt = Array.from(select.options).find(o => o.value === editorState.pageId);
    if (opt) opt.textContent = value || editorState.pageId;
  });
  body.appendChild(nameInput);

  // Acciones: nueva, mover, eliminar
  const actions = document.createElement('div');
  actions.className = 'page-config-actions';

  const addPageBtn = document.createElement('button');
  addPageBtn.type = 'button';
  addPageBtn.textContent = '📄';
  addPageBtn.title = 'Nueva página';
  addPageBtn.className = 'editor-action';
  addPageBtn.addEventListener('click', () => addNewPageFlow());
  actions.appendChild(addPageBtn);

  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.title = 'Mover página arriba';
  moveUpBtn.textContent = '⬆️';
  moveUpBtn.className = 'editor-action';
  moveUpBtn.addEventListener('click', () => movePage(-1));
  actions.appendChild(moveUpBtn);

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.title = 'Mover página abajo';
  moveDownBtn.textContent = '⬇️';
  moveDownBtn.className = 'editor-action';
  moveDownBtn.addEventListener('click', () => movePage(1));
  actions.appendChild(moveDownBtn);

  const deletePageBtn = document.createElement('button');
  deletePageBtn.type = 'button';
  deletePageBtn.title = 'Eliminar página actual';
  deletePageBtn.textContent = '🗑️';
  deletePageBtn.className = 'editor-action';
  deletePageBtn.addEventListener('click', () => removeCurrentPage());
  actions.appendChild(deletePageBtn);

  const idx = currentPageIndex();
  moveUpBtn.disabled = (idx === 0);
  moveDownBtn.disabled = (idx === editorState.site.pages.length - 1);
  deletePageBtn.disabled = (editorState.site.pages.length <= 1);

  body.appendChild(actions);
  card.appendChild(body);

  return card;
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

  // Selector de efecto para botones del hero
  (function(){
    const label = document.createElement('label');
    label.className = 'editor-field';
    const span = document.createElement('span');
    span.textContent = 'Efecto de botón (hero)';
    label.appendChild(span);

    const select = document.createElement('select');
    // Resolver valor actual: usa hero.effect si existe; si no, mapea effectEnabled
    let currentEffect = typeof page.hero?.effect === 'string'
      ? page.hero.effect
      : (page.hero?.effectEnabled ? 'xenon' : 'none');
    if (currentEffect === 'fire' || currentEffect === 'fireReal') currentEffect = 'xenon';

    const options = [
      { value: 'none', text: 'Ninguno' },
      { value: 'xenon', text: 'Xenón' }
    ];
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.text;
      if (opt.value === currentEffect) o.selected = true;
      select.appendChild(o);
    });

    select.addEventListener('change', (e) => {
      const value = e.target.value;
      updateHero(hero => {
        hero.effect = value;      // nuevo campo canónico
        delete hero.effectEnabled; // limpiamos bandera vieja si existiera
      }, { rerenderPanel: false });
      onFieldInput(e);
    });

    label.appendChild(select);
    fieldset.appendChild(label);
  })();

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
    remove.className = 'editor-inline-item__remove';
    remove.textContent = 'x';
    remove.addEventListener('click', () => updateHero(hero => hero.buttons.splice(index, 1), { rerenderPanel: true }));
    header.appendChild(remove);
    item.appendChild(header);
    item.appendChild(createInput('Etiqueta', button.label || '', value => updateHero(hero => hero.buttons[index].label = value)));
    item.appendChild(createInput('URL', button.href || '', value => updateHero(hero => hero.buttons[index].href = value)));
    {
      const c = makeInlineItemCollapsible(item, header, { open: false });
      buttonsWrapper.appendChild(c ? c.details : item);
    }
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
    remove.className = 'editor-inline-item__remove';
    remove.textContent = 'x';
    remove.addEventListener('click', () => updateHero(hero => hero.social.splice(index, 1), { rerenderPanel: true }));
    header.appendChild(remove);
    item.appendChild(header);
    item.appendChild(createInput('Plataforma', social.platform || '', value => updateHero(hero => hero.social[index].platform = value)));
    item.appendChild(createInput('URL', social.url || '', value => updateHero(hero => hero.social[index].url = value)));
    {
      const c = makeInlineItemCollapsible(item, header, { open: false });
      socialWrapper.appendChild(c ? c.details : item);
    }
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

    const currentMode = (section.data?.mode === 'twoColumns') ? 'twoColumns' : 'single';

    const modeLabel = document.createElement('label');
    modeLabel.className = 'editor-field';
    const span = document.createElement('span');
    span.textContent = 'Modo de texto';
    modeLabel.appendChild(span);
    const select = document.createElement('select');
    [
      { value: 'single', text: 'Simple (título + texto)' },
      { value: 'twoColumns', text: 'Texto – texto (dos columnas)' }
    ].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.text; if (opt.value === currentMode) o.selected = true; select.appendChild(o);
    });
    select.addEventListener('change', (e) => updateSection(index, s => { s.data.mode = e.target.value; }, { rerenderPanel: true }));
    modeLabel.appendChild(select);
    wrapper.appendChild(modeLabel);

    if (currentMode === 'twoColumns') {
      const shared = !!section.data?.sharedTitle;
      wrapper.appendChild(createToggleSwitch('Compartir título para ambas columnas', shared, value => updateSection(index, s => { s.data.sharedTitle = value; }, { rerenderPanel: true })));
      if (shared) {
        wrapper.appendChild(createRichTextInput('Título', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
      }
      const cols = Array.isArray(section.data?.columns) ? section.data.columns : [{}, {}];
      while (cols.length < 2) cols.push({});
      cols.slice(0, 2).forEach((col, i) => {
        const box = document.createElement('div');
        box.className = 'editor-inline-item';
        const header = document.createElement('div');
        header.className = 'editor-inline-item__header';
        header.textContent = `Columna ${i + 1}`;
        box.appendChild(header);
        if (!shared) {
          box.appendChild(createRichTextInput('Título', col.title || '', value => updateSection(index, s => {
            s.data.columns = s.data.columns || [{}, {}];
            s.data.columns[i] = s.data.columns[i] || {};
            s.data.columns[i].title = value;
          })));
        }
        box.appendChild(createRichTextInput('Texto', col.body || '', value => updateSection(index, s => {
          s.data.columns = s.data.columns || [{}, {}];
          s.data.columns[i] = s.data.columns[i] || {};
          s.data.columns[i].body = value;
        })));
        {
          const c = makeInlineItemCollapsible(box, header, { open: false });
          wrapper.appendChild(c ? c.details : box);
        }
      });
    } else {
      wrapper.appendChild(createRichTextInput('Título', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
      const textarea = createRichTextInput('Líneas (una por fila)', (section.data?.lines || []).join('\n'), value => updateSection(index, s => {
        s.data.lines = value.split('\n');
      }));
      wrapper.appendChild(textarea);
    }

    // Slider opcional para Texto corto
    const slider = section.data?.slider || {};
    const isEnabled = slider.enabled === true;
    wrapper.appendChild(createToggleSwitch('Habilitar slider (múltiples bloques)', !!isEnabled, value => updateSection(index, s => {
      s.data.slider = s.data.slider || { enabled: false, items: [] };
      s.data.slider.enabled = value;
    }, { rerenderPanel: true })));

    if (isEnabled) {
      const list = document.createElement('div');
      list.className = 'editor-inline-list';
      const items = Array.isArray(slider.items) ? slider.items : [];
      items.forEach((item, itemIndex) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'editor-inline-item';
        const header = document.createElement('div');
        header.className = 'editor-inline-item__header';
        header.textContent = `Slide ${itemIndex + 1}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'editor-inline-item__remove';
        remove.textContent = 'x';
        remove.addEventListener('click', () => updateSection(index, s => s.data.slider.items.splice(itemIndex, 1), { rerenderPanel: true }));
        header.appendChild(remove);
        itemEl.appendChild(header);
        const isTwo = !!item?.twoColumns || Array.isArray(item?.columns);
        itemEl.appendChild(createToggleSwitch('Dos columnas en este slide', isTwo, value => updateSection(index, s => {
          const it = s.data.slider.items[itemIndex] = s.data.slider.items[itemIndex] || {};
          it.twoColumns = value;
          if (value && !Array.isArray(it.columns)) it.columns = [{}, {}];
          if (!value) { delete it.columns; delete it.sharedTitle; }
        }, { rerenderPanel: true })));
        // Opción de compartir título: visible siempre; deshabilitada si no hay dos columnas
        const shared = !!item?.sharedTitle;
        const sharedToggle = createToggleSwitch('Compartir título en columnas', shared, value => updateSection(index, s => { s.data.slider.items[itemIndex].sharedTitle = value; }));
        // Deshabilitar visualmente si no es twoColumns
        try { sharedToggle.querySelector('input[type="checkbox"]').disabled = !isTwo; } catch (_) {}
        itemEl.appendChild(sharedToggle);

        if (isTwo) {
          if (shared) {
            itemEl.appendChild(createRichTextInput('Título del slide', item?.title || '', value => updateSection(index, s => s.data.slider.items[itemIndex].title = value)));
          }
          const cols = Array.isArray(item?.columns) ? item.columns : [{}, {}];
          while (cols.length < 2) cols.push({});
          cols.slice(0, 2).forEach((col, i) => {
            const box = document.createElement('div');
            box.className = 'editor-inline-item';
            const h = document.createElement('div'); h.className = 'editor-inline-item__header'; h.textContent = `Columna ${i + 1}`; box.appendChild(h);
            if (!shared) {
              box.appendChild(createRichTextInput('Título columna', col.title || '', value => updateSection(index, s => {
                s.data.slider.items[itemIndex].columns = s.data.slider.items[itemIndex].columns || [{}, {}];
                s.data.slider.items[itemIndex].columns[i] = s.data.slider.items[itemIndex].columns[i] || {};
                s.data.slider.items[itemIndex].columns[i].title = value;
              })));
            }
            box.appendChild(createRichTextInput('Texto', col.body || '', value => updateSection(index, s => {
              s.data.slider.items[itemIndex].columns = s.data.slider.items[itemIndex].columns || [{}, {}];
              s.data.slider.items[itemIndex].columns[i] = s.data.slider.items[itemIndex].columns[i] || {};
              s.data.slider.items[itemIndex].columns[i].body = value;
            })));
            {
              const c = makeInlineItemCollapsible(box, h, { open: false });
              itemEl.appendChild(c ? c.details : box);
            }
          });
        } else {
          itemEl.appendChild(createRichTextInput('Título (opcional)', item?.title || '', value => updateSection(index, s => s.data.slider.items[itemIndex].title = value)));
          itemEl.appendChild(createRichTextInput('Texto', item?.body || '', value => updateSection(index, s => s.data.slider.items[itemIndex].body = value)));
        }
        {
          const c = makeInlineItemCollapsible(itemEl, header, { open: false });
          list.appendChild(c ? c.details : itemEl);
        }
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = 'Agregar slide de texto';
      add.addEventListener('click', () => updateSection(index, s => {
        s.data.slider = s.data.slider || { enabled: true, items: [] };
        s.data.slider.items.push({ title: '', body: 'Nuevo texto' });
      }, { rerenderPanel: true }));
      wrapper.appendChild(list);
      wrapper.appendChild(add);
    }

    return wrapper;
  },
  textoLargo(section, index) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(createRichTextInput('Título', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createToggleSwitch('Expandido por defecto', !!section.data?.expanded, value => updateSection(index, s => s.data.expanded = value)));
    wrapper.appendChild(createInput('Indicador (hint)', section.data?.hint || '(tocar para desplegar)', value => updateSection(index, s => s.data.hint = value)));
    const textarea = createRichTextInput('Líneas de contenido (una por fila)', (section.data?.lines || []).join('\n'), value => updateSection(index, s => {
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
      remove.textContent = 'x';
      remove.addEventListener('click', () => updateSection(index, s => s.data.cards.splice(cardIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      item.appendChild(header);
      item.appendChild(createRichTextInput('Titulo', card.title || '', value => updateSection(index, s => s.data.cards[cardIndex].title = value)));
      item.appendChild(createRichTextInput('Subtitulo', card.subtitle || '', value => updateSection(index, s => s.data.cards[cardIndex].subtitle = value)));
      item.appendChild(createInput('URL', card.href || '', value => updateSection(index, s => s.data.cards[cardIndex].href = value)));
      const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'cards', cardIndex, 'image'];
      item.appendChild(createImageField('Imagen', card.image || '', imagePath, value => updateSection(index, s => s.data.cards[cardIndex].image = value)));
      {
        const c = makeInlineItemCollapsible(item, header, { open: false });
        list.appendChild(c ? c.details : item);
      }
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

    // Selector de modo
    const modeLabel = document.createElement('label');
    modeLabel.className = 'editor-field';
    const span = document.createElement('span');
    span.textContent = 'Modo de galería';
    modeLabel.appendChild(span);
    const select = document.createElement('select');
    const currentMode = (section.data?.mode === 'imageImage') ? 'imageImage' : 'imageText';
    [
      { value: 'imageText', text: 'Imagen y texto' },
      { value: 'imageImage', text: 'Imagen e imagen' }
    ].forEach(opt => {
      const o = document.createElement('option');
      o.value = opt.value; o.textContent = opt.text; if (opt.value === currentMode) o.selected = true; select.appendChild(o);
    });
    select.addEventListener('change', (e) => {
      const value = e.target.value === 'imageImage' ? 'imageImage' : 'imageText';
      updateSection(index, s => { s.data.mode = value; }, { rerenderPanel: true });
    });
    modeLabel.appendChild(select);
    list.appendChild(modeLabel);
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
    const mode = (section.data?.mode === 'imageImage') ? 'imageImage' : 'imageText';
    (section.data?.images || []).forEach((card, cardIndex) => {
      const image = normalizeImageValue(card);      const item = document.createElement('div');
      item.className = 'editor-inline-item';
      const header = document.createElement('div');
      header.className = 'editor-inline-item__header';
      header.textContent = `Imagen ${cardIndex + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'editor-inline-item__remove';
      remove.className = 'editor-inline-item__remove';
      remove.textContent = 'x';
      remove.addEventListener('click', () => updateSection(index, s => s.data.images.splice(cardIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      item.appendChild(header);
      const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'images', cardIndex];
      item.appendChild(createImageField('Imagen', image, imagePath, value => mutateImage(cardIndex, img => Object.assign(img, normalizeImageValue(value))), { aspect: 3 / 4 }));
      item.appendChild(createInput('Link opcional', image.href || '', value => mutateImage(cardIndex, img => { img.href = value; })));
      item.appendChild(createRichTextInput('Título (opcional)', image.title || '', value => mutateImage(cardIndex, img => { img.title = value; })));
      if (mode === 'imageText') {
        item.appendChild(createRichTextInput('Subtítulo (opcional)', image.subtitle || '', value => mutateImage(cardIndex, img => { img.subtitle = value; })));
        item.appendChild(createToggleSwitch('Invertir', !!image.reverse, value => mutateImage(cardIndex, img => { img.reverse = !!value; })));
      } else {
        const image2Path = ['pages', pageIndex, 'sections', index, 'data', 'images', cardIndex, 'image2'];
        const normalizedImage2 = normalizeImageValue(image.image2 || '');
        item.appendChild(createImageField('Imagen 2', normalizedImage2, image2Path, value => mutateImage(cardIndex, img => { img.image2 = normalizeImageValue(value); }), { aspect: 3 / 4 }));
        item.appendChild(createInput('Link opcional 2', image.href2 || '', value => mutateImage(cardIndex, img => { img.href2 = value; })));
      }
      {
        const c = makeInlineItemCollapsible(item, header, { open: false });
        list.appendChild(c ? c.details : item);
      }
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
      remove.className = 'editor-inline-item__remove';
      remove.textContent = 'x';
      remove.addEventListener('click', () => updateSection(index, s => s.data.images.splice(imgIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      item.appendChild(header);
      // Selector de frame (relación de aspecto)
      const aspectMode = image?.aspectMode || '9:16';
      const aspectOptions = [
        { value: '3:4', label: '3:4' },
        { value: '1:1', label: '1:1' },
        { value: '9:16', label: '9:16' },
        { value: 'custom', label: 'Personalizado' }
      ];
      const aspectFromMode = (mode, custom) => {
        if (mode === '3:4') return 3 / 4;
        if (mode === '1:1') return 1;
        if (mode === '9:16') return 9 / 16;
        if (mode === 'custom') {
          const raw = (custom || '').trim();
          if (!raw) return 9 / 16;
          if (/^\d+\s*:\s*\d+$/.test(raw)) {
            const [w, h] = raw.split(':').map(n => parseFloat(n));
            return (w > 0 && h > 0) ? (w / h) : 9 / 16;
          }
          const num = parseFloat(raw.replace(',', '.'));
          return (num > 0) ? num : 9 / 16;
        }
        return 9 / 16;
      };
      item.appendChild(createRadioGroup('Frame', aspectOptions, aspectMode, value => updateSection(index, s => {
        s.data.images = s.data.images || [];
        const curr = normalizeImageValue(s.data.images[imgIndex]);
        curr.aspectMode = value;
        // Sincronizar crop.aspect para que se refleje en la tarjeta final
        const ratio = aspectFromMode(value, curr.aspectCustom);
        curr.crop = curr.crop && typeof curr.crop === 'object' ? curr.crop : {};
        curr.crop.aspect = ratio;
        s.data.images[imgIndex] = curr;
      }, { rerenderPanel: true })));
      if (aspectMode === 'custom') {
        const current = (image && image.aspectCustom) || '';
        item.appendChild(createInput('Relación (ej: 5:6 o 1.2)', current, value => updateSection(index, s => {
          s.data.images = s.data.images || [];
          const curr = normalizeImageValue(s.data.images[imgIndex]);
          curr.aspectCustom = value;
          // Actualizar crop.aspect con la relación personalizada
          const ratio = aspectFromMode('custom', value);
          curr.crop = curr.crop && typeof curr.crop === 'object' ? curr.crop : {};
          curr.crop.aspect = ratio;
          s.data.images[imgIndex] = curr;
        }, { rerenderPanel: true })));
      }
      const computedAspect = aspectFromMode(aspectMode, image?.aspectCustom);

      const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'images', imgIndex];
      item.appendChild(createImageField('Imagen', image, imagePath, value => ensureImage(imgIndex, img => Object.assign(img, normalizeImageValue(value))), { aspect: computedAspect }));

      // Ajuste de imagen dentro del frame (sin deformar): cover vs contain
      const fitOptions = [
        { value: 'contain', label: 'Mostrar completa (contain)' },
        { value: 'cover', label: 'Recortar para llenar (cover)' }
      ];
      const currentFit = (image && image.crop && typeof image.crop.objectFit === 'string') ? image.crop.objectFit : 'contain';
      item.appendChild(createRadioGroup('Ajuste en frame', fitOptions, currentFit, value => updateSection(index, s => {
        s.data.images = s.data.images || [];
        const curr = normalizeImageValue(s.data.images[imgIndex]);
        curr.crop = curr.crop && typeof curr.crop === 'object' ? curr.crop : {};
        curr.crop.objectFit = value === 'cover' ? 'cover' : 'contain';
        s.data.images[imgIndex] = curr;
      })));
      {
        const c = makeInlineItemCollapsible(item, header, { open: false });
        list.appendChild(c ? c.details : item);
      }
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
    const sliderEnabled = section.data?.slider?.enabled === true;
    // Toggle maestro: activar/desactivar carrusel
    wrapper.appendChild(createToggleSwitch('Activar carrusel', sliderEnabled, (value) => {
      updateSection(index, s => {
        if (!s.data) s.data = {};
        if (!s.data.slider) s.data.slider = { enabled: false, items: [] };
        s.data.slider.enabled = !!value;
        if (s.data.slider.enabled) {
          s.data.slider.items = Array.isArray(s.data.slider.items) ? s.data.slider.items : [];
          if (s.data.slider.items.length === 0) {
            s.data.slider.items.push({ title: s.data.title || '', body: s.data.body || '', image: s.data.image || '', reverse: !!s.data.reverse });
          }
        }
      }, { rerenderPanel: true });
    }));
    if (sliderEnabled) {
      const list = document.createElement('div');
      list.className = 'editor-inline-list';
      const items = (section.data?.slider?.items || []);
      items.forEach((itemData, itemIndex) => {
        const item = document.createElement('div');
        item.className = 'editor-inline-item';
        const header = document.createElement('div');
        header.className = 'editor-inline-item__header';
        header.textContent = `Componente ${itemIndex + 1}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'editor-inline-item__remove';
        remove.textContent = 'x';
        remove.addEventListener('click', () => updateSection(index, s => {
          const arr = (s.data?.slider?.items || []);
          if (arr.length > 1) arr.splice(itemIndex, 1);
        }, { rerenderPanel: true }));
        header.appendChild(remove);
        item.appendChild(header);
        item.appendChild(createRichTextInput('Titulo', itemData?.title || '', value => updateSection(index, s => s.data.slider.items[itemIndex].title = value)));
        item.appendChild(createRichTextInput('Descripcion', itemData?.body || '', value => updateSection(index, s => s.data.slider.items[itemIndex].body = value)));
        item.appendChild(createToggleSwitch('Invertir', !!itemData?.reverse, value => updateSection(index, s => { s.data.slider.items[itemIndex].reverse = !!value; })));
        const imagePath = ['pages', pageIndex, 'sections', index, 'data', 'slider', 'items', itemIndex, 'image'];
        item.appendChild(createImageField('Imagen', itemData?.image || '', imagePath, value => updateSection(index, s => s.data.slider.items[itemIndex].image = value), { aspect: 5 / 6 }));
        {
          const c = makeInlineItemCollapsible(item, header, { open: false });
          list.appendChild(c ? c.details : item);
        }
      });
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = 'Agregar componente';
      addBtn.addEventListener('click', () => updateSection(index, s => {
        if (!s.data.slider) s.data.slider = { enabled: true, items: [] };
        s.data.slider.items = s.data.slider.items || [];
        s.data.slider.items.push({ title: 'Nuevo', body: 'Descripcion', image: '', reverse: false });
      }, { rerenderPanel: true }));
      wrapper.appendChild(list);
      wrapper.appendChild(addBtn);
      return wrapper;
    }
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createRichTextInput('Descripcion', section.data?.body || '', value => updateSection(index, s => s.data.body = value)));
    // Toggle de inversión de orden (imagen/texto) solo afecta md+
    wrapper.appendChild(
      createToggleSwitch(
        'Invertir',
        !!section.data?.reverse,
        value => updateSection(index, s => { s.data.reverse = !!value; })
      )
    );
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
  carruselVideos(section, index) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createRichTextInput('Descripcion', section.data?.description || '', value => updateSection(index, s => s.data.description = value)));
    const list = document.createElement('div');
    list.className = 'editor-inline-list';
    const pageIndex = currentPageIndex();
    (section.data?.videos || []).forEach((it, vidIndex) => {
      const item = document.createElement('div');
      item.className = 'editor-inline-item';
      const header = document.createElement('div');
      header.className = 'editor-inline-item__header';
      header.textContent = `Video ${vidIndex + 1}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'editor-inline-item__remove';
      remove.textContent = 'x';
      remove.addEventListener('click', () => updateSection(index, s => s.data.videos.splice(vidIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      item.appendChild(header);
      const videoUrlLabel = createInput('Video (URL)', (it && it.src) || it || '', value => updateSection(index, s => {
        s.data.videos = s.data.videos || [];
        const current = s.data.videos[vidIndex];
        if (typeof current === 'object' && current) {
          current.src = value;
        } else {
          s.data.videos[vidIndex] = { src: value };
        }
      }));
      item.appendChild(videoUrlLabel);

      // Subida de archivo de video por ítem
      const videoUploadControls = document.createElement('div');
      videoUploadControls.className = 'editor-video-controls';
      const videoFileInput = document.createElement('input');
      videoFileInput.type = 'file';
      videoFileInput.accept = 'video/*';
      videoFileInput.style.display = 'none';
      const pickVideoBtn = document.createElement('button');
      pickVideoBtn.type = 'button';
      pickVideoBtn.textContent = 'Archivo video';
      pickVideoBtn.addEventListener('click', () => videoFileInput.click());
      videoFileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const uploaded = await uploadVideo(file);
          updateSection(index, s => {
            s.data.videos = s.data.videos || [];
            const current = s.data.videos[vidIndex];
            if (typeof current === 'object' && current) {
              current.src = uploaded.url;
            } else {
              s.data.videos[vidIndex] = { src: uploaded.url };
            }
          });
          const inputEl = videoUrlLabel.querySelector('input');
          if (inputEl) inputEl.value = uploaded.url;
        } catch (err) {
          console.error('uploadVideo', err);
          alert('No se pudo subir el video');
        } finally {
          e.target.value = '';
        }
      });
      videoUploadControls.appendChild(videoFileInput);
      videoUploadControls.appendChild(pickVideoBtn);
      item.appendChild(videoUploadControls);

      // Opciones por video
      const current = (typeof it === 'object' && it) ? it : {};
      const defaultOn = (val, def) => (typeof val === 'boolean' ? val : def);
      item.appendChild(createToggleSwitch('Autoplay', defaultOn(current.autoplay, true), value => updateSection(index, s => {
        s.data.videos[vidIndex] = (typeof s.data.videos[vidIndex] === 'object' && s.data.videos[vidIndex]) ? s.data.videos[vidIndex] : { src: (s.data.videos[vidIndex] || '') };
        s.data.videos[vidIndex].autoplay = value;
      })));
      item.appendChild(createToggleSwitch('Silenciar (muted)', defaultOn(current.muted, true), value => updateSection(index, s => {
        s.data.videos[vidIndex] = (typeof s.data.videos[vidIndex] === 'object' && s.data.videos[vidIndex]) ? s.data.videos[vidIndex] : { src: (s.data.videos[vidIndex] || '') };
        s.data.videos[vidIndex].muted = value;
      })));
      item.appendChild(createToggleSwitch('Repetir (loop)', defaultOn(current.loop, true), value => updateSection(index, s => {
        s.data.videos[vidIndex] = (typeof s.data.videos[vidIndex] === 'object' && s.data.videos[vidIndex]) ? s.data.videos[vidIndex] : { src: (s.data.videos[vidIndex] || '') };
        s.data.videos[vidIndex].loop = value;
      })));
      item.appendChild(createToggleSwitch('Mostrar controles', defaultOn(current.controls, false), value => updateSection(index, s => {
        s.data.videos[vidIndex] = (typeof s.data.videos[vidIndex] === 'object' && s.data.videos[vidIndex]) ? s.data.videos[vidIndex] : { src: (s.data.videos[vidIndex] || '') };
        s.data.videos[vidIndex].controls = value;
      })));
      // Se eliminó el campo de póster opcional por requerimiento
      {
        const c = makeInlineItemCollapsible(item, header, { open: false });
        list.appendChild(c ? c.details : item);
      }
    });
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Agregar video';
    addBtn.addEventListener('click', () => updateSection(index, s => {
      s.data.videos = s.data.videos || [];
      s.data.videos.push({ src: '' });
    }, { rerenderPanel: true }));
    wrapper.appendChild(list);
    wrapper.appendChild(addBtn);
    return wrapper;
  },
  detalleVisualVideo(section, index) {
    const wrapper = document.createElement('div');
    const pageIndex = currentPageIndex();
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createRichTextInput('Descripcion', section.data?.body || '', value => updateSection(index, s => s.data.body = value)));
    // Toggle de inversión de orden (video/texto) solo afecta md+
    {
      const invertToggle = createToggleSwitch(
        'Invertir',
        !!section.data?.reverse,
        value => updateSection(index, s => { s.data.reverse = !!value; })
      );
      if (section.data?.showDescription === false) {
        const input = invertToggle.querySelector('input');
        if (input) {
          input.disabled = true;
          input.setAttribute('aria-disabled', 'true');
        }
        invertToggle.title = 'Invertir deshabilitado: descripción oculta';
      }
      wrapper.appendChild(invertToggle);
    }

    // Controles de visibilidad para Titulo y Descripcion (estilo "Formato del area")
    const titleVisibility = (section.data?.showTitle === false) ? 'off' : 'on';
    wrapper.appendChild(createRadioGroup(
      'Mostrar título',
      [
        { value: 'on', label: 'ON' },
        { value: 'off', label: 'OFF' }
      ],
      titleVisibility,
      value => updateSection(index, s => { s.data.showTitle = (value === 'on'); })
    ));

    const descVisibility = (section.data?.showDescription === false) ? 'off' : 'on';
    wrapper.appendChild(createRadioGroup(
      'Mostrar descripción',
      [
        { value: 'on', label: 'ON' },
        { value: 'off', label: 'OFF' }
      ],
      descVisibility,
      value => updateSection(index, s => { s.data.showDescription = (value === 'on'); }, { rerenderPanel: true })
    ));

    // Selector de formato del area (1:1, 3:4, 9:16, Auto)
    const aspectOptions = [
      { value: '1:1', label: '1:1' },
      { value: '3:4', label: '3:4' },
      { value: '9:16', label: '9:16' },
      { value: 'auto', label: 'Auto' }
    ];
    const currentAspect = section.data?.aspectMode || '3:4';
    wrapper.appendChild(createRadioGroup('Formato del area', aspectOptions, currentAspect, value => updateSection(index, s => {
      s.data.aspectMode = value;
    })));

    // Asegurar estructura del objeto de video
    updateSection(index, s => {
      if (!s.data) s.data = {};
      if (!s.data.video || typeof s.data.video !== 'object') s.data.video = { src: '' };
    });

    // Campo URL del video
    const videoUrlLabel = createInput('Video (URL)', section.data?.video?.src || section.data?.video || '', value => updateSection(index, s => {
      if (!s.data.video || typeof s.data.video !== 'object') s.data.video = { src: '' };
      s.data.video.src = value;
    }));
    wrapper.appendChild(videoUrlLabel);

    // Subida de archivo de video
    const videoUploadControls = document.createElement('div');
    videoUploadControls.className = 'editor-video-controls';
    const videoFileInput = document.createElement('input');
    videoFileInput.type = 'file';
    videoFileInput.accept = 'video/*';
    videoFileInput.style.display = 'none';
    const pickVideoBtn = document.createElement('button');
    pickVideoBtn.type = 'button';
    pickVideoBtn.textContent = 'Archivo video';
    pickVideoBtn.addEventListener('click', () => videoFileInput.click());
    videoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const uploaded = await uploadVideo(file);
        updateSection(index, s => {
          if (!s.data.video || typeof s.data.video !== 'object') s.data.video = { src: '' };
          s.data.video.src = uploaded.url;
        });
        const inputEl = videoUrlLabel.querySelector('input');
        if (inputEl) inputEl.value = uploaded.url;
      } catch (err) {
        console.error('uploadVideo', err);
        alert('No se pudo subir el video');
      } finally {
        e.target.value = '';
      }
    });
    videoUploadControls.appendChild(videoFileInput);
    videoUploadControls.appendChild(pickVideoBtn);
    wrapper.appendChild(videoUploadControls);

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
  tarjetaValidacion(section, index) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(createRichTextInput('Titulo', section.data?.title || '', value => updateSection(index, s => s.data.title = value)));
    wrapper.appendChild(createRichTextInput('Descripcion', section.data?.description || '', value => updateSection(index, s => s.data.description = value)));
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
      remove.className = 'editor-inline-item__remove';
      remove.textContent = 'x';
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
      {
        const c = makeInlineItemCollapsible(item, header, { open: false });
        list.appendChild(c ? c.details : item);
      }
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
      remove.textContent = 'x';
      remove.addEventListener('click', () => updateSection(index, s => s.data.items.splice(itemIndex, 1), { rerenderPanel: true }));
      header.appendChild(remove);
      itemEl.appendChild(header);
      itemEl.appendChild(createRichTextInput('Pregunta', item.q || '', value => updateSection(index, s => s.data.items[itemIndex].q = value)));
      itemEl.appendChild(createRichTextInput('Respuesta', item.a || '', value => updateSection(index, s => s.data.items[itemIndex].a = value)));
      {
        const c = makeInlineItemCollapsible(itemEl, header, { open: false });
        list.appendChild(c ? c.details : itemEl);
      }
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
    data: { title: 'Nuevo bloque', lines: ['Contenido editable'], mode: 'single' }
  },
  textoLargo: {
    id: 'textoLargo-new',
    type: 'textoLargo',
    data: { title: 'Título desplegable', lines: ['Contenido largo editable'], expanded: false, hint: '(tocar para desplegar)' }
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
  carruselVideos: {
    id: 'carruselVideos-new',
    type: 'carruselVideos',
    data: { title: 'Videos', description: '', videos: [{ src: '', autoplay: true, muted: true, loop: true, controls: false }] }
  },
  detalleVisual: {
    id: 'detalleVisual-new',
    type: 'detalleVisual',
    data: { title: 'Destacado', body: 'Descripcion', image: '', reverse: false }
  },
  detalleVisualVideo: {
    id: 'detalleVisualVideo-new',
    type: 'detalleVisualVideo',
    data: { title: 'Destacado en video', body: 'Descripcion', video: { src: '' }, aspectMode: '3:4', showTitle: true, showDescription: true, reverse: false }
  },
  botonAccion: {
    id: 'botonAccion-new',
    type: 'botonAccion',
    data: { title: 'Llamado a la accion', body: 'Descripcion', href: '#', buttonLabel: 'Ver mas', image: '' }
  },
  tarjetaValidacion: {
    id: 'tarjetaValidacion-new',
    type: 'tarjetaValidacion',
    data: { title: 'Validacion de participacion', description: 'Ingrese su numero de participacion para comprobar.' }
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
  textoInformativo: 'Tarjeta texto (corto)',
  textoLargo: 'Tarjeta texto (largo)',
  opcionesCompra: 'Tarjeta productos',
  galeriaImagenes: 'Tarjeta galería de imágenes',
  carruselImagenes: 'Tarjeta carrusel de imágenes',
  detalleVisual: 'Tarjeta detalle visual',
  detalleVisualVideo: 'Tarjeta detalle visual (video)',
  botonAccion: 'Tarjeta tienda',
  tarjetaValidacion: 'Tarjeta validacion',
  muroGanadores: 'Tarjeta muro de ganadores',
  faq: 'Tarjeta FAQ',
  carruselVideos: 'Tarjeta carrusel de videos'
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
          // Campo URL de video
          const videoUrlLabel = createInput('Video de fondo (URL)', theme.background?.video || '', value => updateTheme(themeDraft => themeDraft.background.video = value));
          videoFields.appendChild(videoUrlLabel);

          // Subida de archivo de video
          const videoUploadControls = document.createElement('div');
          videoUploadControls.className = 'editor-video-controls';
          const videoFileInput = document.createElement('input');
          videoFileInput.type = 'file';
          videoFileInput.accept = 'video/*';
          videoFileInput.style.display = 'none';
          const pickVideoBtn = document.createElement('button');
          pickVideoBtn.type = 'button';
          pickVideoBtn.textContent = 'Archivo video';
          pickVideoBtn.addEventListener('click', () => videoFileInput.click());
          videoFileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const uploaded = await uploadVideo(file);
              updateTheme(themeDraft => themeDraft.background.video = uploaded.url);
              // Refrescar el input de texto si existe
              const inputEl = videoUrlLabel.querySelector('input');
              if (inputEl) inputEl.value = uploaded.url;
            } catch (err) {
              console.error('uploadVideo', err);
              alert('No se pudo subir el video');
            } finally {
              e.target.value = '';
            }
          });
          videoUploadControls.appendChild(videoFileInput);
          videoUploadControls.appendChild(pickVideoBtn);
          videoFields.appendChild(videoUploadControls);

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
      const vw = Math.max(320, Math.min(window.innerWidth || 1024, 1200));
      const vh = Math.max(480, Math.min(window.innerHeight || 800, 1400));
      const aspect = state.aspect;

      const maxWidth = Math.floor(Math.min(520, vw * 0.6));
      const maxHeight = Math.floor(Math.min(360, vh * 0.5));

      let width = maxWidth;
      let height = Math.round(width / aspect);
      if (height > maxHeight) {
        height = maxHeight;
        width = Math.round(height * aspect);
      }

      canvas.width = width;
      canvas.height = height;
      previewCanvas.width = 180;
      previewCanvas.height = Math.max(120, Math.round(previewCanvas.width / aspect));
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
  const src = imageObj?.src;
  if (src) {
    previewEl.style.backgroundImage = `url(${src})`;
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
  
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'sr-only';
  input.checked = !!value;
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
  input.addEventListener('change', event => {
    const checked = event.target.checked;
    onChange(checked);
    onFieldInput(event);
    try { input.setAttribute('aria-checked', checked ? 'true' : 'false'); } catch (_) {}
  });

  const slider = document.createElement('span');
  slider.className = 'editor-toggle-switch__track';

  const span = document.createElement('span');
  span.textContent = labelText;
  span.className = 'editor-toggle-switch__label';

  // Orden: input (oculto) + slider (toggle visual) + texto al lado derecho
  label.appendChild(input);
  label.appendChild(slider);
  label.appendChild(span);

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

// Utilidades para creación de páginas
function slugify(text) {
  if (typeof text !== 'string') return '';
  const s = text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return s;
}

function ensureUniquePageId(baseId, pages) {
  let id = baseId && baseId.length ? baseId : `page-${Date.now()}`;
  const exists = (x) => pages.some(p => p.id === x);
  if (!exists(id)) return id;
  let n = 2;
  while (exists(`${id}-${n}`) && n < 1000) n++;
  return `${id}-${n}`;
}

function addNewPageFlow() {
  try {
    const defaultName = 'Nueva página';
    const name = (window.prompt?.('Nombre de la nueva página:', defaultName) || '').trim() || defaultName;
    updateSite(site => {
      site.pages = Array.isArray(site.pages) ? site.pages : [];
      const base = slugify(name);
      const id = ensureUniquePageId(base, site.pages);
      const newPage = { id, title: name, hidden: false, hero: { buttons: [], social: [] }, sections: [] };
      site.pages.push(newPage);
      editorState.pageId = id;
      // Asegurar solapa en navegación
      site.navigation = Array.isArray(site.navigation) ? site.navigation : [];
      if (!site.navigation.some(n => n.pageId === id)) {
        site.navigation.push({ label: name, pageId: id, path: `/${id}/` });
      }
    }, { rerenderPanel: true });
    window.siteApp.setPage(editorState.pageId);
    editorState.site = window.siteApp.getSite();
  } catch (e) {
    console.error('addNewPageFlow', e);
  }
}

function movePage(delta) {
  try {
    updateSite(site => {
      const i = site.pages.findIndex(p => p.id === editorState.pageId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= site.pages.length) return;
      const tmp = site.pages[i];
      site.pages[i] = site.pages[j];
      site.pages[j] = tmp;
    }, { rerenderPanel: true });
    // Mantener la página activa
    window.siteApp.setPage(editorState.pageId);
    editorState.site = window.siteApp.getSite();
  } catch (e) {
    console.error('movePage', e);
  }
}

function removeCurrentPage() {
  try {
    const pagesCount = editorState.site?.pages?.length || 0;
    if (pagesCount <= 1) {
      alert('No se puede eliminar la única página.');
      return;
    }
    const page = currentPage();
    const ok = window.confirm?.(`Eliminar la página "${page.title || page.id}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    updateSite(site => {
      const i = site.pages.findIndex(p => p.id === editorState.pageId);
      if (i === -1) return;
      const removed = site.pages.splice(i, 1)[0];
      // Limpiar navegación para esta página
      if (Array.isArray(site.navigation)) {
        site.navigation = site.navigation.filter(n => n.pageId !== removed.id);
      }
      const nextIndex = Math.max(0, i - 1);
      const next = site.pages[nextIndex];
      editorState.pageId = next?.id || site.pages[0].id;
    }, { rerenderPanel: true });
    window.siteApp.setPage(editorState.pageId);
    editorState.site = window.siteApp.getSite();
  } catch (e) {
    console.error('removeCurrentPage', e);
  }
}

// Asegura que exista una solapa de navegación para la página dada
function ensurePageNavEntry(pageId, labelText) {
  updateSite(site => {
    site.navigation = Array.isArray(site.navigation) ? site.navigation : [];
    if (!site.navigation.some(n => n.pageId === pageId)) {
      const label = labelText || pageId;
      const path = `/${pageId}/`;
      site.navigation.push({ label, pageId, path });
    }
  });
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
    const response = await fetch('/api/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(editorState.site, null, 2)
    });
    if (!response.ok) throw new Error(`Status ${response.status}`);
    alert('Contenido guardado correctamente.');
  } catch (error) {
    alert('No se pudo guardar automaticamente. Descargá el JSON y reemplazalo manualmente.');
    console.error(error);
  }
}

function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}


















