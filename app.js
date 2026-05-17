// ═══════════════════════════════════════════════════════════════════
//  3D DEPTH CAMERA — SURVIVAL GAME EDITION V-2 (EL ESPEJO MALDITO)
// ═══════════════════════════════════════════════════════════════════

// ── Config ──────────────────────────────────────────────────────────
const MAX_POINTS = 100000; 
let DEPTH_SCALE  = 2.5;

// ── Three.js State ──────────────────────────────────────────────────
let camera3d, scene, renderer, pointCloud, geometry, material;
let videoEl, processingCanvas, processingCtx;
let depthModel = null;
let isEstimating = false;
let enemyMesh; // La Entidad Asesina

// ── Game State ───────────────────────────────────────────────────────
let gameState = 'ALIVE'; // ALIVE, POSSESSED, DYING, REBUILDING
let timeSurvived = 0;
let deathTimer = 10;     
let possessionTimer = 0;
let lastUpdate = performance.now();
let velArray = new Float32Array(MAX_POINTS * 3); 

// ── UI Elements ──────────────────────────────────────────────────────
const timeValEl = document.getElementById('time-val');
const stateUIEl = document.getElementById('game-state-ui');
const glitchEl  = document.getElementById('glitch-overlay');
const dotEl     = document.getElementById('rec-dot');

function getNewDeathTime() {
    return Math.random() * 15 + 10; // 10 a 25 segundos
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
  scene.fog = new THREE.FogExp2(0x000000, 0.15); 

  camera3d = new THREE.PerspectiveCamera(60, wrapper.clientWidth / wrapper.clientHeight, 0.1, 100);
  camera3d.position.set(0, 0, 3); 

  geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_POINTS * 3);
  const colors    = new Float32Array(MAX_POINTS * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

  const canvas2d = document.createElement('canvas');
  canvas2d.width = 32; canvas2d.height = 32;
  const ctx2d = canvas2d.getContext('2d');
  const gradient = ctx2d.createRadialGradient(16,16,0, 16,16,16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0,0,32,32);
  
  material = new THREE.PointsMaterial({
    size: 0.05, 
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    map: new THREE.CanvasTexture(canvas2d),
    alphaTest: 0.02,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });

  pointCloud = new THREE.Points(geometry, material);
  scene.add(pointCloud);

  // ENTIDAD ASESINA (Esfera de plasma rojo brillante que aparece al azar)
  const eGeo = new THREE.IcosahedronGeometry(0.8, 2);
  const eMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.9 });
  enemyMesh = new THREE.Mesh(eGeo, eMat);
  enemyMesh.visible = false;
  scene.add(enemyMesh);

  window.addEventListener('resize', () => {
    renderer.setSize(wrapper.clientWidth, wrapper.clientHeight);
    camera3d.aspect = wrapper.clientWidth / wrapper.clientHeight;
    camera3d.updateProjectionMatrix();
  });
}

