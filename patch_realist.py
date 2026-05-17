import os
import re

file_path = "C:/Users/loomb/OneDrive/Desktop/PointcloudApp/index.html"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add "Color Real (RGB)" to palette and make it default
palette_target = '<option value="cyan">Cian / Azul</option>'
palette_new = '<option value="real">Color Real (RGB)</option>\n        <option value="cyan">Cian / Azul</option>'
content = content.replace(palette_target, palette_new)
content = content.replace("let PALETTE     = 'cyan';", "let PALETTE     = 'real';")

# 2. Add isEstimating var
content = content.replace("let isMapping = true;", "let isMapping = true;\nlet isEstimating = false;")

# 3. Fix RenderLoop: Pass processingCanvas to estimateDepth to ensure 160x120 matching with imgData, and enable real AI depth.
loop_regex = r"if \(videoEl && videoEl\.readyState >= 2\) \{.*?updatePointCloud\(depth, 160, 120\);\s*\}"
loop_new = '''if (videoEl && videoEl.readyState >= 2 && !isEstimating) {
    processingCtx.drawImage(videoEl, 0, 0, 160, 120);
    const imgData = processingCtx.getImageData(0, 0, 160, 120);
    
    if (depthModel) {
        isEstimating = true;
        depthModel.estimateDepth(processingCanvas).then(depthMap => {
            const tfTensor = depthMap.toTensor();
            const depthArray = tfTensor.dataSync();
            updatePointCloud(depthArray, imgData.data, 160, 120);
            tfTensor.dispose();
            isEstimating = false;
        }).catch(e => {
            console.error(e);
            isEstimating = false;
        });
    } else {
        const depth = luminanceDepth(imgData.data, 160, 120);
        updatePointCloud(depth, imgData.data, 160, 120);
    }
  }'''
content = re.sub(loop_regex, loop_new, content, flags=re.DOTALL)

# 4. Modify updatePointCloud signature and color logic
update_regex = r"function updatePointCloud\(depthData, width, height\) \{.*?col\[idx\*3\+2\]\s*=\s*_b\[0\];"
update_new_logic = '''function updatePointCloud(depthData, imgData, width, height) {
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
      
      if (PALETTE === 'real' && imgData) {
         col[idx*3]   = imgData[i*4] / 255;
         col[idx*3+1] = imgData[i*4+1] / 255;
         col[idx*3+2] = imgData[i*4+2] / 255;
      } else {
         col[idx*3]   = _r[0];
         col[idx*3+1] = _g[0];
         col[idx*3+2] = _b[0];
      }'''
content = re.sub(update_regex, update_new_logic, content, flags=re.DOTALL)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch 3 Realista applied.")
