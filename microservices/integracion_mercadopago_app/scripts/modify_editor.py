old_state = "const editorState = {\n  isOpen: false,\n  site: null,\n  pageId: null,\n  panel: null,\n  toggle: null,\n  body: null\n};"
new_state = "const editorState = {\n  isOpen: false,\n  site: null,\n  pageId: null,\n  panel: null,\n  toggle: null,\n  body: null,\n  backups: [],\n  backupsLoaded: false,\n  backupsError: null,\n  isFetchingBackups: false,\n  dragIndex: null\n};"
if old_state not in text:
    raise SystemExit('editorState block not found')
text = text.replace(old_state, new_state)
marker = "const PREVIEW_DEBOUNCE_MS = 200;\nlet previewUpdateTimer = null;\nlet pendingPreviewSite = null;"
constants = "const PREVIEW_DEBOUNCE_MS = 200;\nconst editorScript = document.querySelector('script[type=\"module\"][src*\"scripts/editor.js\"]');\nconst editorScriptUrl = editorScript ? new URL(editorScript.getAttribute('src'), window.location.href) : new URL(import.meta.url);\nconst editorBaseUrl = new URL('./', editorScriptUrl);\nconst apiBaseUrl = new URL('api/', editorBaseUrl);\nlet previewUpdateTimer = null;\nlet pendingPreviewSite = null;"
if marker not in text:
    raise SystemExit('preview constants marker missing')
text = text.replace(marker, constants)
text = text.replace("renderPanel({ preserveState: false });\n  }\n}", "renderPanel({ preserveState: false });\n    loadBackups();\n  }\n}")
text = text.replace("container.appendChild(renderThemeEditor());", "container.appendChild(renderThemeEditor());\n  container.appendChild(renderBackupManager());")
old_render_sections = '''function renderSectionsEditor() {
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
    up.textContent = '?';
    up.disabled = index === 0;
    up.addEventListener('click', () => moveSection(index, -1));

    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '?';
    down.disabled = index === page.sections.length - 1;
    down.addEventListener('click', () => moveSection(index, 1));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '?';
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
    const template = defaultSections[type];
    if (!template) return;
    updatePage(page => {
      const base = deepClone(template);
      base.id = `${type}-${Date.now()}`;
      page.sections.push(base);
    }, { rerenderPanel: true });
  });
  addWrapper.appendChild(select);
  addWrapper.appendChild(addBtn);
  container.appendChild(addWrapper);

  return container;
}'''

new_render_sections = '''function renderSectionsEditor() {
  const page = currentPage();
  const container = document.createElement('div');
  const heading = document.createElement('h3');
  heading.textContent = 'Secciones';
  container.appendChild(heading);

  const sections = Array.isArray(page.sections) ? page.sections : [];
  sections.forEach((section, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'section-editor';
    wrapper.dataset.index = String(index);

    const header = document.createElement('div');
    header.className = 'section-editor__heading';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'section-editor__drag';
    dragHandle.title = 'Arrastrar para reordenar';
    dragHandle.textContent = '?';

    const title = document.createElement('strong');
    title.textContent = `${index + 1}. ${section.type}`;
    const controls = document.createElement('div');
    controls.className = 'section-editor__controls';

    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '?';
    up.disabled = index === 0;
    up.addEventListener('click', () => moveSection(index, -1));

    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '?';
    down.disabled = index === sections.length - 1;
    down.addEventListener('click', () => moveSection(index, 1));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '?';
    remove.addEventListener('click', () => removeSection(index));

    controls.appendChild(up);
    controls.appendChild(down);
    controls.appendChild(remove);

    header.appendChild(dragHandle);
    header.appendChild(title);
    header.appendChild(controls);
    wrapper.appendChild(header);

    const body = document.createElement('div');
    body.className = 'section-editor__grid';
    body.appendChild(createInput('Identificador', section.id || '', value => updateSection(index, s => {
      s.id = value;
    })));

    const editor = sectionEditors[section.type];
    if (editor) {
      body.appendChild(editor(section, index));
    } else {
      const notice = document.createElement('p');
      notice.textContent = 'Tipo de sección no soportado por el editor.';
      body.appendChild(notice);
    }

    wrapper.appendChild(body);
    container.appendChild(wrapper);

    attachSectionDrag(wrapper, dragHandle, index);
  });

  const dropTail = document.createElement('div');
  dropTail.className = 'section-drop-tail';
  dropTail.textContent = 'Soltar aquí para mover al final';
  attachSectionDropTail(dropTail, sections.length);
  container.appendChild(dropTail);

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
    const template = defaultSections[type];
    if (!template) return;
    updatePage(pageDraft => {
      const base = deepClone(template);
      base.id = `${type}-${Date.now()}`;
      pageDraft.sections.push(base);
    }, { rerenderPanel: true });
  });
  addWrapper.appendChild(select);
  addWrapper.appendChild(addBtn);
  container.appendChild(addWrapper);

  return container;
}'''

