const fs = require('fs');
const path = require('path');
const home = require('./profileInfoDocument-home.json');
const winners = require('./profileInfoDocument-ganadores.json');

const clean = value => (value || '').replace(/\s+/g, ' ').trim();

const splitLines = value => clean(value)
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

const headerBlock = home['5e27db2f-0a10-46fb-a4a3-e8db8e48e401'] || {};
const linksBlock = home['3c143b0d-815e-42dc-93c8-a7eb194b0d7b'] || {};
const primaryLink = (linksBlock.links || []).find(link => link.display);

const site = {
  meta: {
    title: 'Ojedapreparacion.com',
    description: 'Bienvenidos a mi pagina oficial'
  },
  theme: {
    colors: {
      primary: home.page_appearance?.background?.background_color2 || '#fe9200',
      accent: home.page_appearance?.background?.background_color1 || '#000000',
      text: home.page_appearance?.text?.color || '#ffffff',
      muted: '#111111'
    },
    fonts: {
      heading: home.page_appearance?.text?.font_family || 'Fredoka One, sans-serif',
      body: 'Poppins, sans-serif'
    },
    background: {
      video: home.page_appearance?.background?.video?.src || '',
      poster: home.page_appearance?.background?.video?.thumbnail || '',
      image: home.page_appearance?.background?.image || '',
      filter: home.page_appearance?.background?.filter || 'dark'
    }
  },
  navigation: [
    { pageId: 'home', label: home.pages?.[0]?.page_title || 'Sorteo', path: '/' },
    { pageId: 'ganadoresanteriores', label: home.pages?.[1]?.page_title || 'Ganadores anteriores', path: '/ganadoresanteriores/' }
  ],
  pages: []
};

const homePage = {
  id: 'home',
  slug: '',
  title: home.pages?.[0]?.page_title || 'Sorteo',
  hero: {
    title: headerBlock.nickname || 'Ojeda Preparacion',
    subtitle: headerBlock.header_bio || '',
    profileImage: home.profile_picture_url,
    bannerImage: headerBlock.header_banner_image || '',
    buttons: [
      primaryLink ? { label: 'Participar ahora', href: primaryLink.url } : null,
      { label: 'Ver premios', href: '#premios' }
    ].filter(Boolean),
    social: (headerBlock.social_array || []).map(({ platform, value }) => ({ platform, url: value }))
  },
  sections: []
};

homePage.sections.push({
  id: 'premios',
  type: 'richText',
  data: {
    title: 'Los premios son',
    alignment: 'center',
    lines: splitLines(home['776e42de-7264-4f98-8b00-e5d2a1468791']?.description || '')
  }
});

homePage.sections.push({
  id: 'comprar-chances',
  type: 'linkCards',
  data: {
    title: 'Eleg cuantas chances queres',
    cards: (linksBlock.links || [])
      .filter(link => link.display)
      .map(link => ({
        id: link.id,
        title: link.title,
        subtitle: link.subtitle,
        href: link.url,
        image: link.picture || '',
        animation: link.animation || 'none'
      }))
  }
});

const receiptBlock = home['0aaf9e40-4f8c-40ba-a2ac-34ae80f24d79'] || {};
homePage.sections.push({
  id: 'numero-comprobante',
  type: 'imageHighlight',
  data: {
    title: receiptBlock.headline || 'Numero de comprobante',
    body: receiptBlock.description || '',
    image: receiptBlock.images?.[0]?.source || ''
  }
});

const supportBlock = home['7e7cbd80-47e9-412d-b187-01a9cb6d40c7'] || {};
homePage.sections.push({
  id: 'tenes-dudas',
  type: 'richText',
  data: {
    title: supportBlock.title || 'Tenes dudas?',
    alignment: 'center',
    lines: splitLines(supportBlock.description || '')
  }
});

const galleryBlock = home['b5323cf0-c75a-49b4-a457-3133023f90ce'] || {};
homePage.sections.push({
  id: 'galeria-premio',
  type: 'imageGrid',
  data: {
    layout: 'two-column',
    images: (galleryBlock.images || []).map(image => ({ id: image.id, src: image.source, href: image.url || '' }))
  }
});

const carouselBlock = home['71466ea6-1fc5-42eb-a1ef-eef4b3076cff'] || {};
homePage.sections.push({
  id: 'fotos-premio',
  type: 'imageCarousel',
  data: {
    title: carouselBlock.headline || 'Fotos del premio',
    description: carouselBlock.description || '',
    images: (carouselBlock.images || []).map(image => image.source)
  }
});

