/**
 * IMAGO — Image to PDF Converter
 * script.js
 *
 * Client-side only. Uses jsPDF for PDF generation and SortableJS for drag-to-reorder.
 * All image processing happens in the browser — no data leaves the device.
 */

// ═══════════════════════════════════════════════════════════
// 1. STATE
// ═══════════════════════════════════════════════════════════

const state = {
  images: [],          // Array of { id, file, dataUrl, name, size }
  pdfBlob: null,       // Generated PDF blob (for preview + download)
  settings: {
    pageSize:    'a4',       // 'a4' | 'letter'
    orientation: 'portrait', // 'portrait' | 'landscape'
    margin:      10,         // px (10 | 20 | 30)
    fit:         'fit',      // 'fit' | 'fill' | 'stretch'
    quality:     0.90,       // 0.5 – 1.0
    pageNumbers: false,
    title:       true,
  },
};

// ═══════════════════════════════════════════════════════════
// 2. DOM REFERENCES
// ═══════════════════════════════════════════════════════════

const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const browseBtn     = document.getElementById('browseBtn');
const previewGrid   = document.getElementById('previewGrid');
const statsBar      = document.getElementById('statsBar');
const statCount     = document.getElementById('statCount');
const statSize      = document.getElementById('statSize');
const clearAllBtn   = document.getElementById('clearAllBtn');
const convertBtn    = document.getElementById('convertBtn');
const downloadBtn   = document.getElementById('downloadBtn');
const previewPdfBtn = document.getElementById('previewPdfBtn');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const qualitySlider = document.getElementById('qualitySlider');
const qualityVal    = document.getElementById('qualityVal');
const filenameInput = document.getElementById('filenameInput');
const themeToggle   = document.getElementById('themeToggle');
const themeIcon     = document.getElementById('themeIcon');
const previewModal  = document.getElementById('previewModal');
const previewFrame  = document.getElementById('previewFrame');
const closeModal    = document.getElementById('closeModal');
const toast         = document.getElementById('toast');

// ═══════════════════════════════════════════════════════════
// 3. DRAG-AND-DROP — FILE UPLOAD
// ═══════════════════════════════════════════════════════════

// Prevent browser default for drag events on the whole page
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault())
);

// Highlight drop zone on drag
dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-over'));
dropZone.addEventListener('dragover',  () => dropZone.classList.add('drag-over'));
dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  dropZone.classList.remove('drag-over');
  handleFiles(Array.from(e.dataTransfer.files));
});

// Click to open file picker
dropZone.addEventListener('click', () => fileInput.click());
browseBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // don't double-trigger
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  handleFiles(Array.from(fileInput.files));
  fileInput.value = ''; // reset so same file can be re-added
});

// ═══════════════════════════════════════════════════════════
// 4. FILE HANDLING
// ═══════════════════════════════════════════════════════════

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_MB = 30; // per image

/**
 * Validate, read, and add new image files.
 * @param {File[]} files
 */
function handleFiles(files) {
  const valid = files.filter(f => {
    if (!ACCEPTED.includes(f.type)) {
      showToast(`Skipped "${f.name}" — unsupported type`);
      return false;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showToast(`Skipped "${f.name}" — exceeds ${MAX_FILE_SIZE_MB} MB`);
      return false;
    }
    return true;
  });

  if (!valid.length) return;

  // Read each file as a data URL
  valid.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = {
        id:      crypto.randomUUID(),
        file,
        dataUrl: e.target.result,
        name:    file.name,
        size:    file.size,
      };
      state.images.push(img);
      renderCard(img);
      updateStats();
      updateConvertBtn();
      resetOutput(); // clear any prior PDF
    };
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════
// 5. PREVIEW GRID — RENDER
// ═══════════════════════════════════════════════════════════

/**
 * Render a single image card into the grid.
 * @param {{ id, dataUrl, name, size }} img
 */
function renderCard(img) {
  // Remove empty-state hint if present
  const hint = previewGrid.querySelector('.empty-hint');
  if (hint) hint.remove();

  const card = document.createElement('div');
  card.className = 'img-card';
  card.dataset.id = img.id;

  card.innerHTML = `
    <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" loading="lazy" />
    <div class="card-overlay">
      <span class="card-name">${escapeHtml(img.name)}</span>
      <span class="card-size">${formatSize(img.size)}</span>
    </div>
    <span class="card-num">${state.images.length}</span>
    <button class="card-delete" title="Remove image" aria-label="Remove ${escapeHtml(img.name)}">
      <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="1" y1="1" x2="13" y2="13"/>
        <line x1="13" y1="1" x2="1" y2="13"/>
      </svg>
    </button>`;

  // Delete button handler
  card.querySelector('.card-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    removeImage(img.id, card);
  });

  previewGrid.appendChild(card);
  statsBar.style.display = 'flex';
}

