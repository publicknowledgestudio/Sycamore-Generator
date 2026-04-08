let originalImg;
let brightnessData = [];
let colorData = [];

// Image Preset Configuration
const IMAGE_FOLDER = 'images/'; // Switched back to proper relative path
const PRESET_IMAGES = [
  'tree.jpg',
  'leaf.png',
  'seed.jpg',
  'Bark.jpg',
  'Branch.jpg',
  'Branch.2.jpg',
  'Fruit.jpg',
  'Fruit.2.jpg',
  'Fruit.webp',
  'Leaf Zoom.jpg',
  'Leaf.2.jpg',
  'Leaves.jpg',
  'Parts.jpg',
  'Roots.jpg',
  'Seed.2.jpg',
  'Seed.3.jpg',
  'Stem.1.jpg',
  'Tree.2.jpg'
];

// Cellular Automaton State
let caState = [];
let caNext = [];

let cellSize;
let offsetX = 0, offsetY = 0;
let tilesX = 80;
let tilesY = 80;

let isRecording = false;
let mediaRecorder;
let recordedChunks = [];

let waveTime = 0;
let colorWaveTime = 0;

// Discrete steps for slider
const densitySteps = [32, 48, 64, 96, 120];

const palettes = {
  'Morning': {
    bg: '#FFF4DF', sky: '#FFD600',
    activeDark: '#936F44', activeMid: '#9FB53A', inactive: '#F65926'
  },
  'Noon': {
    bg: '#FFF8E9', sky: '#A9DBFF',
    activeDark: '#172119', activeMid: '#918E43', inactive: '#4D5024'
  },
  'Evening': {
    bg: '#1B1521', sky: '#F65926',
    activeDark: '#972053', activeMid: '#FFD600', inactive: '#595721'
  },
  'Night': {
    bg: '#0A0A0A', sky: '#21465E',
    activeDark: '#972053', activeMid: '#595721', inactive: '#343612'
  },
  'Monochrome': {
    bg: '#EAEAEA', sky: '#999999',
    activeDark: '#111111', activeMid: '#555555', inactive: '#333333'
  }
};

// Image Tweaker Animation State
window.imgAnimStates = { density: false, zoom: false, threshold: false, dist: false };
let imgAnimTime = 0;

function quadEaseInOutWave(t) {
  let p = t % 2.0;
  let raw = (p < 1.0) ? p : 2.0 - p;
  if (raw < 0.5) return 2 * raw * raw;
  return 1 - Math.pow(-2 * raw + 2, 2) / 2;
}

const params = {
  gridDensity: 64,
  imageZoom: 1.0,
  shapeDistPreset: 1,
  gridMode: 'Tight',
  aspectMode: 'Free',
  BASE_THRESHOLD: 200,
  palette: 'Noon',
  customColors: {
    bg: '#FFF8E9', sky: '#A9DBFF',
    activeDark: '#172119', activeMid: '#918E43', inactive: '#4D5024'
  },

  // CA parameters
  CA_INFLUENCE: 30,
  CA_SPEED: 20,
  isCAPaused: false,

  // Wave parameters
  WAVE_AMP: 0.5,
  WAVE_SPEED: 0.035,
  isWavePaused: false,

  // Color Wave parameters
  COLOR_WAVE_AMP: 0.5,
  COLOR_WAVE_SPEED: 0.005, // Map 10 from slider cleanly to 0.005 default
  isColorWavePaused: false,

  isGlobalPaused: false
};

function preload() {
  // We preload the first image in array implicitly to maintain 0 lag on open
  originalImg = loadImage(IMAGE_FOLDER + PRESET_IMAGES[0]);
}