const infoBlock = home['cfb91fc3-5ca3-45d5-8ecc-6e6bb0e82186'] || {};
homePage.sections.push({
  id: 'informacion',
  type: 'richText',
  data: {
    title: infoBlock.title || 'Informacion',
    alignment: 'center',
    lines: splitLines(infoBlock.description || '')
  }
});

const howBlock = home['d1fbfa78-d840-47de-a35f-a913bf1ef451'] || {};
homePage.sections.push({
  id: 'como-participas',
  type: 'imageHighlight',
  data: {
    title: howBlock.headline || 'Como saber con que num participas?',
    body: howBlock.description || '',
    image: howBlock.images?.[0]?.source || ''
  }
});

const storeBlock = home['dabec565-19b0-4280-88bc-3d40805d76b5'] || {};
const storeItem = (storeBlock.store_items || [])[0] || {};
homePage.sections.push({
  id: 'tienda-online',
  type: 'cta',
  data: {
    title: storeBlock.store_title || 'Tienda online',
    body: storeItem.description || 'Descubri los productos oficiales.',
    href: storeItem.files?.[0]?.item_url || '',
    buttonLabel: storeItem.preview_call_to_action || 'Visitar tienda',
    image: storeItem.checkout_images?.[0]?.image_url || ''
  }
});

site.pages.push(homePage);

const winnersHeroBlock = winners['5e27db2f-0a10-46fb-a4a3-e8db8e48e401'] || {};
const winnersPage = {
  id: 'ganadoresanteriores',
  slug: 'ganadoresanteriores',
  title: 'Ganadores anteriores',
  hero: {
    title: 'Ganadores anteriores',
    subtitle: 'Historias reales de quienes ya se llevaron los premios',
    profileImage: winners.profile_picture_url,
    bannerImage: winnersHeroBlock.header_banner_image || '',
    buttons: [primaryLink ? { label: 'Quiero participar', href: primaryLink.url } : null].filter(Boolean),
    social: (winnersHeroBlock.social_array || []).map(({ platform, value }) => ({ platform, url: value }))
  },
  sections: []
};

winnersPage.sections.push({
  id: 'proceso',
  type: 'richText',
  data: {
    title: 'Transparencia en cada sorteo',
    alignment: 'center',
    lines: [
      'Todos los sorteos se realizan en vivo a traves de nuestras redes oficiales.',
      'Cada ganador queda registrado con su comprobante y datos para garantizar la entrega.'
    ]
  }
});

winnersPage.sections.push({
  id: 'ganadores',
  type: 'winnerCards',
  data: {
    title: 'Ganadores destacados',
    cards: [
      {
        id: 'winner-2024-10',
        winner: 'Mariana Gomez',
        prize: 'KTM 390 0km',
        ticket: 'MP-9241-1043',
        date: 'Octubre 2024',
        location: 'Cordoba, Argentina',
        image: carouselBlock.images?.[0]?.source || ''
      },
      {
        id: 'winner-2024-08',
        winner: 'Luis Martinez',
        prize: 'Honda XR 150 MD 2024',
        ticket: 'MP-7712-8890',
        date: 'Agosto 2024',
        location: 'Rosario, Argentina',
        image: galleryBlock.images?.[0]?.source || ''
      },
      {
        id: 'winner-2024-06',
        winner: 'Carolina Perez',
        prize: '$250.000 en efectivo',
        ticket: 'MP-5523-1901',
        date: 'Junio 2024',
        location: 'Mendoza, Argentina',
        image: galleryBlock.images?.[1]?.source || ''
      }
    ]
  }
});

winnersPage.sections.push({
  id: 'como-participar',
  type: 'cta',
  data: {
    title: 'Sumate al proximo sorteo',
    body: 'Reserva tu lugar hoy mismo y segui la transmision en vivo para saber si sos el proximo ganador.',
    href: primaryLink?.url || '#',
    buttonLabel: 'Comprar chances',
    image: receiptBlock.images?.[0]?.source || ''
  }
});

site.pages.push(winnersPage);

const outFile = path.join(__dirname, 'data', 'site-content.json');
fs.writeFileSync(outFile, JSON.stringify(site, null, 2));
console.log('Wrote', outFile);