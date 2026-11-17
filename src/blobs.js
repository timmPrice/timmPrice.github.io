// Low-res "energy blob" background for the home page.
// Renders a metaball field into a tiny canvas (1 canvas px = SCALE css px) and lets
// the browser upscale it with pixelated sampling. Colours come from the --blob-*
// and --bg-color CSS variables, so they follow the light/dark theme.
(function () {
    // opt-in only now: ?bg=blobs (the default background is src/plasma.js)
    if (new URLSearchParams(location.search).get("bg") !== "blobs") return;

    const SCALE = 6;          // css px per canvas px: higher = chunkier
    const FPS = 24;
    const STRENGTH = 0.55;    // max mix of blob colour over the background
    const LEVELS = 5;         // colour bands before dithering
    const CUTOFF = 0.12;      // field strength treated as empty background

    // 4x4 Bayer matrix, normalised to [0, 1)
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);

    const blobs = [
        { r: 0.30, ax: 0.35, ay: 0.20, sx: 0.050, sy: 0.070, px: 0.0, py: 1.3, cx: 0.25, cy: 0.85, c: 0 },
        { r: 0.24, ax: 0.30, ay: 0.25, sx: 0.060, sy: 0.040, px: 2.1, py: 0.4, cx: 0.75, cy: 0.80, c: 1 },
        { r: 0.20, ax: 0.40, ay: 0.30, sx: 0.035, sy: 0.055, px: 4.0, py: 2.6, cx: 0.50, cy: 0.95, c: 2 },
        { r: 0.16, ax: 0.25, ay: 0.35, sx: 0.070, sy: 0.030, px: 1.2, py: 5.1, cx: 0.85, cy: 0.40, c: 0 },
        { r: 0.14, ax: 0.30, ay: 0.30, sx: 0.045, sy: 0.065, px: 3.3, py: 3.7, cx: 0.15, cy: 0.35, c: 2 },
    ];

    function parseColor(str) {
        const s = str.trim();
        if (s.startsWith("#")) {
            const h = s.length === 4 ? s.slice(1).split("").map(c => c + c).join("") : s.slice(1, 7);
            return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
        }
        const m = s.match(/[\d.]+/g);
        return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
    }

    function start() {
        const canvas = document.createElement("canvas");
        canvas.className = "blobs";
        canvas.setAttribute("aria-hidden", "true");
        document.body.prepend(canvas);
        const ctx = canvas.getContext("2d");

        let w = 0, h = 0, img = null, bg = [0, 0, 0], cols = [];

        function readColors() {
            const cs = getComputedStyle(document.documentElement);
            bg = parseColor(cs.getPropertyValue("--bg-color"));
            cols = ["--blob-a", "--blob-b", "--blob-c"].map(v => parseColor(cs.getPropertyValue(v)));
        }

        function resize() {
            w = Math.max(1, Math.ceil(window.innerWidth / SCALE));
            h = Math.max(1, Math.ceil(window.innerHeight / SCALE));
            canvas.width = w;
            canvas.height = h;
            img = ctx.createImageData(w, h);
        }

        function draw(t) {
            const data = img.data;
            const aspect = w / h;
            const pos = blobs.map(b => [
                (b.cx + b.ax * Math.sin(t * b.sx + b.px)) * aspect,
                b.cy + b.ay * Math.sin(t * b.sy + b.py),
                b.r * b.r,
                cols[b.c],
            ]);

            let i = 0;
            for (let y = 0; y < h; y++) {
                const ny = y / h;
                for (let x = 0; x < w; x++) {
                    const nx = (x / w) * aspect;
                    let f = 0, r = 0, g = 0, bl = 0;
                    for (let k = 0; k < pos.length; k++) {
                        const p = pos[k];
                        const dx = nx - p[0], dy = ny - p[1];
                        const v = p[2] / (dx * dx + dy * dy + 0.002);
                        f += v;
                        r += p[3][0] * v; g += p[3][1] * v; bl += p[3][2] * v;
                    }
                    // soft falloff, then band + Bayer dither for the lo-res look
                    let a = Math.min(1, f / 4);
                    a = Math.max(0, (a - CUTOFF) / (1 - CUTOFF));   // keep the gaps clean
                    a = a * a;
                    const d = BAYER[(y & 3) * 4 + (x & 3)];
                    a = Math.floor(a * LEVELS + d) / LEVELS;
                    a = Math.min(1, a) * STRENGTH;

                    data[i]     = bg[0] + (r / f - bg[0]) * a;
                    data[i + 1] = bg[1] + (g / f - bg[1]) * a;
                    data[i + 2] = bg[2] + (bl / f - bg[2]) * a;
                    data[i + 3] = 255;
                    i += 4;
                }
            }
            ctx.putImageData(img, 0, 0);
        }

        readColors();
        resize();

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const t0 = performance.now();
        let last = 0, raf = 0;

        function frame(now) {
            raf = requestAnimationFrame(frame);
            if (now - last < 1000 / FPS) return;
            last = now;
            draw((now - t0) / 1000);
        }

        function redrawStill() { draw((performance.now() - t0) / 1000); }

        window.addEventListener("resize", () => { resize(); if (reduceMotion) redrawStill(); });

        // repaint with the new palette when the theme toggle flips the class on <html>
        new MutationObserver(() => { readColors(); if (reduceMotion) redrawStill(); })
            .observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

        if (reduceMotion) { redrawStill(); return; }

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) cancelAnimationFrame(raf);
            else raf = requestAnimationFrame(frame);
        });
        raf = requestAnimationFrame(frame);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
})();
