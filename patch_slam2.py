import os
import re

file_path = "C:/Users/loomb/OneDrive/Desktop/PointcloudApp/index.html"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Ensure ROT_SPEED is 0 by default so the world doesn't spin
content = content.replace("let ROT_SPEED   = 0.003;", "let ROT_SPEED   = 0.0;")

# 2. Add an activePoints variable
content = content.replace("let globalIdx = 0;\nlet mapQuat = new THREE.Quaternion();", "let globalIdx = 0;\nlet maxPointsDrawn = 0;\nlet mapQuat = new THREE.Quaternion();")

# 3. Fix updatePointCloud
update_target_regex = r"function updatePointCloud\(depthData, width, height\)\s*\{.*?ptsVal\.textContent = globalIdx\.toLocaleString\(\);\s*\}"

update_new = '''function updatePointCloud(depthData, width, height) {
  if (!isMapping) return;
  const pos  = geometry.attributes.position.array;
  const col  = geometry.attributes.color.array;
  
  // Aumentar la velocidad de actualización, menos lag
  const sampleRate = Math.max(1, Math.floor(width * height / 3000)); 
  const aspect = width / height;

  for (let i = 0; i < depthData.length; i += sampleRate) {
      const depth = depthData[i]; 
      if (depth < 0.05) continue; // Fondo lejano ignora

      const x = i % width;
      const y = Math.floor(i / width);
      const nx = (x / width  - 0.5) * 2 * aspect;
      const ny = (y / height - 0.5) * -2;
      const nz = (depth - 0.5) * DEPTH_SCALE;
      
      const v = new THREE.Vector3(nx * 2, ny * 2, nz);
      // Trasladar ligeramente al frente para que no colisionen con la cámara
      v.z -= 1.0; 
      
      // Aplicar misma rotación del celular para anclar al mundo real
      v.applyQuaternion(mapQuat);

      const idx = globalIdx % MAX_POINTS; // Búfer circular

      pos[idx*3]   = v.x;
      pos[idx*3+1] = v.y;
      pos[idx*3+2] = v.z;

      depthToColor(depth, _r, _g, _b);
      col[idx*3]   = _r[0];
      col[idx*3+1] = _g[0];
      col[idx*3+2] = _b[0];

      globalIdx++;
      if (maxPointsDrawn < MAX_POINTS) maxPointsDrawn++;
  }

  geometry.setDrawRange(0, maxPointsDrawn);
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate    = true;
  ptsVal.textContent = maxPointsDrawn.toLocaleString();
}'''
content = re.sub(update_target_regex, update_new, content, flags=re.DOTALL)

# 4. In renderLoop, make camera3D use mapQuat
render_target = "pointCloud.rotation.y += ROT_SPEED;"
render_replacement = '''pointCloud.rotation.y += ROT_SPEED;
  // Sincronizar cámara virtual con el celular
  if (isMapping) {
    camera3d.quaternion.slerp(mapQuat, 0.4); 
  }'''
content = content.replace(render_target, render_replacement)

# 5. Fix DeviceOrientation (some phones provide negative values or wrong axes)
# For simplicity, we just keep the math we had. It's usually fine for YXZ.
# Let's ensure the old 'isMapping = false' logic from IDB reflects correctly.
# IDB loading should set maxPointsDrawn too.
idb_target = "globalIdx = getReq.result.count;"
idb_replacement = "globalIdx = getReq.result.count;\n        maxPointsDrawn = globalIdx;"
content = content.replace(idb_target, idb_replacement)

# Reset button logic
reset_target = "geometry.setDrawRange(0, 0);"
reset_replacement = "geometry.setDrawRange(0, 0);\n     maxPointsDrawn = 0;"
content = content.replace(reset_target, reset_replacement)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch 2 applied.")
