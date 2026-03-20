let originalImg;
let font;

let brightnessData = [];
let colorData = [];

let cellSize;
let offsetX, offsetY;

let tilesX = 80;
let tilesY;

let glowLayer;
let trail = [];

const params = {
  uploadImage: () => { document.getElementById('image-upload').click(); },
  tilesX: 80,
  txt: "⬛⬤01",

  WAVE_SPEED: 0.02,
  SPATIAL_SPEED: 1.5,
  TEXT_SPEED: 0.01,
  TEXT_STEP: 10,
  DELAY_RANGE: 20,

  GLOW_BLUR: 4,

  TRAIL_LENGTH: 20,
  TRAIL_RADIUS: 150,

  // Colors
  bgColor: '#FFF8E9',
  skyLight: '#A9DBFF',
  skyDark: '#FFF8E9',
  activeDark: '#172119',
  activeMid: '#918E43',
  inactiveDark: '#4D5024',
  inactiveLight: '#A9DBFF',
  textSky: '#ECF7FF',
  textActiveDarkFill: '#A3B34F',
  textActiveMidFill: '#172119'
};

function preload() {
  originalImg = loadImage("tree.jpg");
  font = loadFont("PPFraktionMono-Regular.otf");
}

function setup() {
  pixelDensity(1); 
  createCanvas(windowWidth, windowHeight);

  glowLayer = createGraphics(width, height);

  textAlign(CENTER, CENTER);
  textFont(font);
  glowLayer.textAlign(CENTER, CENTER);
  glowLayer.textFont(font);

  setupGUI();
  setupImageInput();
  setupGrid();
}

function setupGUI() {
  const gui = new lil.GUI({ title: 'Visualizer Settings' });
  
  gui.add(params, 'uploadImage').name('🖼️ Upload Image...');

  const gridFolder = gui.addFolder('Grid & Text');
  gridFolder.add(params, 'tilesX', 10, 200, 1).name('Grid Columns').onChange(setupGrid);
  gridFolder.add(params, 'txt').name('Text Charset');

  const animFolder = gui.addFolder('Animation');
  animFolder.add(params, 'WAVE_SPEED', 0, 0.1, 0.001).name('Wave Speed');
  animFolder.add(params, 'SPATIAL_SPEED', 0, 5, 0.1).name('Spatial Speed');
  animFolder.add(params, 'TEXT_SPEED', 0, 0.1, 0.001).name('Text Speed');
  animFolder.add(params, 'TEXT_STEP', 1, 30, 1).name('Text Step');
  animFolder.add(params, 'DELAY_RANGE', 0, 100, 1).name('Delay Range');

  const visualFolder = gui.addFolder('Visuals');
  
  visualFolder.add(params, 'GLOW_BLUR', 0, 20, 1).name('Glow Blur');

  const trailFolder = gui.addFolder('Mouse Trail');
  trailFolder.add(params, 'TRAIL_LENGTH', 0, 100, 1).name('Trail Length');
  trailFolder.add(params, 'TRAIL_RADIUS', 10, 500, 1).name('Trail Radius');

  const colorsFolder = gui.addFolder('Colors Palette');
  colorsFolder.addColor(params, 'bgColor').name('Background');
  colorsFolder.addColor(params, 'skyLight').name('Sky (Light)');
  colorsFolder.addColor(params, 'skyDark').name('Sky (Dark)');
  colorsFolder.addColor(params, 'activeDark').name('Active (Dark)');
  colorsFolder.addColor(params, 'activeMid').name('Active (Mid)');
  colorsFolder.addColor(params, 'inactiveDark').name('Inactive (Dark)');
  colorsFolder.addColor(params, 'inactiveLight').name('Inactive (Light)');
  colorsFolder.addColor(params, 'textSky').name('Text Sky');
  colorsFolder.addColor(params, 'textActiveDarkFill').name('Text Active Dark');
  colorsFolder.addColor(params, 'textActiveMidFill').name('Text Active Mid');
}

function setupImageInput() {
  const fileInput = document.getElementById('image-upload');
  fileInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = function(event) {
        loadImage(event.target.result, function(newImg) {
          originalImg = newImg;
          setupGrid();
        });
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  });
}

function setupGrid() {
  if (!originalImg) return;

  tilesX = Math.floor(params.tilesX);
  
  // Make a copy to avoid downscaling the original image continuously
  let renderImg = originalImg.get(); 

  tilesY = int(tilesX * renderImg.height / renderImg.width);

  cellSize = min(width / tilesX, height / tilesY);

  let gridW = cellSize * tilesX;
  let gridH = cellSize * tilesY;

  offsetX = (width - gridW) / 2;
  offsetY = (height - gridH) / 2;

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
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  glowLayer = createGraphics(width, height);
  glowLayer.textAlign(CENTER, CENTER);
  glowLayer.textFont(font);
  setupGrid();
}

