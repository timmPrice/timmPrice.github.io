// ASCII boids background for the home page.
// Reynolds flocking (separation / alignment / cohesion). Each boid is a single
// ASCII head (> < ^ v) in its own grid cell. Every boid also splats into
// a density field on the character grid: lone boids leave a faint halo, tight
// flocks build up dense ASCII clusters (RAMP) and a blurred glow underneath.
// Colour follows heading, blended across --sim-a/b/c. Text blocks on the page are
// obstacles the flock steers around, and the cursor scatters it. Sizes are in css
// px, so it behaves the same on phones.
(function () {
    // --- look ---
    const FONT_PX = 17;
    const LINE_PX = 20;
    const HEADS = { e: ">", w: "<", n: "^", s: "v" };   // boid glyph by dominant direction
    const RAMP = " .:-=+*#%@";           // cluster density, light -> heavy
    const SPLAT_R = 105;                 // css px each boid contributes density within (blob size)
    const FIELD_LO = 0.35, FIELD_HI = 6; // density where glyphs start / reach the heaviest
    const GLOW_LO = 1.2, GLOW_HI = 7;    // density where the glow starts / saturates (clusters only)
    const PALETTE_STEPS = 24;            // colour gradient resolution around the compass

    // --- flock ---
    const FPS = 30;
    const DENSITY = 1 / 11000;           // boids per css px^2
    const MIN_BOIDS = 30, MAX_BOIDS = 140;
    const MIN_SPEED = 40, MAX_SPEED = 85; // css px / s
    const SEP_R = 28, ALIGN_R = 90, COH_R = 150;
    const SEP_W = 1.6, ALIGN_W = 1.0, COH_W = 1.1;
    const MAX_FORCE = 150;               // css px / s^2
    const CENTER_W = 0.25;               // gentle pull toward the middle of the screen (0 = off)
    const WARMUP_S = 15;                 // simulate this long before the first frame

    // --- obstacles ---
    const AVOID = "nav li, main img, main h1, main h3, main .social, main p, footer p";
    const AVOID_MARGIN = 34;             // css px around text where boids get pushed
    const AVOID_W = 5;
    const HIDE_PAD = 14;                 // never draw glyphs over text (+ this padding)
    const CURSOR_R = 110, CURSOR_W = 6;

    function parseColor(str) {
        const s = str.trim();
        if (s.startsWith("#")) {
            const h = s.length === 4 ? s.slice(1).split("").map(c => c + c).join("") : s.slice(1, 7);
            return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
        }
        const m = s.match(/[\d.]+/g);
        return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
    }

    const smooth = (a, b, x) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    };

    function start() {
        // glow layer (tiny, upscaled + CSS-blurred) under the glyph layer
        const glowCanvas = document.createElement("canvas");
        glowCanvas.className = "sim-glow";
        const canvas = document.createElement("canvas");
        canvas.className = "sim";
        for (const c of [glowCanvas, canvas]) c.setAttribute("aria-hidden", "true");
        document.body.prepend(glowCanvas, canvas);
        const ctx = canvas.getContext("2d");
        const gctx = glowCanvas.getContext("2d");

        let vw = 0, vh = 0, cw = 0, cols = 0, rows = 0, dpr = 1;
        let rects = [], palette = [], paletteRgb = [], boids = [];
        let hidden = null, field = null, fr = null, fg = null, fb = null, glowImg = null;
        const cursor = { x: -1e4, y: -1e4 };

        // palette: a loop a -> b -> c -> a, indexed by heading
        function readColors() {
            const cs = getComputedStyle(document.documentElement);
            const stops = ["--sim-a", "--sim-b", "--sim-c"].map(v => parseColor(cs.getPropertyValue(v)));
            palette = []; paletteRgb = [];
            for (let i = 0; i < PALETTE_STEPS; i++) {
                const p = (i / PALETTE_STEPS) * 3, j = Math.floor(p), f = p - j;
                const c0 = stops[j % 3], c1 = stops[(j + 1) % 3];
                const rgb = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
                paletteRgb.push(rgb);
                palette.push(`rgb(${rgb.join(",")})`);
            }
        }

        function readObstacles() {
            rects = [...document.querySelectorAll(AVOID)]
                .map(el => el.getBoundingClientRect())
                .filter(r => r.width && r.height && r.bottom > -200 && r.top < vh + 200)
                .map(r => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
            hidden = new Uint8Array(cols * rows);
            for (const r of rects) {
                const x0 = Math.max(0, Math.floor((r.l - HIDE_PAD) / cw)), x1 = Math.min(cols - 1, Math.floor((r.r + HIDE_PAD) / cw));
                const y0 = Math.max(0, Math.floor((r.t - HIDE_PAD) / LINE_PX)), y1 = Math.min(rows - 1, Math.floor((r.b + HIDE_PAD) / LINE_PX));
                for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) hidden[y * cols + x] = 1;
            }
        }

        function spawn(n) {
            while (boids.length < n) {
                const a = Math.random() * Math.PI * 2, s = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
                boids.push({ x: Math.random() * vw, y: Math.random() * vh, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
            }
            boids.length = n;
        }

        function resize() {
            dpr = window.devicePixelRatio || 1;
            vw = window.innerWidth;
            vh = window.innerHeight;
            canvas.width = Math.round(vw * dpr);
            canvas.height = Math.round(vh * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.font = `${FONT_PX}px "JetBrains Mono", monospace`;
            ctx.textBaseline = "top";
            cw = ctx.measureText("M").width || FONT_PX * 0.6;
            cols = Math.ceil(vw / cw);
            rows = Math.ceil(vh / LINE_PX);
            glowCanvas.width = cols;
            glowCanvas.height = rows;
            glowImg = gctx.createImageData(cols, rows);
            field = new Float32Array(cols * rows);
            fr = new Float32Array(cols * rows); fg = new Float32Array(cols * rows); fb = new Float32Array(cols * rows);
            readObstacles();
            spawn(Math.round(Math.min(MAX_BOIDS, Math.max(MIN_BOIDS, vw * vh * DENSITY))));
        }

        function limit(x, y, max) {
            const m = Math.hypot(x, y);
            return m > max ? [x / m * max, y / m * max] : [x, y];
        }

        function step(dt) {
            for (const b of boids) {
                let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, na = 0, nc = 0;
                for (const o of boids) {
                    if (o === b) continue;
                    let dx = o.x - b.x, dy = o.y - b.y;
                    // neighbours across the wrapped edges
                    if (dx > vw / 2) dx -= vw; else if (dx < -vw / 2) dx += vw;
                    if (dy > vh / 2) dy -= vh; else if (dy < -vh / 2) dy += vh;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < SEP_R * SEP_R && d2 > 0) { sx -= dx / d2; sy -= dy / d2; }
                    if (d2 < ALIGN_R * ALIGN_R) { ax += o.vx; ay += o.vy; na++; }
                    if (d2 < COH_R * COH_R) { cx += dx; cy += dy; nc++; }
                }
                // Reynolds steering: desired velocity (at full speed) minus current velocity
                let fx = 0, fy = 0;
                const steer = (dx, dy, w) => {
                    const m = Math.hypot(dx, dy);
                    if (!m) return;
                    const [x, y] = limit(dx / m * MAX_SPEED - b.vx, dy / m * MAX_SPEED - b.vy, MAX_FORCE);
                    fx += x * w; fy += y * w;
                };
                if (sx || sy) steer(sx, sy, SEP_W);
                if (na) steer(ax / na, ay / na, ALIGN_W);
                if (nc) steer(cx / nc, cy / nc, COH_W);

                // slow drift toward the screen centre, stronger the further out a boid is
                {
                    const dx = vw / 2 - b.x, dy = vh / 2 - b.y;
                    const k = Math.min(1, Math.hypot(dx / (vw / 2), dy / (vh / 2)));
                    if (k > 0.05) steer(dx, dy, CENTER_W * k);
                }

                // obstacles: push away from the nearest point of each nearby text block
                for (const r of rects) {
                    const nx = Math.min(Math.max(b.x, r.l), r.r), ny = Math.min(Math.max(b.y, r.t), r.b);
                    let dx = b.x - nx, dy = b.y - ny, d = Math.hypot(dx, dy);
                    if (d >= AVOID_MARGIN) continue;
                    if (d === 0) {                         // inside: shove toward the nearest edge
                        const e = [b.x - r.l, r.r - b.x, b.y - r.t, r.b - b.y], i = e.indexOf(Math.min(...e));
                        dx = [-1, 1, 0, 0][i]; dy = [0, 0, -1, 1][i]; d = 1;
                    }
                    const k = (1 - d / AVOID_MARGIN) * MAX_FORCE * AVOID_W;
                    fx += dx / d * k; fy += dy / d * k;
                }

                // cursor
                const cdx = b.x - cursor.x, cdy = b.y - cursor.y, cd = Math.hypot(cdx, cdy);
                if (cd < CURSOR_R && cd > 0) {
                    const k = (1 - cd / CURSOR_R) * MAX_FORCE * CURSOR_W;
                    fx += cdx / cd * k; fy += cdy / cd * k;
                }

                b.vx += fx * dt; b.vy += fy * dt;
                const s = Math.hypot(b.vx, b.vy) || 1;
                const ns = Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));
                b.vx = b.vx / s * ns; b.vy = b.vy / s * ns;
                b.x = (b.x + b.vx * dt + vw) % vw;
                b.y = (b.y + b.vy * dt + vh) % vh;
            }
        }

        const headingIndex = b => {
            const a = (Math.atan2(b.vy, b.vx) + Math.PI * 2) % (Math.PI * 2);
            return Math.floor(a / (Math.PI * 2) * PALETTE_STEPS) % PALETTE_STEPS;
        };

        // splat every boid into the density field (with its heading colour)
        function buildField() {
            field.fill(0); fr.fill(0); fg.fill(0); fb.fill(0);
            const rx = Math.ceil(SPLAT_R / cw), ry = Math.ceil(SPLAT_R / LINE_PX), R2 = SPLAT_R * SPLAT_R;
            for (const b of boids) {
                const col = paletteRgb[headingIndex(b)];
                const bx = Math.floor(b.x / cw), by = Math.floor(b.y / LINE_PX);
                for (let oy = -ry; oy <= ry; oy++) {
                    const y = by + oy;
                    if (y < 0 || y >= rows) continue;
                    const dy = (y + 0.5) * LINE_PX - b.y;
                    for (let ox = -rx; ox <= rx; ox++) {
                        const x = bx + ox;
                        if (x < 0 || x >= cols) continue;
                        const dx = (x + 0.5) * cw - b.x, d2 = dx * dx + dy * dy;
                        if (d2 >= R2) continue;
                        const k = (1 - d2 / R2) ** 2, i = y * cols + x;
                        field[i] += k; fr[i] += col[0] * k; fg[i] += col[1] * k; fb[i] += col[2] * k;
                    }
                }
            }
        }

        function draw() {
            buildField();
            ctx.clearRect(0, 0, vw, vh);

            // boids claim their grid cell; the cluster glyph there is replaced, not overdrawn
            const heads = new Map();
            for (const b of boids) {
                const x = Math.floor(b.x / cw), y = Math.floor(b.y / LINE_PX);
                if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
                const i = y * cols + x;
                if (hidden[i] || heads.has(i)) continue;
                const ch = Math.abs(b.vx) >= Math.abs(b.vy) ? (b.vx > 0 ? HEADS.e : HEADS.w) : (b.vy > 0 ? HEADS.s : HEADS.n);
                heads.set(i, [ch, palette[headingIndex(b)]]);
            }

            // glow layer + cluster glyphs (bucketed by quantised colour + level)
            const g = glowImg.data;
            const buckets = new Map();
            for (let i = 0; i < field.length; i++) {
                const f = field[i];
                if (f < FIELD_LO * 0.5 || hidden[i]) { g[i * 4 + 3] = 0; continue; }
                const r = fr[i] / f, gg = fg[i] / f, b = fb[i] / f;
                g[i * 4] = r; g[i * 4 + 1] = gg; g[i * 4 + 2] = b;
                g[i * 4 + 3] = 255 * smooth(GLOW_LO, GLOW_HI, f);

                if (heads.has(i)) continue;
                const lvl = Math.round(smooth(FIELD_LO, FIELD_HI, f) * (RAMP.length - 1));
                if (lvl <= 0) continue;
                const q = v => Math.min(255, Math.round(v / 16) * 16);
                const key = ((q(r) << 16) | (q(gg) << 8) | q(b)) * 16 + lvl;
                let list = buckets.get(key);
                if (!list) buckets.set(key, list = []);
                list.push(i);
            }
            gctx.putImageData(glowImg, 0, 0);

            for (const [key, list] of buckets) {
                const rgb = Math.floor(key / 16), lvl = key % 16;
                ctx.fillStyle = `rgb(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255})`;
                ctx.globalAlpha = 0.2 + 0.5 * (lvl / (RAMP.length - 1));
                const ch = RAMP[lvl];
                for (const i of list) ctx.fillText(ch, (i % cols) * cw, Math.floor(i / cols) * LINE_PX);
            }

            // boid heads, in their own grid cells
            ctx.globalAlpha = 1;
            for (const [i, [ch, col]] of heads) {
                ctx.fillStyle = col;
                ctx.fillText(ch, (i % cols) * cw, Math.floor(i / cols) * LINE_PX);
            }
        }

        function warmUp(seconds) {
            for (let i = 0; i < seconds * FPS; i++) step(1 / FPS);
            draw();
        }

        readColors();
        resize();
        warmUp(WARMUP_S);

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const still = () => warmUp(0);

        // resize() keeps the existing flock; it only rebuilds the grid and tops up / trims the count
        window.addEventListener("resize", () => { resize(); if (reduceMotion) still(); });
        window.addEventListener("scroll", () => { readObstacles(); if (reduceMotion) still(); }, { passive: true });
        window.addEventListener("load", () => { readObstacles(); if (reduceMotion) still(); });
        // glyph width changes once JetBrains Mono loads
        if (document.fonts) document.fonts.ready.then(() => { resize(); if (reduceMotion) still(); });
        window.addEventListener("pointermove", e => { cursor.x = e.clientX; cursor.y = e.clientY; }, { passive: true });
        document.addEventListener("pointerleave", () => { cursor.x = cursor.y = -1e4; });
        new MutationObserver(() => { readColors(); if (reduceMotion) still(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

        if (reduceMotion) return;

        let last = 0, raf = 0;
        function frame(ts) {
            raf = requestAnimationFrame(frame);
            if (ts - last < 1000 / FPS) return;
            const dt = Math.min(0.05, last ? (ts - last) / 1000 : 1 / FPS);
            last = ts;
            step(dt);
            draw();
        }
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) cancelAnimationFrame(raf);
            else { last = 0; raf = requestAnimationFrame(frame); }
        });
        raf = requestAnimationFrame(frame);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
