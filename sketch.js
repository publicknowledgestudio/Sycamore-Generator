let originalImg;
let brightnessData = [];
let colorData = [];

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
  gridDensity: 80,
  gridMode: 'Tight',
  BASE_THRESHOLD: 200,
  palette: 'Base',
  customColors: {
    bg: '#FFF8E9', sky: '#A9DBFF',
    activeDark: '#172119', activeMid: '#918E43', inactive: '#4D5024'
  },

  // CA parameters
  CA_INFLUENCE: 30,  // Determines how intensely CA modifies threshold structures
  CA_SPEED: 20,      // (60fps / 3 UPS = 20 frames per step delay)
  isCAPaused: false,
  
  // Wave parameters
  WAVE_AMP: 0.5,     // Shape distribution interpolation override scaler
  WAVE_SPEED: 0.035, // Rate of spatial grid temporal deformation
  isWavePaused: false
};

function preload() {
  originalImg = loadImage("tree.jpg");
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
    let options = { mimeType: 'video/webm' };
    if (MediaRecorder.isTypeSupported('video/mp4')) {
      options = { mimeType: 'video/mp4' };
    }
    mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorder.ondataavailable = function (e) {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = function () {
      let ext = mediaRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
      let blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
      let url = URL.createObjectURL(blob);
      let a = document.createElement('a');
      a.href = url;
      a.download = `render.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    };
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

      if (id === 'param-palette') {
        updatePaletteColorsFromSelection();
      }
    };
  };

  bindInput('param-density', 'gridDensity', 'density-val', true);
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
    params.WAVE_SPEED = intVal * 0.0003; // maps 0-100 to 0.0-0.03
  };
  bindInput('param-wave-pause', 'isWavePaused');

  document.getElementById('btn-export').onclick = () => saveCanvas('grid_export', 'png');
  document.getElementById('btn-export-svg').onclick = exportSVG;
  document.getElementById('btn-record').onclick = toggleRecording;
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

      let fillCol;
      if (isSky) {
        fillCol = colors.sky; // Sky -> light tones
      } else {
        if (active) {
          fillCol = (bVal < 75) ? colors.activeDark : colors.activeMid;
        } else {
          fillCol = colors.inactive;
        }
      }

      let isSmall = !(active);

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
  if (!params.isWavePaused) waveTime += params.WAVE_SPEED;
  if (!params.isCAPaused && frameCount % params.CA_SPEED === 0) updateCA();

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