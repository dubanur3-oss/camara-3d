// ═══════════════════════════════════════════════════════════════════
//  3D DEPTH CAMERA — SURVIVAL GAME EDITION
// ═══════════════════════════════════════════════════════════════════

// ── Config ──────────────────────────────────────────────────────────
const MAX_POINTS = 100000; // Alta densidad para claridad máxima 
let DEPTH_SCALE  = 2.5;

// ── Three.js State ──────────────────────────────────────────────────
let camera3d, scene, renderer, pointCloud, geometry, material;
let videoEl, processingCanvas, processingCtx;
let depthModel = null;
let isEstimating = false;

// ── Game State ───────────────────────────────────────────────────────
let gameState = 'ALIVE'; // ALIVE, DYING, REBUILDING
let timeSurvived = 0;
let deathTimer = 10;     // Segundos hasta morir
let lastUpdate = performance.now();
let velArray = new Float32Array(MAX_POINTS * 3); // Para físicas de caída

// ── UI Elements ──────────────────────────────────────────────────────
const timeValEl = document.getElementById('time-val');
const stateUIEl = document.getElementById('game-state-ui');
const glitchEl  = document.getElementById('glitch-overlay');
const dotEl     = document.getElementById('rec-dot');

function getNewDeathTime() {
    // Morirá aleatoriamente entre 8 y 25 segundos
    return Math.random() * 17 + 8;
}

// ── Init ThreeJS ─────────────────────────────────────────────────────
function initThree() {
  const canvas = document.getElementById('three-canvas');
  const wrapper = document.getElementById('canvas-wrapper');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.15); // Añade profundidad espacial

  camera3d = new THREE.PerspectiveCamera(60, wrapper.clientWidth / wrapper.clientHeight, 0.1, 100);
  camera3d.position.set(0, 0, 3); // Más lejos para ver más del mapa local

  // Geometry
  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_POINTS * 3);
  const colors    = new Float32Array(MAX_POINTS * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

  // Lidar Glow Texture
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 32; canvas2d.height = 32;
  const ctx2d = canvas2d.getContext('2d');
  const gradient = ctx2d.createRadialGradient(16,16,0, 16,16,16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0,0,32,32);
  const glowTex = new THREE.CanvasTexture(canvas2d);

  material = new THREE.PointsMaterial({
    size: 0.05, // Partículas pequeñas y nítidas
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    map: glowTex,
    alphaTest: 0.02,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);

  window.addEventListener('resize', () => {
    renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    camera3d.aspect = wrapper.clientWidth / wrapper.clientHeight;
    camera3d.updateProjectionMatrix();
  });
}

// ── PointCloud Math ──────────────────────────────────────────────────
function updateHologramCore(depthData, imgData, width, height) {
  const pos  = geometry.attributes.position.array;
  const col  = geometry.attributes.color.array;
  const sampleRate = Math.max(1, Math.floor(depthData.length / MAX_POINTS)); 
  const aspect = width / height;

  let idx = 0;
  for (let i = 0; i < depthData.length; i += sampleRate) {
      if (idx >= MAX_POINTS) break;

      const depth = depthData[i]; 
      if (depth < 0.05 || depth > 0.98) continue; 

      const x = i % width;
      const y = Math.floor(i / width);
      const nx = (x / width  - 0.5) * 2 * aspect;
      const ny = -(y / height - 0.5) * 2; 
      
      const invDepth = 1.0 - depth;
      const distance = (invDepth * DEPTH_SCALE * 4.0) + 1.2; 
      
      const targetX = nx * distance * 0.8;
      const targetY = ny * distance * 0.8;
      const targetZ = -distance;
      
      // Aplicación de color fotorealista RGB siempre
      col[idx*3]   = Math.min(1.0, (imgData[i*4]   / 255) * 1.5);
      col[idx*3+1] = Math.min(1.0, (imgData[i*4+1] / 255) * 1.5);
      col[idx*3+2] = Math.min(1.0, (imgData[i*4+2] / 255) * 1.5);

      // Lógica de Físicas según el juego
      if (gameState === 'ALIVE') {
          // Instantáneo y claro, sin acumulación
          pos[idx*3]   = targetX;
          pos[idx*3+1] = targetY;
          pos[idx*3+2] = targetZ;
      } 
      else if (gameState === 'DYING') {
          // Gravedad: las partículas caen y se dispersan usando velArray
          pos[idx*3]   += velArray[idx*3];
          pos[idx*3+1] += velArray[idx*3+1];
          pos[idx*3+2] += velArray[idx*3+2];
          velArray[idx*3+1] -= 0.01; // Fuerza de gravedad
          
          // Color rojo daño
          col[idx*3] = 1.0; col[idx*3+1] *= 0.2; col[idx*3+2] *= 0.2;
      }
      else if (gameState === 'REBUILDING') {
          // Las partículas vuelven magnéticamente a sus posiciones reales (Efecto Lerp)
          pos[idx*3]   += (targetX - pos[idx*3]) * 0.05;
          pos[idx*3+1] += (targetY - pos[idx*3+1]) * 0.05;
          pos[idx*3+2] += (targetZ - pos[idx*3+2]) * 0.05;
      }

      idx++;
  }

  geometry.setDrawRange(0, idx);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate    = true;
}

// ── Game Logic ───────────────────────────────────────────────────────
function breakHologram() {
    gameState = 'DYING';
    stateUIEl.className = 'state-dead';
    stateUIEl.textContent = 'IA ATACANDO - SISTEMA CRÍTICO';
    dotEl.style.background = '#ff003c';
    glitchEl.style.opacity = '1';

    // Generar velocidades de explosión para las partículas
    for(let i=0; i<MAX_POINTS*3; i+=3) {
       velArray[i]   = (Math.random() - 0.5) * 0.3;
       velArray[i+1] = (Math.random() - 0.2) * 0.5; 
       velArray[i+2] = (Math.random() - 0.5) * 0.3;
    }

    // Efecto visual en UI
    setTimeout(() => { glitchEl.style.opacity = '0.3'; }, 100);
    setTimeout(() => { glitchEl.style.opacity = '0.8'; }, 300);
    setTimeout(() => { glitchEl.style.opacity = '0'; }, 600);

    // Muerte dura 3 a 5 segundos
    setTimeout(() => {
        gameState = 'REBUILDING';
        stateUIEl.className = 'state-build';
        stateUIEl.textContent = 'RESTAURANDO HOLOGRAMA...';
        dotEl.style.background = '#ffff00';
        
        setTimeout(() => {
            gameState = 'ALIVE';
            stateUIEl.className = 'state-alive';
            stateUIEl.textContent = 'SISTEMA ESTABLE';
            dotEl.style.background = '#00f5ff';
            deathTimer = getNewDeathTime(); // Nueva amenaza programada
        }, 4000); // 4 seg reconstruyendo
    }, Math.random() * 2000 + 3000); 
}

function updateGame() {
    const now = performance.now();
    const dt = (now - lastUpdate) / 1000;
    lastUpdate = now;

    if (gameState === 'ALIVE') {
        timeSurvived += dt;
        timeValEl.textContent = timeSurvived.toFixed(1) + 's';
        
        deathTimer -= dt;
        if (deathTimer <= 0) {
            breakHologram();
        }
    }
}

// ── Camera and AI Loop ───────────────────────────────────────────────
let currentFacingMode = 'environment';
let currentStream = null;

async function initCamera() {
  videoEl = document.getElementById('video-hidden');
  try {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: currentFacingMode }, width: { ideal: 320 }, height: { ideal: 240 } } });
    currentStream = stream;
    videoEl.srcObject = stream;
    await new Promise(r => videoEl.onloadedmetadata = r);
    videoEl.play();
  } catch(e) {
    alert("Error accediendo a la cámara. Usa HTTPS.");
  }
}