function setup() {
  // Let p5 default to native pixel density for high resolution (Retina) screens
  noSmooth();

  let container = select('#canvas-container');
  let viewW = container.elt.parentNode.clientWidth - 64;
  let viewH = container.elt.parentNode.clientHeight - 64;

  let baseW = viewW;
  let baseH = viewH;
  if (originalImg) {
    let imgAspect = originalImg.width / originalImg.height;
    if (viewW / viewH > imgAspect) {
      baseW = viewH * imgAspect;
    } else {
      baseH = viewW / imgAspect;
    }
  }

  let targetW = baseW;
  let targetH = baseH;

  if (params.aspectMode !== 'Free' && originalImg) {
    let parts = params.aspectMode.split(':');
    let targetAspect = parseFloat(parts[0]) / parseFloat(parts[1]);

    if (baseW / baseH > targetAspect) {
      targetW = baseH * targetAspect;
    } else {
      targetH = baseW / targetAspect;
    }
  }

  let canvas = createCanvas(Math.floor(targetW), Math.floor(targetH));
  canvas.parent('canvas-container');

  setupRecorder(canvas);
  rectMode(CENTER);
  noStroke();

  bindGUI();
  updatePaletteColorsFromSelection();
  setupGrid();
}

function setupRecorder(canvas) {
  if (window.MediaRecorder) {
    // Capture at 60fps for smooth, high-fidelity playback
    let stream = canvas.elt.captureStream(60);

    // Priority order: VP9 for best quality/size ratio, then VP8, then fallback
    let mimes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    let selectedMime = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    if (selectedMime) {
      // 40 Mbps — high enough for crisp sharp pixel art at any canvas size
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMime,
        videoBitsPerSecond: 40_000_000
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (recordedChunks.length === 0) return;
        let ext = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
        let blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = `render_${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
      };
    }
  }
}

function toggleRecording(e) {
  if (e) e.stopPropagation();
  let btn = document.getElementById('btn-record');
  let img = document.getElementById('icon-record-img');

  if (isRecording) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    btn.classList.remove('recording');
    btn.title = 'Record Video';
    if (img) img.style.filter = '';
  } else {
    isRecording = true;
    btn.classList.add('recording');
    btn.title = 'Stop Recording';
    if (img) img.style.filter = 'invert(34%) sepia(85%) saturate(2960%) hue-rotate(346deg) brightness(101%) contrast(100%)';

    try {
      if (mediaRecorder) {
        recordedChunks = [];
        mediaRecorder.start(100); // flush data every 100ms
      } else {
        console.error("No mediaRecorder initialized.");
      }
    } catch (err) {
      console.error("Recording failed to start:", err);
    }
  }
}

function toggleGlobalPause() {
  params.isGlobalPaused = !params.isGlobalPaused;
  let btn = document.getElementById('btn-play-pause');
  let img = document.getElementById('icon-play-img');
  if (params.isGlobalPaused) {
    btn.classList.add('paused');
    btn.title = 'Resume All';
    if (img) img.src = 'assets/play.svg';
  } else {
    btn.classList.remove('paused');
    btn.title = 'Pause All';
    if (img) img.src = 'assets/pause.svg';
  }
}

function updatePaletteColorsFromSelection() {
  let pMode = params.palette;

  // if custom or saved, retrieve from object if it exists
  let targetPal = palettes[pMode] || params.customColors;

  document.getElementById('col-bg').style.backgroundColor = targetPal.bg;
  document.getElementById('col-sky').style.backgroundColor = targetPal.sky;
  document.getElementById('col-activeDark').style.backgroundColor = targetPal.activeDark;
  document.getElementById('col-activeMid').style.backgroundColor = targetPal.activeMid;
  document.getElementById('col-inactive').style.backgroundColor = targetPal.inactive;

  params.customColors = { ...targetPal };
}

function bindGUI() {
  // ── Popup helpers ─────────────────────────────────────
  const allPopups = () => document.querySelectorAll('.picker-popup, .is-popup');
  const allPanels = () => document.querySelectorAll('.tweaker-panel:not(.is-popup)');

  function closeAllPopups() {
    allPopups().forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.tb-overlay:not(.tb-tab)').forEach(btn => btn.classList.remove('active'));
    document.getElementById('preset-thumb-trigger')?.classList.remove('active');
  }

  function positionAbove(popup, triggerEl) {
    if (!triggerEl) return;
    const gap = 8;
    const rect = triggerEl.getBoundingClientRect();

    popup.style.bottom = (window.innerHeight - rect.top + gap) + 'px';
    popup.style.top = 'auto'; // Reset top from dragging

    const pw = popup.offsetWidth || 240;
    let left = rect.left + (rect.width / 2) - (pw / 2);

    // Bounds checking
    if (left < 10) left = 10;
    if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;

    popup.style.left = left + 'px';
    popup.style.transform = 'none';
  }

  function togglePopup(id, triggerEl) {
    const popup = document.getElementById(id);
    const wasHidden = popup.classList.contains('hidden');
    closeAllPopups();
    if (wasHidden) {
      popup.classList.remove('hidden');
      if (triggerEl) {
        triggerEl.classList.add('active');
        positionAbove(popup, triggerEl);
      }
    }
  }

  function closePanels() {
    allPanels().forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.tb-tab').forEach(t => t.classList.remove('active'));
  }

  function togglePanel(panelId, tabId) {
    const panel = document.getElementById(panelId);
    const tab = document.getElementById(tabId);
    const wasHidden = panel.classList.contains('hidden');
    closePanels();
    closeAllPopups();
    if (wasHidden) {
      panel.classList.remove('hidden');
      if (tab) {
        tab.classList.add('active');

        // Exact toolbar snapping
        const tbBottom = document.getElementById('toolbar-bottom');
        const tbRect = tbBottom.getBoundingClientRect();
        const gap = 8;

        panel.style.bottom = (window.innerHeight - tbRect.top + gap) + 'px';
        panel.style.top = 'auto'; // Reset top from dragging
        panel.style.transform = 'none';

        if (panelId === 'panel-image') {
          // Snap flush left to the bottom toolbar
          panel.style.left = tbRect.left + 'px';
          panel.style.right = 'auto';
        } else if (panelId === 'panel-motion') {
          // Snap flush right to the bottom toolbar
          panel.style.left = 'auto';
          panel.style.right = (window.innerWidth - tbRect.right) + 'px';
        } else {
          positionAbove(panel, tab);
        }
      }
    }
  }

  function makeDraggable(el) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    el.addEventListener('mousedown', (e) => {
      // Ignore inner interactive clicks
      if (['INPUT', 'BUTTON', 'SELECT', 'OPTION'].includes(e.target.tagName)) return;
      if (e.target.closest('.tweaker-slider, .tb-swatch, .picker-select, .picker-upload-btn, .tp-btn')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      el.style.bottom = 'auto';
      el.style.top = initialTop + 'px';
      el.style.left = initialLeft + 'px';
      el.style.transform = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = (initialLeft + dx) + 'px';
      el.style.top = (initialTop + dy) + 'px';
    });

    document.addEventListener('mouseup', () => isDragging = false);
    // Safety drop if mouse leaves or doc ends
    document.addEventListener('mouseleave', () => isDragging = false);
  }

  document.querySelectorAll('.picker-popup, .tweaker-panel').forEach(el => {
    // Exclude fixed snapped panels from being draggable
    if (el.id !== 'panel-image' && el.id !== 'panel-motion') {
      makeDraggable(el);
    }
  });

  // Close everything on outside click
  document.addEventListener('click', (e) => {
    const isToolbarEl =
      e.target.closest('#toolbar') ||
      e.target.closest('.picker-popup') ||
      e.target.closest('.tweaker-panel');
    if (!isToolbarEl) {
      closeAllPopups();
      closePanels();
    }
  });

  // ── Tab panels ─────────────────────────────────────────
  document.getElementById('tab-image').onclick = (e) => {
    e.stopPropagation();
    togglePanel('panel-image', 'tab-image');
  };
  document.getElementById('tab-motion').onclick = (e) => {
    e.stopPropagation();
    togglePanel('panel-motion', 'tab-motion');
  };

  document.querySelectorAll('.panel-close').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const panelId = btn.dataset.panel;
      document.getElementById(panelId).classList.add('hidden');
      document.querySelectorAll('.tb-tab').forEach(t => t.classList.remove('active'));
    };
  });

  // ── Preset Picker Popup ────────────────────────────────
  const thumbTrigger = document.getElementById('preset-thumb-trigger');
  thumbTrigger.onclick = (e) => { e.stopPropagation(); togglePopup('preset-picker', thumbTrigger); };

  // Populate custom preset layout
  let presetList = document.getElementById('preset-list');
  PRESET_IMAGES.forEach(imgName => {
    let btn = document.createElement('button');
    btn.className = 'preset-list-item';
    btn.innerText = imgName;
    btn.onclick = (e) => {
      e.stopPropagation();
      const thumbImg = document.getElementById('preset-thumb-img');
      if (thumbImg) thumbImg.src = IMAGE_FOLDER + imgName;

      document.querySelectorAll('.preset-list-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      closeAllPopups();
      loadImage(IMAGE_FOLDER + imgName, (newImg) => {
        originalImg = newImg;
        windowResized();
      });
    };
    presetList.appendChild(btn);
  });

  // Upload button inside preset header
  document.getElementById('preset-upload-btn').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('image-upload').click();
  };

  // Shuffle button inside preset header
  document.getElementById('preset-shuffle-btn').onclick = (e) => {
    e.stopPropagation();
    const randomImg = PRESET_IMAGES[Math.floor(Math.random() * PRESET_IMAGES.length)];
    const thumbImg = document.getElementById('preset-thumb-img');
    if (thumbImg) thumbImg.src = IMAGE_FOLDER + randomImg;

    document.querySelectorAll('.preset-list-item').forEach(b => {
      b.classList.remove('active');
      if (b.innerText === randomImg) b.classList.add('active');
    });

    closeAllPopups();
    loadImage(IMAGE_FOLDER + randomImg, (newImg) => {
      originalImg = newImg;
      windowResized();
    });
  };

  // Upload icon in toolbar also opens file picker
  document.getElementById('btn-upload').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('image-upload').click();
  };

  document.getElementById('image-upload').onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const thumbImg = document.getElementById('preset-thumb-img');
        if (thumbImg) thumbImg.src = event.target.result;
        closeAllPopups();
        loadImage(event.target.result, (newImg) => {
          originalImg = newImg;
          windowResized();
        });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // ── Alignment Popup ────────────────────────────────────
  document.getElementById('btn-alignment').onclick = (e) => {
    e.stopPropagation();
    togglePopup('alignment-popup', document.getElementById('btn-alignment'));
  };

  document.querySelectorAll('#alignment-popup .tp-section-header').forEach(btn => {
    btn.onclick = () => {
      params.gridMode = btn.dataset.value;
      document.getElementById('alignment-label').innerText = btn.innerText;
      document.querySelectorAll('#alignment-popup .tp-section-header').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      closeAllPopups();
      setupGrid();
    };
  });

  // ── Aspect Popup ───────────────────────────────────────
  document.getElementById('btn-aspect').onclick = (e) => {
    e.stopPropagation();
    togglePopup('aspect-popup', document.getElementById('btn-aspect'));
  };

  document.querySelectorAll('#aspect-popup .tp-section-header').forEach(btn => {
    btn.onclick = () => {
      params.aspectMode = btn.dataset.value;

      let newLabel = btn.dataset.value;
      if (btn.firstElementChild) {
        newLabel = btn.firstElementChild.innerText.split(' / ')[0];
      }
      document.getElementById('aspect-label').innerText = newLabel;

      document.querySelectorAll('#aspect-popup .tp-section-header').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      closeAllPopups();
      windowResized();
    };
  });

  // ── Palette Popup ──────────────────────────────────────
  document.getElementById('btn-palette-pick').onclick = (e) => {
    e.stopPropagation();
    togglePopup('palette-popup', document.getElementById('btn-palette-pick'));
  };

  document.querySelectorAll('#palette-popup .tp-section-header').forEach(btn => {
    btn.onclick = () => {
      params.palette = btn.dataset.value;
      document.getElementById('palette-label').innerText = btn.innerText;
      document.querySelectorAll('#palette-popup .tp-section-header').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      closeAllPopups();
      updatePaletteColorsFromSelection();
    };
  });

  // ── Color Swatches & Custom Picker ───────────────────────
  let activeSwatchId = null;

  document.querySelectorAll('.tb-swatch').forEach(swatch => {
    swatch.onclick = (e) => {
      e.stopPropagation();
      activeSwatchId = swatch.id;
      togglePopup('color-picker-popup', swatch);
    };
  });

  document.querySelectorAll('.cp-swatch').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (!activeSwatchId) return;

      let color = btn.dataset.color;
      let swatch = document.getElementById(activeSwatchId);
      if (swatch) {
        swatch.style.backgroundColor = color;

        let key = activeSwatchId.replace('col-', '');
        params.customColors[key] = color;

        // Mark as Custom
        let selectObj = document.getElementById('param-palette');
        if (selectObj) selectObj.value = 'Custom';
        document.getElementById('palette-label').innerText = 'Custom';
        params.palette = 'Custom';
      }
      closeAllPopups();
    };
  });

  // Save palette
  document.getElementById('btn-save-palette').onclick = (e) => {
    e.stopPropagation();
    let customName = prompt('Enter a name for your Custom Palette:');
    if (customName && customName.trim() !== '') {
      palettes[customName] = { ...params.customColors };
      document.getElementById('palette-label').innerText = customName;
      params.palette = customName;

      let existingBtn = document.querySelector(`#palette-popup .tp-section-header[data-value="${customName}"]`);
      if (!existingBtn) {
        let btn = document.createElement('button');
        btn.className = 'tp-section-header active';
        btn.dataset.value = customName;
        btn.innerText = customName;
        btn.onclick = () => {
          params.palette = btn.dataset.value;
          document.getElementById('palette-label').innerText = btn.innerText;
          document.querySelectorAll('#palette-popup .tp-section-header').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          closeAllPopups();
          updatePaletteColorsFromSelection();
        };
        let group = document.querySelector('#palette-popup .tp-group');
        if (group) group.appendChild(btn);

        document.querySelectorAll('#palette-popup .tp-section-header').forEach(b => {
          if (b !== btn) b.classList.remove('active');
        });
      }
    }
  };

  // ── bindInput helper ───────────────────────────────────
  const bindInput = (id, paramKey, valHtmlId = null, runSetup = false) => {
    let el = document.getElementById(id);
    if (!el) return;
    el.oninput = el.onchange = (e) => {
      let val = (el.type === 'checkbox') ? el.checked : el.value;
      if (typeof params[paramKey] === 'number') val = parseFloat(val);
      params[paramKey] = val;
      if (valHtmlId) document.getElementById(valHtmlId).innerText = val;
      if (runSetup) setupGrid();
    };
  };

  bindInput('param-zoom', 'imageZoom', 'zoom-val', true);
  bindInput('param-threshold', 'BASE_THRESHOLD', 'threshold-val');

  document.getElementById('param-density').oninput = (e) => {
    let rawIndex = parseInt(e.target.value);
    let mappedVal = densitySteps[rawIndex];
    params.gridDensity = mappedVal;
    document.getElementById('density-val').innerText = mappedVal;
    setupGrid();
  };

  // Distribution slider
  document.getElementById('param-dist-preset').oninput = (e) => {
    let v = parseInt(e.target.value);
    params.shapeDistPreset = v;
    document.getElementById('dist-preset-val').innerText = v;
    let desc = 'Background biased';
    if (v === 2) desc = 'Balanced bands';
    else if (v === 3) desc = 'Evenly distributed';
    else if (v === 4) desc = 'Mid-tone heavy';
    else if (v === 5) desc = 'Foreground heavy';
    const descEl = document.getElementById('dist-preset-desc');
    if (descEl) descEl.innerText = desc;
  };

  // CA controls
  document.getElementById('param-ca-speed').oninput = (e) => {
    let ups = parseInt(e.target.value);
    document.getElementById('ca-speed-val').innerText = ups;
    params.CA_SPEED = Math.max(1, Math.floor(60 / ups));
  };
  bindInput('param-ca-influence', 'CA_INFLUENCE', 'ca-influence-val');

  // Wave controls
  bindInput('param-wave-amp', 'WAVE_AMP', 'wave-amp-val');
  document.getElementById('param-wave-speed').oninput = (e) => {
    let intVal = parseInt(e.target.value);
    document.getElementById('wave-speed-val').innerText = intVal;
    params.WAVE_SPEED = intVal * 0.0003;
  };

  // Color wave controls
  bindInput('param-color-wave-amp', 'COLOR_WAVE_AMP', 'color-wave-amp-val');
  document.getElementById('param-color-wave-speed').oninput = (e) => {
    let intV = parseInt(e.target.value);
    document.getElementById('color-wave-speed-val').innerText = intV;
    params.COLOR_WAVE_SPEED = intV * 0.0005;
  };

  // Bind local automation buttons
  const bindLocalAnim = (btnId, stateKey) => {
    let btn = document.getElementById(btnId);
    if (!btn) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      window.imgAnimStates[stateKey] = !window.imgAnimStates[stateKey];
      let img = btn.querySelector('img');
      if (window.imgAnimStates[stateKey]) {
        img.src = 'assets/pause.svg';
        btn.title = 'Pause';
      } else {
        img.src = 'assets/play.svg';
        btn.title = 'Play';
      }
    };
  };

  bindLocalAnim('btn-anim-density', 'density');
  bindLocalAnim('btn-anim-zoom', 'zoom');
  bindLocalAnim('btn-anim-threshold', 'threshold');
  bindLocalAnim('btn-anim-dist', 'dist');

  // Bind individual local pauses
  const bindLocalPause = (btnId, paramKey) => {
    let btn = document.getElementById(btnId);
    if (!btn) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      params[paramKey] = !params[paramKey];
      let img = btn.querySelector('img');
      if (params[paramKey]) {
        img.src = 'assets/play.svg';
        btn.title = 'Play';
      } else {
        img.src = 'assets/pause.svg';
        btn.title = 'Pause';
      }
    };
  };

  bindLocalPause('btn-pause-ca', 'isCAPaused');
  bindLocalPause('btn-pause-wave', 'isWavePaused');
  bindLocalPause('btn-pause-color-wave', 'isColorWavePaused');

  // Actions
  document.getElementById('btn-export').onclick = () => saveCanvas('grid_export', 'png');
  document.getElementById('btn-record').onclick = toggleRecording;
  document.getElementById('btn-play-pause').onclick = toggleGlobalPause;
}


