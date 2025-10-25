// scripts/new-lightbox.js
const newLightbox = {
  overlay: null,
  imageElement: null,
  closeButton: null,

  init() {
    this.createOverlay();
    this.addEventListeners();
  },

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'new-lightbox-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      visibility: hidden;
      opacity: 0;
      transition: visibility 0s, opacity 0.3s;
    `;

    this.imageElement = document.createElement('img');
    this.imageElement.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
    `;

    this.closeButton = document.createElement('button');
    this.closeButton.textContent = 'X';
    this.closeButton.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
    `;

    this.overlay.appendChild(this.imageElement);
    this.overlay.appendChild(this.closeButton);
    document.body.appendChild(this.overlay);
  },

  addEventListeners() {
    this.closeButton.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
  },

  open(imageUrl) {
    this.imageElement.src = imageUrl;
    this.overlay.style.visibility = 'visible';
    this.overlay.style.opacity = '1';
  },

  close() {
    this.overlay.style.visibility = 'hidden';
    this.overlay.style.opacity = '0';
    this.imageElement.src = ''; // Clear image source
  }
};

export { newLightbox };