/**
 * Remove an image by id, animate card out.
 */
function removeImage(id, cardEl) {
  // Animate out
  cardEl.style.transition = 'all 0.25s ease';
  cardEl.style.transform  = 'scale(0.8)';
  cardEl.style.opacity    = '0';

  setTimeout(() => {
    cardEl.remove();
    state.images = state.images.filter(i => i.id !== id);
    updateStats();
    updateConvertBtn();
    refreshCardNumbers();
    resetOutput();
    if (state.images.length === 0) {
      statsBar.style.display = 'none';
    }
  }, 250);
}

/** Update page-number badges after reorder/delete. */
function refreshCardNumbers() {
  const cards = previewGrid.querySelectorAll('.img-card');
  cards.forEach((card, i) => {
    card.querySelector('.card-num').textContent = i + 1;
  });
}

/** Sync state.images array order to match DOM order (after drag-reorder). */
function syncOrderFromDOM() {
  const ids = Array.from(previewGrid.querySelectorAll('.img-card')).map(c => c.dataset.id);
  state.images.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  refreshCardNumbers();
  resetOutput();
}

// ═══════════════════════════════════════════════════════════
// 6. SORTABLE — DRAG TO REORDER
// ═══════════════════════════════════════════════════════════

// Initialize SortableJS on the preview grid
const sortable = Sortable.create(previewGrid, {
  animation:    200,
  ghostClass:   'sortable-ghost',
  chosenClass:  'sortable-chosen',
  delay:        80,        // small delay to distinguish click vs drag
  delayOnTouchOnly: true,
  touchStartThreshold: 5,
  onEnd: syncOrderFromDOM,
});

// ═══════════════════════════════════════════════════════════
// 7. SETTINGS — CHIP GROUPS & CONTROLS
// ═══════════════════════════════════════════════════════════

/** Wire up a chip-group: clicking a chip sets it active + updates state. */
function bindChipGroup(groupId, stateKey) {
  const group = document.getElementById(groupId);
  group.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const val = chip.dataset.val;
      // Coerce to number if stateKey is margin
      state.settings[stateKey] = stateKey === 'margin' ? parseInt(val) : val;
      resetOutput();
    });
  });
}

bindChipGroup('pageSizeGroup', 'pageSize');
bindChipGroup('orientGroup',   'orientation');
bindChipGroup('marginGroup',   'margin');
bindChipGroup('fitGroup',      'fit');

// Quality slider
qualitySlider.addEventListener('input', () => {
  const val = parseInt(qualitySlider.value);
  qualityVal.textContent = `${val}%`;
  state.settings.quality = val / 100;
  resetOutput();
});

// Toggle checkboxes
document.getElementById('pageNumToggle').addEventListener('change', (e) => {
  state.settings.pageNumbers = e.target.checked;
  resetOutput();
});
document.getElementById('titleToggle').addEventListener('change', (e) => {
  state.settings.title = e.target.checked;
  resetOutput();
});

// ═══════════════════════════════════════════════════════════
// 8. CLEAR ALL
// ═══════════════════════════════════════════════════════════

clearAllBtn.addEventListener('click', () => {
  const cards = previewGrid.querySelectorAll('.img-card');
  cards.forEach((card, i) => {
    setTimeout(() => {
      card.style.transition = 'all 0.2s ease';
      card.style.transform  = 'scale(0.7)';
      card.style.opacity    = '0';
      setTimeout(() => card.remove(), 200);
    }, i * 40);
  });

  setTimeout(() => {
    state.images = [];
    statsBar.style.display = 'none';
    updateConvertBtn();
    resetOutput();
  }, cards.length * 40 + 250);
});

// ═══════════════════════════════════════════════════════════
// 9. CONVERT TO PDF
// ═══════════════════════════════════════════════════════════

convertBtn.addEventListener('click', convertToPDF);

/**
 * Convert all images in state.images to a single PDF using jsPDF.
 */