if old_render_sections not in text:
    raise SystemExit('renderSectionsEditor block not found')
text = text.replace(old_render_sections, new_render_sections)
old_section_renderers = "const sectionRenderers = {\n  richText: renderRichTextSection,\n  linkCards: renderLinkCardsSection,\n  imageGrid: renderImageGridSection,\n  imageCarousel: renderImageCarouselSection,\n  imageHighlight: renderImageHighlightSection,\n  cta: renderCTASection,\n  winnerCards: renderWinnerCardsSection\n};"
new_section_renderers = "const sectionRenderers = {\n  richText: renderRichTextSection,\n  linkCards: renderLinkCardsSection,\n  imageGrid: renderImageGridSection,\n  imageCarousel: renderImageCarouselSection,\n  imageHighlight: renderImageHighlightSection,\n  cta: renderCTASection,\n  winnerCards: renderWinnerCardsSection,\n  steps: renderStepsSection,\n  iconFeatures: renderIconFeaturesSection,\n  faq: renderFAQSection\n};"
if old_section_renderers not in text:
    raise SystemExit('sectionRenderers block missing')
text = text.replace(old_section_renderers, new_section_renderers)
old_default_sections = "const defaultSections = {\n  richText: {\n    id: 'richText-new',\n    type: 'richText',\n    data: { title: 'Nuevo bloque', lines: ['Contenido editable'] }\n  },\n  linkCards: {\n    id: 'linkCards-new',\n    type: 'linkCards',\n    data: { title: 'Nuevas opciones', cards: [{ title: 'Titulo', subtitle: 'Descripcion', href: '#', image: '' }] }\n  },\n  imageGrid: {\n    id: 'imageGrid-new',\n    type: 'imageGrid',\n    data: { images: [{ src: '', href: '' }] }\n  },\n  imageCarousel: {\n    id: 'imageCarousel-new',\n    type: 'imageCarousel',\n    data: { title: 'Galeria', description: '', images: [''] }\n  },\n  imageHighlight: {\n    id: 'imageHighlight-new',\n    type: 'imageHighlight',\n    data: { title: 'Destacado', body: 'Descripcion', image: '' }\n  },\n  cta: {\n    id: 'cta-new',\n    type: 'cta',\n    data: { title: 'Llamado a la accion', body: 'Descripcion', href: '#', buttonLabel: 'Ver mas', image: '' }\n  },\n  winnerCards: {\n    id: 'winnerCards-new',\n    type: 'winnerCards',\n    data: { title: 'Ganadores', cards: [{ winner: 'Nombre', prize: 'Premio', ticket: '', date: '', location: '', image: '' }] }\n  }\n};"
new_default_sections = "const defaultSections = {\n  richText: {\n    id: 'richText-new',\n    type: 'richText',\n    data: { title: 'Nuevo bloque', lines: ['Contenido editable'] }\n  },\n  linkCards: {\n    id: 'linkCards-new',\n    type: 'linkCards',\n    data: { title: 'Nuevas opciones', cards: [{ title: 'Titulo', subtitle: 'Descripcion', href: '#', image: '' }] }\n  },\n  imageGrid: {\n    id: 'imageGrid-new',\n    type: 'imageGrid',\n    data: { images: [{ src: '', href: '' }] }\n  },\n  imageCarousel: {\n    id: 'imageCarousel-new',\n    type: 'imageCarousel',\n    data: { title: 'Galeria', description: '', images: [''] }\n  },\n  imageHighlight: {\n    id: 'imageHighlight-new',\n    type: 'imageHighlight',\n    data: { title: 'Destacado', body: 'Descripcion', image: '' }\n  },\n  cta: {\n    id: 'cta-new',\n    type: 'cta',\n    data: { title: 'Llamado a la accion', body: 'Descripcion', href: '#', buttonLabel: 'Ver mas', image: '' }\n  },\n  winnerCards: {\n    id: 'winnerCards-new',\n    type: 'winnerCards',\n    data: { title: 'Ganadores', cards: [{ winner: 'Nombre', prize: 'Premio', ticket: '', date: '', location: '', image: '' }] }\n  },\n  steps: {\n    id: 'steps-new',\n    type: 'steps',\n    data: {\n      title: 'Cómo participar',\n      description: 'Explicá el proceso en simples pasos.',\n      steps: [{ icon: '1??', title: 'Comprá tu chance', description: 'Elegí tu paquete y guardá el comprobante.' }]\n    }\n  },\n  iconFeatures: {\n    id: 'iconFeatures-new',\n    type: 'iconFeatures',\n    data: {\n      title: 'Transparencia',\n      subtitle: 'Así trabajamos en cada sorteo.',\n      features: [{ icon: '??', title: 'En vivo', description: 'Transmitimos cada sorteo en directo.' }]\n    }\n  },\n  faq: {\n    id: 'faq-new',\n    type: 'faq',\n    data: {\n      title: 'Preguntas frecuentes',\n      items: [{ question: '¿Cómo participo?', answer: 'Comprá tu chance, subí el comprobante y seguí el sorteo en vivo.' }]\n    }\n  }\n};"
if old_default_sections not in text:
    raise SystemExit('defaultSections block missing')