function draw() {
  background(params.bgColor);
  glowLayer.clear();

  // 🖱️ trail update
  trail.push([mouseX, mouseY]);
  while (trail.length > params.TRAIL_LENGTH) {
    trail.shift();
  }

  let t = frameCount * params.WAVE_SPEED;

  let waveS =
    sin(t) * 30 +
    sin(t * 0.5 + 1.3) * 15 +
    cos(t * 1.7) * 10;

  waveS = constrain(waveS, -60, 60);
  let baseThreshold = 150 + waveS;

  noStroke();

  let trailRadiusSq = params.TRAIL_RADIUS * params.TRAIL_RADIUS;

  for (let x = 0; x < tilesX; x++) {
    for (let y = 0; y < tilesY; y++) {

      let bVal = brightnessData[x][y];
      let col = colorData[x][y];
      let r = col[0], g = col[1], b = col[2];

      let px = offsetX + x * cellSize;
      let py = offsetY + y * cellSize;

      let cx = px + cellSize * 0.5;
      let cy = py + cellSize * 0.5;

      // 🌊 spatial wave
      let spatialWave =
        sin((x * 0.4 + y * 0.4) + t * params.SPATIAL_SPEED) * 30 +
        cos((x * 0.2 - y * 0.3) + t * params.SPATIAL_SPEED * 0.75) * 20;

      let active = bVal < (150 + spatialWave);

      // 🖱️ TRAIL (optimized distance)
      let trailInfluence = 0;

      for (let i = 0; i < trail.length; i++) {
        let p = trail[i];

        let dx = cx - p[0];
        let dy = cy - p[1];
        let dSq = dx * dx + dy * dy;

        if (dSq < trailRadiusSq) {
          let influence = 1 - dSq / trailRadiusSq;
          influence *= i / trail.length;
          trailInfluence += influence;
        }
      }

      if (trailInfluence > 1) trailInfluence = 1;

      let threshold = baseThreshold + spatialWave + trailInfluence * 120;
      let isSmall = !(bVal < threshold);

      // 🎨 color logic respecting customizable palette
      let isSky = (b > 150 && b > r * 1.05 && b > g * 1.05);

      let fillCol;

      if (isSky) {
        fillCol = (b > 200) ? params.skyLight : params.skyDark;
      } else {
        if (active) {
          fillCol = (bVal < 75) ? params.activeDark : params.activeMid;
        } else {
          fillCol = (bVal < 150) ? params.inactiveDark : params.inactiveLight;
        }
      }

      fill(fillCol);

      // 🔷 shape
      if (!isSmall) {
        rect(px, py, cellSize, cellSize);
      } else {
        rect(cx, cy, cellSize * 0.5, cellSize * 0.5);
      }

      // 🔤 text (localized)
      if (active && trailInfluence > 0.08) {

        let delay = (1 - trailInfluence) * params.DELAY_RANGE;

        let steppedTime =
          floor(frameCount * params.TEXT_SPEED * params.TEXT_STEP) / params.TEXT_STEP;

        let flow = steppedTime - delay;

        let txtStr = params.txt || " ";
        let index = (flow + x * 0.3 + y * 0.2) | 0;
        index = ((index % txtStr.length) + txtStr.length) % txtStr.length;

        let ch = txtStr[index];

        let txtCol = isSky
          ? params.textSky
          : (fillCol === params.activeDark ? params.textActiveDarkFill : params.textActiveMidFill);

        let shapeScale = isSmall ? 0.5 : 1;

        // glow (lighter)
        glowLayer.push();
        glowLayer.translate(cx, cy);
        glowLayer.scale(shapeScale);
        
        let c = color(txtCol);
        c.setAlpha(128);
        glowLayer.fill(c);
        
        glowLayer.textSize(cellSize * 0.8);
        glowLayer.text(ch, 0, -2);
        glowLayer.pop();

        // main
        push();
        translate(cx, cy);
        scale(shapeScale);
        fill(txtCol);
        textSize(cellSize * 0.8);
        text(ch, 0, -2);
        pop();
      }
    }
  }

  glowLayer.filter(BLUR, params.GLOW_BLUR);
  blendMode(ADD);
  image(glowLayer, 0, 0);
  blendMode(BLEND);
}