async function convertToPDF() {
  if (!state.images.length) return;

  const { jsPDF } = window.jspdf;
  const s = state.settings;

  // Page dimensions (mm) — jsPDF uses mm internally
  const sizes = {
    a4:     { w: 210, h: 297 },
    letter: { w: 215.9, h: 279.4 },
  };

  const pageW = s.orientation === 'portrait' ? sizes[s.pageSize].w : sizes[s.pageSize].h;
  const pageH = s.orientation === 'portrait' ? sizes[s.pageSize].h : sizes[s.pageSize].w;

  // Show progress
  setProgress(0, 'Initializing…');
  convertBtn.disabled = true;
  downloadBtn.style.display = 'none';
  previewPdfBtn.style.display = 'none';

  // Yield to browser so UI can repaint before heavy work
  await sleep(50);

  const pdf = new jsPDF({
    orientation: s.orientation,
    unit:        'mm',
    format:      s.pageSize,
    compress:    true,
  });

  const totalImages = state.images.length;

  for (let i = 0; i < totalImages; i++) {
    const img = state.images[i];
    const progress = Math.round(((i) / totalImages) * 90);
    setProgress(progress, `Processing image ${i + 1} of ${totalImages}…`);

    // Add a new page for every image except the first
    if (i > 0) pdf.addPage();

    // Load image into HTMLImageElement to get natural dimensions
    const { imgEl, imgW, imgH } = await loadImage(img.dataUrl);

    // Compute draw region (content area inside margins)
    const marginMm = s.margin; // margin in mm (we treat the slider value directly as mm)
    const contentW = pageW - marginMm * 2;
    const contentH = pageH - marginMm * 2;

    let drawX = marginMm, drawY = marginMm, drawW = contentW, drawH = contentH;

    // Image aspect ratio
    const imgAspect = imgW / imgH;
    const boxAspect = contentW / contentH;

    if (s.fit === 'fit') {
      // Scale to fit entirely within content box (letterbox)
      if (imgAspect > boxAspect) {
        drawW = contentW;
        drawH = contentW / imgAspect;
        drawY = marginMm + (contentH - drawH) / 2;
      } else {
        drawH = contentH;
        drawW = contentH * imgAspect;
        drawX = marginMm + (contentW - drawW) / 2;
      }
    } else if (s.fit === 'fill') {
      // Scale to fill content box (may crop) — handled by canvas clipping
      if (imgAspect > boxAspect) {
        drawH = contentH;
        drawW = contentH * imgAspect;
        drawX = marginMm + (contentW - drawW) / 2;
      } else {
        drawW = contentW;
        drawH = contentW / imgAspect;
        drawY = marginMm + (contentH - drawH) / 2;
      }
    }
    // 'stretch' just uses full contentW x contentH

    // Rasterise onto a canvas for quality control
    const imageData = await rasteriseImage(imgEl, imgW, imgH, s.fit, contentW, contentH, s.quality);

    // Add image to PDF (JPEG or PNG depending on type)
    const imgFormat = img.file.type === 'image/png' ? 'PNG' : 'JPEG';
    pdf.addImage(imageData, imgFormat, drawX, drawY, drawW, drawH, undefined, 'FAST');

    // Optional: filename as subtitle at bottom
    if (s.title) {
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      const shortName = img.name.length > 60 ? img.name.substring(0, 57) + '…' : img.name;
      pdf.text(shortName, pageW / 2, pageH - 4, { align: 'center' });
    }

    // Optional: page number
    if (s.pageNumbers) {
      pdf.setFontSize(8);
      pdf.setTextColor(180, 180, 180);
      pdf.text(`${i + 1} / ${totalImages}`, pageW - marginMm, pageH - 4, { align: 'right' });
    }

    // Yield between pages to keep UI responsive
    await sleep(10);
  }

  setProgress(95, 'Finalising PDF…');
  await sleep(80);

  // Save blob for download / preview
  state.pdfBlob = pdf.output('blob');

  setProgress(100, 'Done!');
  await sleep(400);

  hideProgress();
  convertBtn.disabled = false;
  downloadBtn.style.display = 'flex';
  previewPdfBtn.style.display = 'flex';
  showToast(`PDF ready — ${totalImages} page${totalImages > 1 ? 's' : ''}`);
}

/**
 * Rasterise an image element onto a canvas, applying fit mode.
 * Returns a data URL suitable for jsPDF.addImage.
 * @returns {Promise<string>} data URL
 */
