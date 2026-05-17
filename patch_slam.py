import os
import re

file_path = "C:/Users/loomb/OneDrive/Desktop/PointcloudApp/index.html"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# UI Buttons
ui_target = '<button class="btn primary" id="btn-capture">📷 CAPTURAR</button>\n      <button class="btn" id="btn-reset">↺ RESET</button>'
ui_replacement = '''<button class="btn primary" id="btn-capture">📷 CAPTURAR</button>
      <button class="btn" id="btn-save-map" style="background:rgba(0,245,255,0.4)">💾 GUARDAR</button>
      <button class="btn" id="btn-load-map">📂 CARGAR</button>
      <button class="btn" id="btn-clear-map">🗑 LIMPIAR</button>
      <button class="btn" id="btn-reset">↺ CENTRAR CÁMARA</button>'''
content = content.replace(ui_target, ui_replacement)

# Limits
content = content.replace("let MAX_POINTS  = 20000;", "let MAX_POINTS = 400000; // expanded limit")

# State
content = content.replace("let isRunning   = true;", "let isRunning   = true;\n// SLAM State\nlet globalIdx = 0;\nlet mapQuat = new THREE.Quaternion();\nlet isMapping = true;")

# Input
content = content.replace("function setupInput() {", "function setupInput() {\n  window.addEventListener('deviceorientation', e => {\n     if(!e.alpha) return;\n     const alpha = e.alpha ? THREE.MathUtils.degToRad(e.alpha) : 0;\n     const beta  = e.beta  ? THREE.MathUtils.degToRad(e.beta)  : 0;\n     const gamma = e.gamma ? THREE.MathUtils.degToRad(e.gamma) : 0;\n     const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');\n     mapQuat.setFromEuler(euler);\n  });\n")

# Logic replacement
update_target_regex = r"function updatePointCloud\(depthData, width, height\)\s*\{.*?ptsVal\.textContent = idx\.toLocaleString\(\);\s*\}"

update_new = '''function updatePointCloud(depthData, width, height) {
  if (!isMapping) return;
  const pos  = geometry.attributes.position.array;
  const col  = geometry.attributes.color.array;
  
  // Muestreo dinámico para no trabar celulares
  const sampleRate = Math.max(1, Math.floor(width * height / 3000)); 
  const aspect = width / height;

  let added = 0;
  for (let i = 0; i < depthData.length; i += sampleRate) {
      if (globalIdx >= MAX_POINTS) {
         isMapping = false;
         statusText.textContent = "🗺️ MAPA LLENO. EXPANDE EL LIMITE.";
         break;
      }

      const depth = depthData[i]; 
      if (depth < 0.05) continue; // Fondo lejano

      const x = i % width;
      const y = Math.floor(i / width);
      // Coordenadas locales
      const nx = (x / width  - 0.5) * 2 * aspect;
      const ny = (y / height - 0.5) * -2;
      const nz = (depth - 0.5) * DEPTH_SCALE;
      
      const v = new THREE.Vector3(nx * 2, ny * 2, nz);
      // Acumulación inercial en el mundo
      v.applyQuaternion(mapQuat);

      pos[globalIdx*3]   = v.x;
      pos[globalIdx*3+1] = v.y;
      pos[globalIdx*3+2] = v.z;

      depthToColor(depth, _r, _g, _b);
      col[globalIdx*3]   = _r[0];
      col[globalIdx*3+1] = _g[0];
      col[globalIdx*3+2] = _b[0];

      globalIdx++;
      added++;
  }

  geometry.setDrawRange(0, globalIdx);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate    = true;
  ptsVal.textContent = globalIdx.toLocaleString();
}'''

content = re.sub(update_target_regex, update_new, content, flags=re.DOTALL)

# Add listeners
listener_target = "document.getElementById('btn-reset').addEventListener('click', () => {"
listener_new = '''  const DB_NAME = '3DCameraMapDB';
  document.getElementById('btn-clear-map').addEventListener('click', () => {
     globalIdx = 0;
     isMapping = true;
     geometry.setDrawRange(0, 0);
     ptsVal.textContent = "0";
  });
  document.getElementById('btn-save-map').addEventListener('click', () => {
    statusText.textContent = "GUARDANDO EN TELÉFONO...";
    const pos = new Float32Array(geometry.attributes.position.array.buffer).slice(0, globalIdx * 3);
    const col = new Float32Array(geometry.attributes.color.array.buffer).slice(0, globalIdx * 3);
    const data = { id: 1, pos, col, count: globalIdx };
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = e => e.target.result.createObjectStore('maps', { keyPath: 'id' });
    request.onsuccess = e => {
      const db = e.target.result;
      const tx = db.transaction('maps', 'readwrite');
      tx.objectStore('maps').put(data);
      tx.oncomplete = () => statusText.textContent = "✅ MAPA EN DISPOSITIVO";
    };
  });
  document.getElementById('btn-load-map').addEventListener('click', () => {
    statusText.textContent = "CARGANDO MAPA...";
    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('maps')) { statusText.textContent = "❌ NO HAY MAPA"; return; }
      const tx = db.transaction('maps', 'readonly');
      const getReq = tx.objectStore('maps').get(1);
      getReq.onsuccess = () => {
        if (!getReq.result) { statusText.textContent = "❌ NO HAY MAPA"; return; }
        globalIdx = getReq.result.count;
        geometry.attributes.position.array.set(getReq.result.pos);
        geometry.attributes.color.array.set(getReq.result.col);
        geometry.setDrawRange(0, globalIdx);
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        ptsVal.textContent = globalIdx.toLocaleString();
        statusText.textContent = "✅ MAPA CARGADO";
        isMapping = false; 
      }
    };
  });
  document.getElementById('btn-reset').addEventListener('click', () => {'''
content = content.replace(listener_target, listener_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch applied successfully.")