text = text.replace(old_default_sections, new_default_sections)
insertion_point = text.find("function renderThemeEditor()")
if insertion_point == -1:
    raise SystemExit('renderThemeEditor not found')
helpers = "function attachSectionDrag(wrapper, handle, index) {\n  handle.setAttribute('draggable', 'true');\n  handle.addEventListener('dragstart', event => {\n    editorState.dragIndex = index;\n    event.dataTransfer.effectAllowed = 'move';\n    event.dataTransfer.setData('text/plain', String(index));\n    try {\n      event.dataTransfer.setDragImage(wrapper, 24, 24);\n    } catch (_error) {\n      // ignore\n    }\n    wrapper.classList.add('is-dragging');\n  });\n  handle.addEventListener('dragend', () => {\n    editorState.dragIndex = null;\n    wrapper.classList.remove('is-dragging');\n    wrapper.classList.remove('is-drag-over');\n  });\n  wrapper.addEventListener('dragover', event => {\n    event.preventDefault();\n    event.dataTransfer.dropEffect = 'move';\n    wrapper.classList.add('is-drag-over');\n  });\n  wrapper.addEventListener('dragleave', event => {\n    if (!wrapper.contains(event.relatedTarget)) {\n      wrapper.classList.remove('is-drag-over');\n    }\n  });\n  wrapper.addEventListener('drop', event => {\n    event.preventDefault();\n    wrapper.classList.remove('is-drag-over');\n    const fromIndex = editorState.dragIndex ?? parseInt(event.dataTransfer.getData('text/plain'), 10);\n    if (!Number.isInteger(fromIndex)) return;\n    const bounds = wrapper.getBoundingClientRect();\n    const offset = event.clientY - bounds.top;\n    const shouldInsertAfter = offset > bounds.height / 2;\n    const toIndex = shouldInsertAfter ? index + 1 : index;\n    reorderSections(fromIndex, toIndex);\n  });\n}\n\nfunction attachSectionDropTail(target, toIndex) {\n  target.addEventListener('dragover', event => {\n    event.preventDefault();\n    event.dataTransfer.dropEffect = 'move';\n    target.classList.add('is-drag-over');\n  });\n  target.addEventListener('dragleave', () => {\n    target.classList.remove('is-drag-over');\n  });\n  target.addEventListener('drop', event => {\n    event.preventDefault();\n    target.classList.remove('is-drag-over');\n    const fromIndex = editorState.dragIndex ?? parseInt(event.dataTransfer.getData('text/plain'), 10);\n    if (!Number.isInteger(fromIndex)) return;\n    reorderSections(fromIndex, toIndex);\n  });\n}\n\nfunction reorderSections(fromIndex, toIndex) {\n  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;\n  updatePage(page => {\n    const sections = page.sections || [];\n    if (!sections.length) return;\n    const from = Math.max(0, Math.min(fromIndex, sections.length - 1));\n    let target = Math.max(0, Math.min(toIndex, sections.length));\n    if (from === target || from === target - 1) {\n      return;\n    }\n    const [moved] = sections.splice(from, 1);\n    if (from < target) {\n      target -= 1;\n    }\n    sections.splice(target, 0, moved);\n  }, { rerenderPanel: true, preserveState: true });\n}\n\n"
text = text[:insertion_point] + helpers + text[insertion_point:]
insertion_point_helpers = text.find("function schedulePreviewUpdate")
if insertion_point_helpers == -1:
    raise SystemExit('schedulePreviewUpdate not found')