function initCA() {
  caState = [];
  caNext = [];
  for (let x = 0; x < tilesX; x++) {
    caState[x] = [];
    caNext[x] = [];
    for (let y = 0; y < tilesY; y++) {
      caState[x][y] = (random(1) > 0.7) ? 1 : 0;
      caNext[x][y] = 0;
    }
  }
}

function setupGrid() {
  if (!originalImg) return;

  tilesX = Math.floor(params.gridDensity);
  let renderImg = originalImg.get();

  // Zoom is handled as a pure visual scale() in draw() — no re-sampling needed


  tilesY = int(tilesX * renderImg.height / renderImg.width);

  let container = select('#canvas-container');
  let viewW = container.elt.parentNode.clientWidth - 64;
  let viewH = container.elt.parentNode.clientHeight - 64;

  let baseW = viewW;
  let baseH = viewH;
  let imgAspect = renderImg.width / renderImg.height;

  if (viewW / viewH > imgAspect) {
    baseW = viewH * imgAspect;
  } else {
    baseH = viewW / imgAspect;
  }

  cellSize = min(baseW / tilesX, baseH / tilesY);

  let gridW = cellSize * tilesX;
  let gridH = cellSize * tilesY;

  offsetX = (width - gridW) / 2 + cellSize / 2;
  offsetY = (height - gridH) / 2 + cellSize / 2;

  renderImg.resize(tilesX, tilesY);
  renderImg.loadPixels();

  brightnessData = [];
  colorData = [];

  for (let x = 0; x < tilesX; x++) {
    brightnessData[x] = [];
    colorData[x] = [];
    for (let y = 0; y < tilesY; y++) {
      let i = (x + y * tilesX) * 4;
      let r = renderImg.pixels[i];
      let g = renderImg.pixels[i + 1];
      let b = renderImg.pixels[i + 2];
      brightnessData[x][y] = (r + g + b) * 0.333;
      colorData[x][y] = [r, g, b];
    }
  }

  initCA();
}