// ── PointCloud Math ──────────────────────────────────────────────────
function updateHologramCore(depthData, imgData, width, height) {
  // Si estamos muriendo o poseídos, NO LEEMOS DE LA CÁMARA (El espejo se congela y actúa por su cuenta)
  if (gameState === 'POSSESSED' || gameState === 'DYING') return;

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
      
      col[idx*3]   = Math.min(1.0, (imgData[i*4]   / 255) * 1.5);
      col[idx*3+1] = Math.min(1.0, (imgData[i*4+1] / 255) * 1.5);
      col[idx*3+2] = Math.min(1.0, (imgData[i*4+2] / 255) * 1.5);

      if (gameState === 'ALIVE') {
          pos[idx*3]   = targetX;
          pos[idx*3+1] = targetY;
          pos[idx*3+2] = targetZ;
      } 
      else if (gameState === 'REBUILDING') {
          // Lerp reconstrucción visual magnética
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
function triggerPossession() {
    // 1. El holograma congela sus puntos (se rechaza leer updateHologramCore)
    gameState = 'POSSESSED';
    possessionTimer = 0;
    
    stateUIEl.className = 'state-dead';
    stateUIEl.textContent = 'ANOMALÍA DETECTADA...';
    dotEl.style.background = '#ff8800';

    // Hacer que el reflejo congele y cambie de color a un todo azul espectral
    const col = geometry.attributes.color.array;
    for(let i=0; i<MAX_POINTS*3; i+=3) {
      col[i] *= 0.3; // R
      col[i+1] *= 0.5; // G
      col[i+2] = 1.0; // B al máximo
    }
    geometry.attributes.color.needsUpdate = true;
}

function triggerDeath() {
    gameState = 'DYING';
    stateUIEl.textContent = 'ASESINADO POR LA ENTIDAD';
    dotEl.style.background = '#ff003c';
    glitchEl.style.opacity = '1';

    // El impacto despide todas las partículas violentamente
    for(let i=0; i<MAX_POINTS*3; i+=3) {
       velArray[i]   = (Math.random() - 0.5) * 0.4;
       velArray[i+1] = (Math.random() - 0.2) * 0.7; 
       velArray[i+2] = (Math.random() - 0.5) * 0.4;
    }

    setTimeout(() => { glitchEl.style.opacity = '0.3'; }, 100);
    setTimeout(() => { glitchEl.style.opacity = '0.8'; }, 300);
    setTimeout(() => { glitchEl.style.opacity = '0'; }, 600);

    setTimeout(() => {
        gameState = 'REBUILDING';
        pointCloud.rotation.set(0,0,0); // Reiniciar rotación
        stateUIEl.className = 'state-build';
        stateUIEl.textContent = 'RESUSCITANDO HOLOGRAMA...';
        dotEl.style.background = '#ffff00';
        
        setTimeout(() => {
            gameState = 'ALIVE';
            stateUIEl.className = 'state-alive';
            stateUIEl.textContent = 'ESPEJO ESTABLE';
            dotEl.style.background = '#00f5ff';
            deathTimer = getNewDeathTime(); 
        }, 4000); 
    }, Math.random() * 2000 + 3000); 
}

function updateGame() {
    const now = performance.now();
    const dt = Math.min((now - lastUpdate) / 1000, 0.1);
    lastUpdate = now;

    if (gameState === 'ALIVE') {
        timeSurvived += dt;
        timeValEl.textContent = timeSurvived.toFixed(1) + 's';
        
        deathTimer -= dt;
        if (deathTimer <= 0) {
            triggerPossession();
        }
    } 
    else if (gameState === 'POSSESSED') {
        possessionTimer += dt;
        
        // El holograma congelado cobra vida y gira la cabeza lentamente hacia ti independientemente
        pointCloud.rotation.z = Math.sin(possessionTimer * 2) * 0.1;
        pointCloud.rotation.y = Math.sin(possessionTimer * 1.5) * 0.2;
        pointCloud.position.z += 0.5 * dt; // Se acerca lentamente hacia el jugador

        // Glitches aleatorios en la malla
        if (Math.random() > 0.8) {
           const pos = geometry.attributes.position.array;
           const idx = Math.floor(Math.random() * MAX_POINTS) * 3;
           pos[idx] += (Math.random()-0.5)*0.5;
           geometry.attributes.position.needsUpdate = true;
        }

        // A los 2.5 segundos, LA ENTIDAD aparece al fondo y ataca
        if (possessionTimer > 2.5 && !enemyMesh.visible) {
           enemyMesh.visible = true;
           enemyMesh.position.set((Math.random()-0.5)*4, 1, -12); // Nace al fondo
           enemyMesh.scale.set(1,1,1);
        }

        if (enemyMesh.visible) {
           // La entidad rota y rushea
           enemyMesh.rotation.x += 10 * dt;
           enemyMesh.rotation.y += 15 * dt;
           enemyMesh.scale.addScalar(5 * dt); // Crece como pesadilla
           enemyMesh.position.z += 25 * dt; // Muy veloz

           // Impacto (cuando la esfera cruza la camara/holograma)
           if (enemyMesh.position.z > -1) {
               enemyMesh.visible = false;
               pointCloud.position.z = 0; // reset
               triggerDeath();
           }
        }
    }
    else if (gameState === 'DYING') {
        // Ejecutar las físicas de caída
        const pos = geometry.attributes.position.array;
        const col = geometry.attributes.color.array;
        for(let idx=0; idx<geometry.drawRange.count; idx++) {
            pos[idx*3]   += velArray[idx*3];
            pos[idx*3+1] += velArray[idx*3+1];
            pos[idx*3+2] += velArray[idx*3+2];
            velArray[idx*3+1] -= 0.02; // Fuerza de gravedad
            
            // Tintar de rojo sangre en muerte
            col[idx*3] = 1.0; col[idx*3+1] *= 0.9; col[idx*3+2] *= 0.9;
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
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

function luminanceDepth(imgData, w, h) {
  const out = new Float32Array(w * h);
  for(let i=0; i<w*h; i++) {
    out[i] = 0.299*(imgData[i*4]/255) + 0.587*(imgData[i*4+1]/255) + 0.114*(imgData[i*4+2]/255);
  }
  return out;
}

function renderLoop() {
  requestAnimationFrame(renderLoop);
  
  updateGame(); 

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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