function rasteriseImage(imgEl, srcW, srcH, fitMode, contentWmm, contentHmm, quality) {
  return new Promise((resolve) => {
    // Convert content dimensions to px at 96dpi (jsPDF handles the mm→pt internally)
    // We rasterise at 2× the content mm value (roughly screen px at PDF resolution)
    const scale = 3; // 3px per mm → ~72 DPI × 3 = acceptable quality
    const canvW = Math.round(contentWmm * scale);
    const canvH = Math.round(contentHmm * scale);

    const canvas = document.createElement('canvas');
    canvas.width  = canvW;
    canvas.height = canvH;
    const ctx = canvas.getContext('2d');

    const imgAspect = srcW / srcH;
    const boxAspect = canvW / canvH;

    let sx = 0, sy = 0, sw = srcW, sh = srcH; // source clip
    let dx = 0, dy = 0, dw = canvW, dh = canvH; // dest

    if (fitMode === 'fit') {
      if (imgAspect > boxAspect) {
        dh = canvW / imgAspect;
        dy = (canvH - dh) / 2;
      } else {
        dw = canvH * imgAspect;
        dx = (canvW - dw) / 2;
      }
    } else if (fitMode === 'fill') {
      // Crop source to match box aspect
      if (imgAspect > boxAspect) {
        sw = srcH * boxAspect;
        sx = (srcW - sw) / 2;
      } else {
        sh = srcW / boxAspect;
        sy = (srcH - sh) / 2;
      }
    }
    // 'stretch' → draw full image into full canvas (dx/dy/dw/dh already cover full canvas)

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvW, canvH);
    ctx.drawImage(imgEl, sx, sy, sw, sh, dx, dy, dw, dh);

    resolve(canvas.toDataURL('image/jpeg', quality));
  });
}

/**
 * Load an image data URL into an HTMLImageElement and return natural dims.
 * @param {string} dataUrl
 * @returns {Promise<{ imgEl: HTMLImageElement, imgW: number, imgH: number }>}
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve({ imgEl: img, imgW: img.naturalWidth,  imgH: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src     = dataUrl;
  });
}

// ═══════════════════════════════════════════════════════════
// 10. DOWNLOAD
// ═══════════════════════════════════════════════════════════

downloadBtn.addEventListener('click', () => {
  if (!state.pdfBlob) return;
  const filename = (filenameInput.value.trim() || 'converted') + '.pdf';
  const url = URL.createObjectURL(state.pdfBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  showToast('Download started!');
});

// ═══════════════════════════════════════════════════════════
// 11. PREVIEW PDF
// ═══════════════════════════════════════════════════════════

previewPdfBtn.addEventListener('click', () => {
  if (!state.pdfBlob) return;
  const url = URL.createObjectURL(state.pdfBlob);
  previewFrame.src = url;
  previewModal.style.display = 'flex';

  // Revoke after a delay (keep alive long enough for iframe to load)
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

closeModal.addEventListener('click', () => {
  previewModal.style.display = 'none';
  previewFrame.src = '';
});

// Close modal on overlay click
previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) {
    previewModal.style.display = 'none';
    previewFrame.src = '';
  }
});

// ═══════════════════════════════════════════════════════════
// 12. THEME TOGGLE (DARK / LIGHT)
// ═══════════════════════════════════════════════════════════

// Persist theme
const savedTheme = localStorage.getItem('imago-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcon(savedTheme);

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('imago-theme', next);
  updateThemeIcon(next);
});

function updateThemeIcon(theme) {
  if (theme === 'light') {
    // Moon icon
    themeIcon.innerHTML = `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            fill="none" stroke="currentColor" stroke-width="2"/>`;
  } else {
    // Sun icon
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}

// ═══════════════════════════════════════════════════════════
// 13. HELPER UTILITIES
// ═══════════════════════════════════════════════════════════

/** Update image count + total size in the stats bar. */
function updateStats() {
  const count     = state.images.length;
  const totalSize = state.images.reduce((acc, i) => acc + i.size, 0);
  statCount.textContent = `${count} image${count !== 1 ? 's' : ''}`;
  statSize.textContent  = formatSize(totalSize);
}

/** Enable/disable the Convert button based on whether images exist. */
function updateConvertBtn() {
  convertBtn.disabled = state.images.length === 0;
}

/** Clear the generated PDF state (so old PDF isn't re-downloaded after settings change). */
function resetOutput() {
  state.pdfBlob = null;
  downloadBtn.style.display   = 'none';
  previewPdfBtn.style.display = 'none';
}

/** Show/update the progress bar. */
function setProgress(pct, label) {
  progressWrap.style.display  = 'flex';
  progressFill.style.width    = `${pct}%`;
  progressLabel.textContent   = label;
}

/** Hide the progress bar. */
function hideProgress() {
  progressWrap.style.display = 'none';
  progressFill.style.width   = '0%';
}

/** Format bytes to human-readable string. */
function formatSize(bytes) {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Show a toast notification briefly. */
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

/** Simple HTML escape. */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Promise-based sleep (yields to browser). */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