function windowResized() {
  let container = select('#canvas-container');
  let viewW = container.elt.parentNode.clientWidth - 64;
  let viewH = container.elt.parentNode.clientHeight - 64;

  let baseW = viewW;
  let baseH = viewH;
  if (originalImg) {
    let imgAspect = originalImg.width / originalImg.height;
    if (viewW / viewH > imgAspect) {
      baseW = viewH * imgAspect;
    } else {
      baseH = viewW / imgAspect;
    }
  }

  let targetW = baseW;
  let targetH = baseH;

  if (params.aspectMode !== 'Free' && originalImg) {
    let parts = params.aspectMode.split(':');
    let targetAspect = parseFloat(parts[0]) / parseFloat(parts[1]);

    if (baseW / baseH > targetAspect) {
      targetW = baseH * targetAspect;
    } else {
      targetH = baseW / targetAspect;
    }
  }
  resizeCanvas(Math.floor(targetW), Math.floor(targetH));
  setupGrid();
}

function updateCA() {
  for (let x = 0; x < tilesX; x++) {
    for (let y = 0; y < tilesY; y++) {
      let neighbors = 0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (i === 0 && j === 0) continue;
          let nx = (x + i + tilesX) % tilesX;
          let ny = (y + j + tilesY) % tilesY;
          neighbors += caState[nx][ny];
        }
      }

      let state = caState[x][y];
      if (state === 1 && (neighbors < 2 || neighbors > 3)) caNext[x][y] = 0;
      else if (state === 0 && neighbors === 3) caNext[x][y] = 1;
      else caNext[x][y] = state;

      if (random(1) < 0.002) caNext[x][y] = 1;
    }
  }
  let temp = caState;
  caState = caNext;
  caNext = temp;
}

