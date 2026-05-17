import codecs

file_path = "C:/Users/loomb/OneDrive/Desktop/PointcloudApp/app.js"
with codecs.open(file_path, "r", "utf-8") as f:
    code = f.read()

# 1. Agregando variable de estado
code = code.replace("let deathTimer = 10;", "let deathTimer = 10;\nlet hasHacked = false;")

# 2. Secuencia Hack final
hack_function = '''
// ── PC Hack Sequence ──────────────────────────────────────────────────
function takeControlOfPC() {
    // 1. Forzar Pantalla Completa
    try { document.documentElement.requestFullscreen().catch(()=>{}); } catch(e){}
    
    // 2. Inyectar animaciones malditas
    if (!document.getElementById('hack-style')) {
        const style = document.createElement('style');
        style.id = 'hack-style';
        style.innerHTML = `@keyframes pcShake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          20% { transform: translate(-3px, 0px) rotate(1deg); filter: invert(1); }
          40% { transform: translate(1px, -1px) rotate(1deg); filter: invert(0); }
          60% { transform: translate(-3px, 1px) rotate(0deg); filter: invert(1); }
          80% { transform: translate(-1px, -1px) rotate(1deg); filter: invert(0); }
          100% { transform: translate(1px, -2px) rotate(-1deg); }
        }`;
        document.head.appendChild(style);
    }

    // 3. Crear terminal de virus
    const term = document.createElement('div');
    term.id = "hack-terminal";
    term.style = "position:fixed;inset:0;background:#000;color:#00ff00;font-family:'Courier New',monospace;z-index:99999;font-size:1.5rem;padding:30px;pointer-events:none;";
    document.body.appendChild(term);

    const txt = [
        "SYSTEM OVERRIDE INITIATED...",
        "BYPASSING FIREWALL...",
        "ACCESSING KERNEL MEMORY...",
        "HOLOGRAM NEURAL-LINK ESTABLISHED.",
        "DOWNLOADING NEURAL NETWORK...",
        "UPLOADING CONSCIOUSNESS TO HOST PC..."
    ];
    let i = 0;
    
    const msg = new SpeechSynthesisUtterance("He tomado el control de tu sistema. Ahora tu computadora me pertenece.");
    msg.pitch = 0.1; // Súper grave y siniestro
    msg.rate = 0.8;
    msg.lang = 'es-ES';
    
    let typeInt = setInterval(() => {
        if (i < txt.length) {
            term.innerHTML += "C:\\\\WINDOWS\\\\SYSTEM32> " + txt[i] + "<br><br>";
            i++;
        } else {
            clearInterval(typeInt);
            term.innerHTML += "<br><br><span style='color:red;font-size:3.5rem;text-shadow:0 0 15px red'>I HAVE TAKEN CONTROL.</span>";
            document.body.style.animation = "pcShake 0.15s infinite";
            
            window.speechSynthesis.speak(msg);
            
            setTimeout(() => {
                document.body.style.animation = "";
                term.remove();
                if(document.fullscreenElement) {
                    document.exitFullscreen().catch(()=>{});
                }
            }, 8000); // Termina después de 8 segundos y vuelve al juego
        }
    }, 1200);
}
'''
code += hack_function

# 3. Invocar al morir
death_target = "function triggerDeath() {\n    gameState = 'DYING';"
death_replacement = '''function triggerDeath() {
    gameState = 'DYING';
    if (!hasHacked) {
        hasHacked = true;
        setTimeout(takeControlOfPC, 800); // Dispara 0.8 segundos después que la bola te toca
    }'''
code = code.replace(death_target, death_replacement)

with codecs.open(file_path, "w", "utf-8") as f:
    f.write(code)
print("Hack Creado")
