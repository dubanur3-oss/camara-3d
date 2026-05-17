import os
import re

file_path = "C:/Users/loomb/OneDrive/Desktop/PointcloudApp/index.html"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace Material to include Glow Texture (TikTok LiDAR style)
material_target_regex = r"material = new THREE\.PointsMaterial\(\{.*?\}\);"
material_new = '''const canvas2d = document.createElement('canvas');
  canvas2d.width = 32; canvas2d.height = 32;
  const ctx2d = canvas2d.getContext('2d');
  const gradient = ctx2d.createRadialGradient(16,16,0, 16,16,16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0,0,32,32);
  const glowTex = new THREE.CanvasTexture(canvas2d);

  material = new THREE.PointsMaterial({
    size: POINT_SIZE * 0.02,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    map: glowTex,
    alphaTest: 0.05,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });'''
content = re.sub(material_target_regex, material_new, content, flags=re.DOTALL)

# 2. Fix updatePointCloud Projection Math (Solve the inside-out distortion)
update_regex = r"function updatePointCloud\(depthData, imgData, width, height\) \{.*?ptsVal\.textContent = maxPointsDrawn\.toLocaleString\(\);\s*\}"

update_new_logic = '''function updatePointCloud(depthData, imgData, width, height) {
  if (!isMapping) return;
  const pos  = geometry.attributes.position.array;
  const col  = geometry.attributes.color.array;
  
  const sampleRate = Math.max(1, Math.floor(width * height / 3500)); 
  const aspect = width / height;

  for (let i = 0; i < depthData.length; i += sampleRate) {
      const depth = depthData[i]; 
      
      // Ignorar puntos de error o bordes lejanos
      if (depth < 0.05 || depth > 0.98) continue; 

      const x = i % width;
      const y = Math.floor(i / width);
      
      const nx = (x / width  - 0.5) * 2 * aspect;
      const ny = -(y / height - 0.5) * 2; // Y inverted for WebGL and real world match
      
      // MiDaS outputs disparity (higher=closer). Convert to pseudo-distance metric.
      const invDepth = 1.0 - depth;
      // Escalar la distancia de acuerdo al slider del usuario
      const distance = (invDepth * DEPTH_SCALE * 3.0) + 1.2; 
      
      // Proyección fustrum real geométrica: x = nx * z, y = ny * z
      const v = new THREE.Vector3(nx * distance * 0.65, ny * distance * 0.65, -distance);
      
      // Acumulación anclada al mundo real rotado por GYROSCOPIO
      v.applyQuaternion(mapQuat);

      const idx = globalIdx % MAX_POINTS;

      pos[idx*3]   = v.x;
      pos[idx*3+1] = v.y;
      pos[idx*3+2] = v.z;

      depthToColor(depth, _r, _g, _b);
      
      // Potenciar el brillo del RGB original para dar aspecto LiDAR láser
      if (PALETTE === 'real' && imgData) {
         col[idx*3]   = Math.min(1.0, (imgData[i*4] / 255) * 1.5);
         col[idx*3+1] = Math.min(1.0, (imgData[i*4+1] / 255) * 1.5);
         col[idx*3+2] = Math.min(1.0, (imgData[i*4+2] / 255) * 1.5);
      } else {
         col[idx*3]   = _r[0];
         col[idx*3+1] = _g[0];
         col[idx*3+2] = _b[0];
      }
      globalIdx++;
      if (maxPointsDrawn < MAX_POINTS) maxPointsDrawn++;
  }

  geometry.setDrawRange(0, maxPointsDrawn);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate    = true;
  ptsVal.textContent = maxPointsDrawn.toLocaleString();
}'''
content = re.sub(update_regex, update_new_logic, content, flags=re.DOTALL)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch LiDAR Pro applied.")