function getDrawList() {
  let colors = palettes[params.palette] || params.customColors;
  let gapX = (params.gridMode === 'Column Step' || params.gridMode === 'Column + Row Step') ? 2 : 0;
  let gapY = (params.gridMode === 'Column + Row Step') ? 2 : 0;
  let drawW = max(1, cellSize - gapX);
  let drawH = max(1, cellSize - gapY);

  let renderList = [];

  for (let x = 0; x < tilesX; x++) {
    for (let y = 0; y < tilesY; y++) {
      let bVal = brightnessData[x][y];
      let col = colorData[x][y];
      let r = col[0], g = col[1], b = col[2];

      let cx = offsetX + x * cellSize;
      let cy = offsetY + y * cellSize;

      let isSky = (b > 150 && b > r * 1.05 && b > g * 1.05);

      // Complex parametric wave (-1 to 1 range approx)
      let waveT1 = sin(x * 0.05 + y * 0.1 + waveTime * 1.2);
      let waveT2 = cos(x * 0.1 - y * 0.05 + waveTime * 0.8);
      let waveT3 = sin(x * 0.08 + y * 0.08 - waveTime * 1.5);
      let complexWaveNormal = (waveT1 + waveT2 + waveT3) / 3.0;

      // CA drastically shifts threshold per cell based on the CA_INFLUENCE UI Slider
      let caOffset = caState[x][y] === 1 ? params.CA_INFLUENCE : -params.CA_INFLUENCE;

      // Parametric wave also maps significantly to threshold 
      let waveThresholdOffset = complexWaveNormal * params.WAVE_AMP * 100;

      let activeThreshold = params.BASE_THRESHOLD + caOffset + waveThresholdOffset;
      let active = (bVal < activeThreshold);

      // A signal wave moving diagonally through the grid
      let colorSignal = sin(x * 0.15 - y * 0.1 + colorWaveTime * 2.0);

      // Static per-cell offset/delay to organically stagger the discrete transitions
      let cellVariant = ((x * 12.345 + y * 67.89) % 1.0) * 2.0 - 1.0;

      // Combined signal scaled by Intensity slider
      let waveImpact = (colorSignal + cellVariant) * params.COLOR_WAVE_AMP;

      let fillCol;
      if (isSky) {
        fillCol = colors.sky;
      } else {
        if (active) {
          // Baseline brightness hierarchy determines default color
          let isDark = (bVal < 75);

          // Discrete step: If the traveling signal crosses the threshold, swap the active tones!
          if (waveImpact > 0.4) {
            fillCol = isDark ? colors.activeMid : colors.activeDark;
          } else {
            fillCol = isDark ? colors.activeDark : colors.activeMid;
          }
        } else {
          fillCol = colors.inactive;
        }
      }

      let isSmall = false;
      let distMode = params.shapeDistPreset;
      if (distMode === 1) isSmall = (bVal >= activeThreshold); // Background biased (default)
      else if (distMode === 2) isSmall = (Math.floor(bVal / 64) % 2 === 1); // Balanced distribution
      else if (distMode === 3) isSmall = (Math.floor(bVal / 24) % 2 === 0); // Evenly distributed across rightness
      else if (distMode === 4) isSmall = (bVal >= 80 && bVal <= 160); // Mid-tone heavy
      else if (distMode === 5) isSmall = (bVal < activeThreshold); // Foreground heavy (inverted)

      renderList.push({
        x: cx, y: cy,
        w: isSmall ? cellSize * 0.4 : drawW,
        h: isSmall ? cellSize * 0.4 : drawH,
        col: fillCol
      });
    }
  }
  return { colors, renderList };
}

