let originalImg;
let brightnessData = [];
let colorData = [];

// Image Preset Configuration
const IMAGE_FOLDER = 'images/'; // Leave blank if placed in root directory
const PRESET_IMAGES = [
  'tree copy.jpg',
  'leaf.png',
  'seed.jpg'
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
  'Base': {
    bg: '#FFF8E9', sky: '#A9DBFF',
    activeDark: '#172119', activeMid: '#918E43', inactive: '#4D5024'
  },
  'Monochrome': {
    bg: '#EAEAEA', sky: '#999999',
    activeDark: '#111111', activeMid: '#555555', inactive: '#333333'
  },
  'Vibrant Dark': {
    bg: '#003358', sky: '#8FB9D6',
    activeDark: '#A3B34F', activeMid: '#816845', inactive: '#2C3531'
  },
  'Warm Matte': {
    bg: '#F5E6CC', sky: '#E8A87C',
    activeDark: '#4D3B31', activeMid: '#E27D60', inactive: '#85D2D0'
  }
};

const params = {
  gridDensity: 64,
  imageZoom: 1.0,
  shapeDistPreset: 1,
  gridMode: 'Tight',
  BASE_THRESHOLD: 200,
  palette: 'Base',
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
  pixelDensity(1);

  let container = select('#canvas-container');
  let viewW = container.elt.parentNode.clientWidth - 100;
  let viewH = container.elt.parentNode.clientHeight - 100;

  let targetW = viewW;
  let targetH = viewH;
  if (originalImg) {
    let aspect = originalImg.width / originalImg.height;
    if (viewW / viewH > aspect) {
      targetW = viewH * aspect;
    } else {
      targetH = viewW / aspect;
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
    let stream = canvas.elt.captureStream(30);

    // Check multiple possible mime types
    let mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    let selectedMime = mimes.find(m => MediaRecorder.isTypeSupported(m)) || '';

    if (selectedMime) {
      mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMime });

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

function toggleRecording() {
  if (!mediaRecorder) return;
  let btn = document.getElementById('btn-record');
  if (isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    btn.innerText = 'Start Recording';
  } else {
    recordedChunks = [];
    mediaRecorder.start();
    isRecording = true;
    btn.innerText = 'Stop Recording';
  }
}

function toggleGlobalPause() {
  params.isGlobalPaused = !params.isGlobalPaused;
  let btn = document.getElementById('btn-play-pause');
  if (params.isGlobalPaused) {
    btn.innerText = 'Play';
    btn.classList.add('paused');
  } else {
    btn.innerText = 'Pause';
    btn.classList.remove('paused');
  }
}

function updatePaletteColorsFromSelection() {
  let pMode = params.palette;

  // if custom or saved, retrieve from object if it exists
  let targetPal = palettes[pMode] || params.customColors;

  document.getElementById('col-bg').value = targetPal.bg;
  document.getElementById('col-sky').value = targetPal.sky;
  document.getElementById('col-activeDark').value = targetPal.activeDark;
  document.getElementById('col-activeMid').value = targetPal.activeMid;
  document.getElementById('col-inactive').value = targetPal.inactive;

  params.customColors = { ...targetPal };
}

function bindGUI() {
  document.getElementById('btn-upload').onclick = () => document.getElementById('image-upload').click();

  let presetSelect = document.getElementById('param-image-preset');
  PRESET_IMAGES.forEach(imgName => {
    let opt = document.createElement('option');
    opt.value = imgName;
    opt.innerText = imgName;
    presetSelect.appendChild(opt);
  });

  presetSelect.onchange = (e) => {
    loadImage(IMAGE_FOLDER + e.target.value, (newImg) => {
      originalImg = newImg;
      windowResized();
    });
  };

  document.getElementById('image-upload').onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        loadImage(event.target.result, (newImg) => {
          originalImg = newImg;
          windowResized();
        });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const bindInput = (id, paramKey, valHtmlId = null, runSetup = false) => {
    let el = document.getElementById(id);
    el.oninput = (e) => {
      let val = (el.type === 'checkbox') ? el.checked : el.value;
      if (typeof params[paramKey] === 'number') val = parseFloat(val);
      params[paramKey] = val;
      if (valHtmlId) document.getElementById(valHtmlId).innerText = val;
      if (runSetup) setupGrid();

      // Run mapping exclusively for params that need complex handling
      if (id === 'param-palette') {
        updatePaletteColorsFromSelection();
      }
    };
  };

  bindInput('param-zoom', 'imageZoom', 'zoom-val', true);
  
  let distSlider = document.getElementById('param-dist-preset');
  distSlider.oninput = (e) => {
    let v = parseInt(e.target.value);
    params.shapeDistPreset = v;
    document.getElementById('dist-preset-val').innerText = v;
    
    let desc = "Background biased";
    if (v === 2) desc = "Balanced bands";
    else if (v === 3) desc = "Evenly distributed";
    else if (v === 4) desc = "Mid-tone heavy";
    else if (v === 5) desc = "Foreground heavy";
    
    document.getElementById('dist-preset-desc').innerText = desc;
  };

  document.getElementById('param-density').oninput = (e) => {
    let rawIndex = parseInt(e.target.value);
    let mappedVal = densitySteps[rawIndex];
    params.gridDensity = mappedVal;
    document.getElementById('density-val').innerText = mappedVal;
    setupGrid();
  };

  bindInput('param-mode', 'gridMode', null, true);
  bindInput('param-threshold', 'BASE_THRESHOLD', 'threshold-val');
  bindInput('param-palette', 'palette');

  // Colors
  const bindColor = (id, key) => {
    let el = document.getElementById(id);
    el.oninput = () => {
      params.customColors[key] = el.value;
      document.getElementById('param-palette').value = "Custom";
      params.palette = "Custom";
    };
  };
  bindColor('col-bg', 'bg');
  bindColor('col-sky', 'sky');
  bindColor('col-activeDark', 'activeDark');
  bindColor('col-activeMid', 'activeMid');
  bindColor('col-inactive', 'inactive');

  document.getElementById('btn-save-palette').onclick = () => {
    let selectObj = document.getElementById('param-palette');
    let customName = prompt("Enter a name for your Custom Palette:");
    if (customName && customName.trim() !== "") {
      palettes[customName] = { ...params.customColors };
      let opt = document.createElement('option');
      opt.value = customName;
      opt.innerHTML = customName;
      selectObj.appendChild(opt);
      selectObj.value = customName;
      params.palette = customName;
    }
  };

  // CA
  let mappedCASpeed = [30, 24, 15, 10, 6, 4, 3, 2, 1]; // mappings for UI slider 1-30 frequency? 
  // Wait, if UI is 'CA Updates per sec' 1-30, we want frames-per-update:
  document.getElementById('param-ca-speed').oninput = (e) => {
    let ups = parseInt(e.target.value);
    document.getElementById('ca-speed-val').innerText = ups;
    params.CA_SPEED = Math.max(1, Math.floor(60 / ups)); // 60fps / UPS = frames per step
  };

  bindInput('param-ca-influence', 'CA_INFLUENCE', 'ca-influence-val');
  bindInput('param-ca-pause', 'isCAPaused');
  bindInput('param-wave-amp', 'WAVE_AMP', 'wave-amp-val');

  document.getElementById('param-wave-speed').oninput = (e) => {
    let intVal = parseInt(e.target.value);
    document.getElementById('wave-speed-val').innerText = intVal;
    params.WAVE_SPEED = intVal * 0.0003;
  };
  bindInput('param-wave-pause', 'isWavePaused');

  // Color Wave Controls
  bindInput('param-color-wave-amp', 'COLOR_WAVE_AMP', 'color-wave-amp-val');
  document.getElementById('param-color-wave-speed').oninput = (e) => {
    let intV = parseInt(e.target.value);
    document.getElementById('color-wave-speed-val').innerText = intV;
    params.COLOR_WAVE_SPEED = intV * 0.0005; // very slow, organic
  };
  bindInput('param-color-wave-pause', 'isColorWavePaused');

  document.getElementById('btn-export').onclick = () => saveCanvas('grid_export', 'png');
  document.getElementById('btn-export-svg').onclick = exportSVG;
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

  if (params.imageZoom !== 1.0) {
    let cw = originalImg.width;
    let ch = originalImg.height;
    let pg = createGraphics(cw, ch);
    pg.background(color(palettes[params.palette]?.bg || params.customColors?.bg || '#FFF8E9')); 
    pg.imageMode(CENTER);
    pg.image(originalImg, cw/2, ch/2, cw * params.imageZoom, ch * params.imageZoom);
    renderImg = pg.get();
    pg.remove();
  }

  tilesY = int(tilesX * renderImg.height / renderImg.width);

  cellSize = min(width / tilesX, height / tilesY);

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
  let viewW = container.elt.parentNode.clientWidth - 100;
  let viewH = container.elt.parentNode.clientHeight - 100;

  let targetW = viewW;
  let targetH = viewH;
  if (originalImg) {
    let aspect = originalImg.width / originalImg.height;
    if (viewW / viewH > aspect) {
      targetW = viewH * aspect;
    } else {
      targetH = viewW / aspect;
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
  }

  let { colors, renderList } = getDrawList();

  background(colors.bg);

  if (isRecording && frameCount % 30 < 15) {
    fill(255, 50, 50);
    circle(30, 30, 15);
  }

  for (let item of renderList) {
    fill(item.col);
    rect(item.x, item.y, item.w, item.h);
  }
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