async function loadDepthModel() {
  const loading = document.getElementById('loading');
  const msg = document.getElementById('load-msg');
  loading.style.display = 'flex';
  try {
    msg.textContent = "Cargando MiDaS Neural Network...";
    depthModel = await depthEstimation.createEstimator(depthEstimation.SupportedModels.ARPortraitDepth, { outputDepthRange: [0, 1] });
    loading.style.display = 'none';
  } catch(e) {
    alert("Fallo la IA: " + e.message);
    loading.style.display = 'none';
  }
}

// Generador falso temporal (si la IA falla)
function luminanceDepth(imgData, w, h) {
  const out = new Float32Array(w * h);
  for(let i=0; i<w*h; i++) {
    out[i] = 0.299*(imgData[i*4]/255) + 0.587*(imgData[i*4+1]/255) + 0.114*(imgData[i*4+2]/255);
  }
  return out;
}

let fpsFrames = 0, lastFpsFrame = performance.now();
function renderLoop() {
  requestAnimationFrame(renderLoop);
  
  updateGame(); // Lógica de tiempo y ataques

  // Contar FPS
  fpsFrames++;
  if (performance.now() - lastFpsFrame >= 1000) {
      document.getElementById('fps-val').textContent = fpsFrames;
      fpsFrames = 0; lastFpsFrame = performance.now();
  }

  // Rotación ligera automática para efecto de cámara de seguridad, orbitX o device si se programara, 
  // pero lo haremos sutilmente rotativo
  if (gameState === 'ALIVE') {
      pointCloud.rotation.y = Math.sin(timeSurvived * 0.5) * 0.2; 
  } else {
      pointCloud.rotation.y += Math.random() * 0.05; // Agita en ataque
      pointCloud.position.x = (Math.random() - 0.5) * 0.1;
  }

  if (videoEl && videoEl.readyState >= 2 && !isEstimating) {
      processingCtx.drawImage(videoEl, 0, 0, 160, 120);
      const imgData = processingCtx.getImageData(0, 0, 160, 120);
      
      if (depthModel) {
          isEstimating = true;
          depthModel.estimateDepth(processingCanvas).then(depthMap => {
              const dTensor = depthMap.toTensor();
              updateHologramCore(dTensor.dataSync(), imgData.data, 160, 120);
              dTensor.dispose();
              isEstimating = false;
          }).catch(e => {
              updateHologramCore(luminanceDepth(imgData.data, 160, 120), imgData.data, 160, 120);
              isEstimating = false;
          });
      } else {
          updateHologramCore(luminanceDepth(imgData.data, 160, 120), imgData.data, 160, 120);
      }
  }
  renderer.render(scene, camera3d);
}

// ── Boot ──────────────────────────────────────────────────────────────
document.getElementById('btn-start-app').addEventListener('click', async () => {
    document.getElementById('start-overlay').style.display = 'none';
    
    initThree();
    processingCanvas = document.createElement('canvas');
    processingCanvas.width = 160; processingCanvas.height = 120;
    processingCtx = processingCanvas.getContext('2d');
    
    await initCamera();
    await loadDepthModel();
    
    lastUpdate = performance.now();
    deathTimer = getNewDeathTime();
    requestAnimationFrame(renderLoop);
});

document.getElementById('btn-flip-cam').addEventListener('click', () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    initCamera();
});

// PWA Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