function draw() {
  if (!params.isGlobalPaused) {
    if (!params.isWavePaused) waveTime += params.WAVE_SPEED;
    if (!params.isColorWavePaused) colorWaveTime += params.COLOR_WAVE_SPEED;
    if (!params.isCAPaused && frameCount % params.CA_SPEED === 0) updateCA();

    // Apply parameterized image tweaker automations
    imgAnimTime += 0.003;
    let wave = quadEaseInOutWave(imgAnimTime);

    if (window.imgAnimStates.density) {
      let sl = document.getElementById('param-density');
      let v = Math.round(4 * wave);
      if (parseInt(sl.value) !== v) { sl.value = v; sl.dispatchEvent(new Event('input')); }
    }
    if (window.imgAnimStates.zoom) {
      // Directly mutate zoom — no setupGrid() trigger, pure visual scale
      let z = parseFloat((1.0 + 0.3 * wave).toFixed(3));
      params.imageZoom = z;
      let sl = document.getElementById('param-zoom');
      let valEl = document.getElementById('zoom-val');
      if (sl) sl.value = z;
      if (valEl) valEl.innerText = z.toFixed(2);
    }
    if (window.imgAnimStates.threshold) {
      let sl = document.getElementById('param-threshold');
      let v = Math.round(255 * wave);
      if (parseInt(sl.value) !== v) { sl.value = v; sl.dispatchEvent(new Event('input')); }
    }
    if (window.imgAnimStates.dist) {
      let sl = document.getElementById('param-dist-preset');
      let v = Math.round(1 + 4 * wave);
      if (parseInt(sl.value) !== v) { sl.value = v; sl.dispatchEvent(new Event('input')); }
    }
  }

  let { colors, renderList } = getDrawList();

  background(colors.bg);

  // Apply visual zoom as a centred scale transform — no grid rebuild needed
  push();
  translate(width / 2, height / 2);
  scale(params.imageZoom);
  translate(-width / 2, -height / 2);

  for (let item of renderList) {
    fill(item.col);
    rect(item.x, item.y, item.w, item.h);
  }

  pop();
}

function exportSVG() {
  let { colors, renderList } = getDrawList();

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="${colors.bg}" />`;

  for (let item of renderList) {
    // rectMode(CENTER) equivalent for SVG
    let rx = item.x - item.w / 2;
    let ry = item.y - item.h / 2;
    svg += `<rect x="${rx}" y="${ry}" width="${item.w}" height="${item.h}" fill="${item.col}" />`;
  }
  svg += `</svg>`;

  let blob = new Blob([svg], { type: "image/svg+xml" });
  let url = URL.createObjectURL(blob);
  let a = document.createElement("a");
  a.href = url;
  a.download = "grid_export.svg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}