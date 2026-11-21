// Entrada: teclado + mouse (pointer lock) e controles de toque (joystick virtual e botões).
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { dx: 0, dy: 0, down: false, clicked: false, rdown: false };
    this.canvas = canvas; this.locked = false; this.touch = { move: [0, 0], look: [0, 0], active: false };
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) this.mouse.rdown = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.rdown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // sem pointer lock (ex.: página dentro de moldura), arrastar com o mouse também gira a câmera
    // Filtro de "flicks": o Chrome às vezes entrega um movementX/Y gigante (primeiro evento após
    // capturar o mouse, troca de janela, queda de FPS). Esses picos viravam giros bruscos da câmera.
    addEventListener('mousemove', (e) => {
      if (!(this.locked || (e.buttons && e.target === canvas))) return;
      if (performance.now() < this.ignorarAte) return;
      let mx = e.movementX || 0, my = e.movementY || 0;
      if (Math.abs(mx) > 250 || Math.abs(my) > 250) return; // pico falso: descarta
      mx = Math.max(-90, Math.min(90, mx)); my = Math.max(-90, Math.min(90, my));
      this.mouse.dx += mx; this.mouse.dy += my;
    });
    this.ignorarAte = 0;
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; this.ignorarAte = performance.now() + 120; this.mouse.dx = 0; this.mouse.dy = 0; });
    canvas.addEventListener('wheel', (e) => { this.wheel = (this.wheel || 0) + Math.sign(e.deltaY); }, { passive: true });
    this.setupTouch();
  }
  lock() { if (!this.locked && this.canvas.requestPointerLock) { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignorado */ } } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(c) { return this.enabled && this.keys.has(c); }
  hit(c) { return this.enabled && this.pressed.has(c); }
  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.clicked = false; this.wheel = 0; this.touch.look = [0, 0]; }
  press(code) { this.pressed.add(code); }

  setupTouch() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return;
    this.touch.active = true;
    const ui = document.getElementById('toque');
    if (!ui) return;
    ui.hidden = false;
    const stick = document.getElementById('stick'), knob = document.getElementById('stick-k');
    let sid = null, sc = [0, 0];
    stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sid = t.identifier; const r = stick.getBoundingClientRect(); sc = [r.left + r.width / 2, r.top + r.height / 2]; e.preventDefault(); }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === sid) {
          let dx = (t.clientX - sc[0]) / 50, dy = (t.clientY - sc[1]) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          this.touch.move = [dx, -dy]; knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
        } else if (t.identifier === this.lookId) {
          this.touch.look[0] += (t.clientX - this.lookLast[0]) * 2.5; this.touch.look[1] += (t.clientY - this.lookLast[1]) * 2.5; this.lookLast = [t.clientX, t.clientY];
        }
      }
    }, { passive: true });
    addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === sid) { sid = null; this.touch.move = [0, 0]; knob.style.transform = ''; } if (t.identifier === this.lookId) this.lookId = null; } });
    this.canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; this.lookId = t.identifier; this.lookLast = [t.clientX, t.clientY]; }, { passive: true });
    for (const b of document.querySelectorAll('[data-key]')) {
      const code = b.dataset.key;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys.add(code); this.pressed.add(code); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); this.keys.delete(code); }, { passive: false });
    }
  }
}