extra_helpers = "async function loadBackups(options = {}) {\n  if (!editorState.isOpen) return;\n  const force = options.force === true;\n  if (editorState.isFetchingBackups) return;\n  if (!force && editorState.backupsLoaded) return;\n  editorState.isFetchingBackups = true;\n  editorState.backupsError = null;\n  renderPanel({ preserveState: true });\n  try {\n    const response = await fetch(resolveApiUrl('backups'));\n    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) {\n      throw new Error(payload.error || `Status ${response.status}`);\n    }\n    editorState.backups = Array.isArray(payload.backups) ? payload.backups : [];\n    editorState.backupsLoaded = true;\n  } catch (error) {\n    editorState.backupsError = error;\n    editorState.backupsLoaded = false;\n    console.error(error);\n  } finally {\n    editorState.isFetchingBackups = false;\n    renderPanel({ preserveState: true });\n  }\n}\n\nfunction renderBackupManager() {\n  const wrapper = document.createElement('div');\n  wrapper.className = 'editor-backups';\n\n  const header = document.createElement('div');\n  header.className = 'editor-backups__header';\n  const title = document.createElement('h3');\n  title.textContent = 'Historial de versiones';\n  header.appendChild(title);\n  const refresh = document.createElement('button');\n  refresh.type = 'button';\n  refresh.textContent = 'Actualizar';\n  refresh.addEventListener('click', () => loadBackups({ force: true }));\n  header.appendChild(refresh);\n  wrapper.appendChild(header);\n\n  const body = document.createElement('div');\n  body.className = 'editor-backups__body';\n\n  if (editorState.isFetchingBackups) {\n    body.textContent = 'Cargando respaldos...';\n  } else if (editorState.backupsError) {\n    body.textContent = 'No se pudieron obtener los respaldos.';\n  } else if (!editorState.backups.length) {\n    body.textContent = 'Todavía no hay respaldos guardados.';\n  } else {\n    const list = document.createElement('ul');\n    list.className = 'editor-backups__list';\n    editorState.backups.forEach(backup => {\n      const item = document.createElement('li');\n      item.className = 'editor-backups__item';\n\n      const info = document.createElement('div');\n      info.className = 'editor-backups__info';\n      const name = document.createElement('strong');\n      name.textContent = formatBackupDate(backup.createdAt);\n      info.appendChild(name);\n      const meta = document.createElement('span');\n      meta.textContent = `${backup.name} · ${formatBytes(backup.size)}`;\n      info.appendChild(meta);\n\n      const actions = document.createElement('div');\n      actions.className = 'editor-backups__actions';\n      const restoreBtn = document.createElement('button');\n      restoreBtn.type = 'button';\n      restoreBtn.textContent = 'Restaurar';\n      restoreBtn.addEventListener('click', () => restoreBackup(backup.name));\n      actions.appendChild(restoreBtn);\n\n      item.appendChild(info);\n      item.appendChild(actions);\n      list.appendChild(item);\n    });\n    body.appendChild(list);\n  }\n\n  wrapper.appendChild(body);\n  return wrapper;\n}\n\nasync function restoreBackup(name) {\n  if (!name) return;\n  try {\n    const response = await fetch(resolveApiUrl('backups/restore'), {\n      method: 'POST',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ name })\n    });\n    const payload = await response.json().catch(() => ({}));\n    if (!response.ok) {\n      throw new Error(payload.error || `Status ${response.status}`);\n    }\n    if (payload.site) {\n      pendingPreviewSite = null;\n      if (previewUpdateTimer) {\n        clearTimeout(previewUpdateTimer);\n        previewUpdateTimer = null;\n      }\n      window.siteApp.setSite(payload.site);\n      editorState.site = window.siteApp.getSite();\n      if (!editorState.site.pages.some(page => page.id === editorState.pageId)) {\n        editorState.pageId = editorState.site.pages?.[0]?.id || 'home';\n      }\n      renderPanel({ preserveState: false });\n      alert('Versión restaurada correctamente.');\n      loadBackups({ force: true });\n    }\n  } catch (error) {\n    alert('No se pudo restaurar el respaldo.');\n    console.error(error);\n  }\n}\n\nfunction resolveApiUrl(path) {\n  return new URL(path, apiBaseUrl);\n}\n\nfunction formatBackupDate(value) {\n  const date = new Date(value);\n  if (Number.isNaN(date.getTime())) return value;\n  return date.toLocaleString();\n}\n\nfunction formatBytes(bytes) {\n  if (!Number.isFinite(bytes)) return '';\n  if (bytes < 1024) return `${bytes} B`;\n  const kb = bytes / 1024;\n  if (kb < 1024) return `${kb.toFixed(1)} KB`;\n  const mb = kb / 1024;\n  return `${mb.toFixed(1)} MB`;\n}\n\n"
text = text[:insertion_point_helpers] + extra_helpers + text[insertion_point_helpers:]
text = text.replace("const response = await fetch('/api/upload', {", "const response = await fetch(resolveApiUrl('upload'), {")
text = text.replace("const response = await fetch('/api/content', {", "const response = await fetch(resolveApiUrl('content'), {")
text = text.replace("alert('Contenido guardado correctamente.');", "alert('Contenido guardado correctamente.');\n    loadBackups({ force: true });")
