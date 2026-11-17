// ASCII "energy blob" background for the home page.
// Drifting metaballs, drawn as a grid of monospace characters: the denser the
// field, the heavier the glyph (RAMP). Sizes are in css px so blobs keep their
// shape on any screen, and the field fades out around live text/image bounds so
// copy stays readable. Colours: --blob-a/b/c on the current theme.
(function () {
    const FONT_PX = 14;               // glyph size
    const LINE_PX = 16;               // row height
    const FPS = 20;
    const RAMP = " .:-=+*#%@";        // light -> heavy
    const CLEAR = 18;                 // css px of clear space around text
    const FEATHER = 40;               // css px fade beyond that
    const COLUMN = 480;               // content column kept quieter on wide screens
    const AVOID = "nav li, main img, main h1, main h3, main .social, main p, footer p";

    // r = radius (css px, scaled down on small screens); cx/cy = home position as a
    // fraction of the viewport; ax/ay = wander as a fraction; sx/sy = speed.
    const blobs = [
        { r: 230, cx: 0.15, cy: 0.80, ax: 0.15, ay: 0.12, sx: 0.11, sy: 0.08, px: 0.0, py: 1.3, c: 0 },
        { r: 190, cx: 0.85, cy: 0.75, ax: 0.12, ay: 0.15, sx: 0.09, sy: 0.12, px: 2.1, py: 0.4, c: 1 },
        { r: 160, cx: 0.50, cy: 1.00, ax: 0.30, ay: 0.08, sx: 0.06, sy: 0.10, px: 4.0, py: 2.6, c: 2 },
        { r: 140, cx: 0.88, cy: 0.20, ax: 0.10, ay: 0.15, sx: 0.13, sy: 0.07, px: 1.2, py: 5.1, c: 0 },
        { r: 120, cx: 0.10, cy: 0.25, ax: 0.10, ay: 0.15, sx: 0.08, sy: 0.12, px: 3.3, py: 3.7, c: 2 },
    ];

    const smooth = (a, b, x) => {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    };

    function start() {
        const canvas = document.createElement("canvas");
        canvas.className = "blobs";
        canvas.setAttribute("aria-hidden", "true");
        document.body.prepend(canvas);
        const ctx = canvas.getContext("2d");

        let vw = 0, vh = 0, cols = 0, rows = 0, cw = 0, scale = 1;
        let mask = null, colors = [];

        function readColors() {
            const cs = getComputedStyle(document.documentElement);
            colors = ["--blob-a", "--blob-b", "--blob-c"].map(v => cs.getPropertyValue(v).trim());
        }

        function buildMask() {
            if (!mask || mask.length !== cols * rows) mask = new Float32Array(cols * rows);
            const wide = vw >= COLUMN + 160;
            const rects = [...document.querySelectorAll(AVOID)]
                .map(el => el.getBoundingClientRect())
                .filter(r => r.width && r.height && r.bottom > -100 && r.top < vh + 100);
            for (let y = 0; y < rows; y++) {
                const py = (y + 0.5) * LINE_PX;
                for (let x = 0; x < cols; x++) {
                    const px = (x + 0.5) * cw;
                    let d = Infinity;
                    for (const r of rects) {
                        const dx = Math.max(r.left - px, 0, px - r.right);
                        const dy = Math.max(r.top - py, 0, py - r.bottom);
                        d = Math.min(d, Math.hypot(dx, dy));
                    }
                    let m = smooth(CLEAR, CLEAR + FEATHER, d);
                    if (wide) m *= 0.25 + 0.75 * smooth(COLUMN / 2, COLUMN / 2 + 120, Math.abs(px - vw / 2));
                    mask[y * cols + x] = m;
                }
            }
        }

        function resize() {
            const dpr = window.devicePixelRatio || 1;
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
            scale = 0.75 * Math.min(1, Math.max(0.55, Math.min(vw, vh) / 800));
            buildMask();
        }

        function draw(t) {
            ctx.clearRect(0, 0, vw, vh);
            const pos = blobs.map(b => ({
                x: vw * (b.cx + b.ax * Math.sin(t * b.sx + b.px)),
                y: vh * (b.cy + b.ay * Math.sin(t * b.sy + b.py)),
                r2: (b.r * scale) ** 2,
                c: b.c,
            }));

            // bucket glyphs by colour + ramp level so fillStyle changes stay few
            const buckets = new Map();
            for (let y = 0; y < rows; y++) {
                const py = (y + 0.5) * LINE_PX;
                for (let x = 0; x < cols; x++) {
                    const m = mask[y * cols + x];
                    if (m <= 0.02) continue;
                    const px = (x + 0.5) * cw;
                    let f = 0, best = 0, bestC = 0;
                    for (const p of pos) {
                        const dx = px - p.x, dy = py - p.y;
                        const v = p.r2 / (dx * dx + dy * dy + 1);
                        f += v;
                        if (v > best) { best = v; bestC = p.c; }
                    }
                    // metaball edge ~1: fade in from 0.4, only the very core reaches the heaviest glyph
                    const a = smooth(0.4, 6, f) * m;
                    const lvl = Math.round(a * (RAMP.length - 1));
                    if (lvl <= 0) continue;
                    const key = bestC * 16 + lvl;
                    let list = buckets.get(key);
                    if (!list) buckets.set(key, list = []);
                    list.push(x, y);
                }
            }
            for (const [key, list] of buckets) {
                const c = key >> 4, lvl = key & 15;
                ctx.fillStyle = colors[c];
                ctx.globalAlpha = 0.25 + 0.75 * (lvl / (RAMP.length - 1));
                const ch = RAMP[lvl];
                for (let i = 0; i < list.length; i += 2) ctx.fillText(ch, list[i] * cw, list[i + 1] * LINE_PX);
            }
            ctx.globalAlpha = 1;
        }

        readColors();
        resize();

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const t0 = performance.now();
        const now = () => (performance.now() - t0) / 1000;
        let last = 0, raf = 0;

        function frame(ts) {
            raf = requestAnimationFrame(frame);
            if (ts - last < 1000 / FPS) return;
            last = ts;
            draw(now());
        }
        const redraw = () => { if (reduceMotion) draw(now()); };

        window.addEventListener("resize", () => { resize(); redraw(); });
        window.addEventListener("scroll", () => { buildMask(); redraw(); }, { passive: true });
        window.addEventListener("load", () => { buildMask(); redraw(); });
        // the glyph width changes once JetBrains Mono arrives
        if (document.fonts) document.fonts.ready.then(() => { resize(); redraw(); });
        new MutationObserver(() => { readColors(); redraw(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

        if (reduceMotion) { draw(now()); return; }

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) cancelAnimationFrame(raf);
            else raf = requestAnimationFrame(frame);
        });
        raf = requestAnimationFrame(frame);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
