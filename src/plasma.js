// Abstract low-res "plasma" background for the home page.
// A sum-of-sines field, banded into a few tones and Bayer-dithered, rendered into a
// tiny canvas (1 canvas px = CELL css px) and upscaled with pixelated sampling.
// Everything is measured in css px, so it looks the same on phones and desktops.
// It is masked away from the text column (and, on narrow screens, kept to the
// bottom of the viewport) so the copy stays readable.
// Colours: --blob-a/b/c and --bg-color, so it follows the theme toggle.
// Compare with the old blobs at ?bg=blobs.
(function () {
    if (new URLSearchParams(location.search).get("bg") === "blobs") return;

    const CELL = 6;          // css px per canvas px: higher = chunkier
    const FPS = 20;
    const SPEED = 0.35;      // animation speed
    const ZOOM = 160;        // css px per pattern "wavelength": higher = larger shapes
    const BANDS = 4;         // tone bands before dithering
    const STRENGTH = 0.6;    // max mix over the background
    const CLEAR = 28;        // css px of clear space kept around text
    const FEATHER = 36;      // css px over which the pattern fades in past that
    // elements the pattern avoids
    const AVOID = "nav li, main img, main h1, main h3, main .social, main p, footer p";
    const COLUMN = 480;      // width of the content column to keep clear (css px)

    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

    function parseColor(str) {
        const s = str.trim();
        if (s.startsWith("#")) {
            const h = s.length === 4 ? s.slice(1).split("").map(c => c + c).join("") : s.slice(1, 7);
            return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
        }
        const m = s.match(/[\d.]+/g);
        return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
    }

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

        let w = 0, h = 0, img = null, mask = null, bg = [0, 0, 0], pal = [];

        function readColors() {
            const cs = getComputedStyle(document.documentElement);
            bg = parseColor(cs.getPropertyValue("--bg-color"));
            pal = ["--blob-b", "--blob-c", "--blob-a"].map(v => parseColor(cs.getPropertyValue(v)));
        }

        // per-cell visibility, 0..1. The pattern fades out around every text block /
        // image (measured from the live layout, so it works at any width). On wide
        // screens it is also kept out of the content column.
        function buildMask() {
            if (!mask || mask.length !== w * h) mask = new Float32Array(w * h);
            const vw = window.innerWidth;
            const wide = vw >= COLUMN + 160;
            const rects = [...document.querySelectorAll(AVOID)]
                .map(el => el.getBoundingClientRect())
                .filter(r => r.width && r.height && r.bottom > -100 && r.top < window.innerHeight + 100);
            for (let y = 0; y < h; y++) {
                const py = (y + 0.5) * CELL;
                for (let x = 0; x < w; x++) {
                    const px = (x + 0.5) * CELL;
                    let d = Infinity;
                    for (const r of rects) {
                        const dx = Math.max(r.left - px, 0, px - r.right);
                        const dy = Math.max(r.top - py, 0, py - r.bottom);
                        d = Math.min(d, Math.hypot(dx, dy));
                    }
                    let m = smooth(CLEAR, CLEAR + FEATHER, d);
                    if (wide) m *= smooth(COLUMN / 2, COLUMN / 2 + 160, Math.abs(px - vw / 2));
                    mask[y * w + x] = m;
                }
            }
        }

        function resize() {
            w = Math.max(1, Math.ceil(window.innerWidth / CELL));
            h = Math.max(1, Math.ceil(window.innerHeight / CELL));
            canvas.width = w;
            canvas.height = h;
            img = ctx.createImageData(w, h);
            buildMask();
        }

        function draw(t) {
            t *= SPEED;
            const data = img.data;
            const k = CELL / ZOOM * Math.PI * 2;
            // two drifting centres for the radial terms
            const c1x = w * (0.5 + 0.4 * Math.sin(t * 0.31)), c1y = h * (0.5 + 0.4 * Math.cos(t * 0.23));
            const c2x = w * (0.5 + 0.4 * Math.cos(t * 0.17)), c2y = h * (0.5 + 0.4 * Math.sin(t * 0.29));

            let i = 0;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const m = mask[y * w + x];
                    if (m <= 0.001) {
                        data[i] = bg[0]; data[i + 1] = bg[1]; data[i + 2] = bg[2]; data[i + 3] = 255;
                        i += 4;
                        continue;
                    }
                    const dx1 = x - c1x, dy1 = y - c1y, dx2 = x - c2x, dy2 = y - c2y;
                    let v = Math.sin(x * k * 0.9 + t)
                          + Math.sin(y * k * 0.7 - t * 0.8)
                          + Math.sin(Math.sqrt(dx1 * dx1 + dy1 * dy1) * k * 0.8 - t * 1.3)
                          + Math.sin(Math.sqrt(dx2 * dx2 + dy2 * dy2) * k * 0.6 + t * 0.9);
                    v = Math.pow((v + 4) / 8, 1.4);                    // 0..1, biased to empty

                    // band + dither: quantised level picks the palette tone
                    const d = BAYER[(y & 3) * 4 + (x & 3)];
                    const lvl = Math.min(BANDS - 1, Math.floor(v * BANDS + d - 0.5));
                    const tone = lvl / (BANDS - 1);                     // 0..1 across the palette

                    // palette: 0 = background, then blob-b -> blob-c -> blob-a
                    let col, a;
                    if (lvl <= 0) { col = bg; a = 0; }
                    else {
                        const p = (tone * (pal.length - 1));
                        const j = Math.min(pal.length - 2, Math.floor(p)), f = p - j;
                        const c0 = pal[j], c1 = pal[j + 1];
                        col = [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
                        a = STRENGTH * m * (0.35 + 0.65 * tone);
                    }
                    data[i]     = bg[0] + (col[0] - bg[0]) * a;
                    data[i + 1] = bg[1] + (col[1] - bg[1]) * a;
                    data[i + 2] = bg[2] + (col[2] - bg[2]) * a;
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
        const now = () => (performance.now() - t0) / 1000;

        function frame(ts) {
            raf = requestAnimationFrame(frame);
            if (ts - last < 1000 / FPS) return;
            last = ts;
            draw(now());
        }

        window.addEventListener("resize", () => { resize(); if (reduceMotion) draw(now()); });
        // text moves when the page scrolls (phones) or once fonts/images finish loading
        window.addEventListener("scroll", () => { buildMask(); if (reduceMotion) draw(now()); }, { passive: true });
        window.addEventListener("load", () => { buildMask(); if (reduceMotion) draw(now()); });
        new MutationObserver(() => { readColors(); if (reduceMotion) draw(now()); })
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
