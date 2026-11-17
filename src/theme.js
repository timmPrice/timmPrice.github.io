// Light/dark toggle shared by every page. Load it in <head> (not deferred) so the
// saved theme is applied before first paint. The theme class lives on <html>, so
// main.css / post.css `.light` palettes cascade to the whole page.
(function () {
    const KEY = "theme";
    const root = document.documentElement;

    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    if (saved === "light") root.classList.add("light");

    function label(button) {
        // 日 (sun) offers light mode, 月 (moon) offers dark mode
        button.textContent = root.classList.contains("light") ? "月" : "日";
    }

    document.addEventListener("DOMContentLoaded", () => {
        let button = document.getElementById("lm-toggle");
        if (!button) {
            // exported posts have no nav; add a floating toggle
            button = document.createElement("button");
            button.id = "lm-toggle";
            button.className = "glow floating";
            document.body.appendChild(button);
        }
        button.setAttribute("aria-label", "Toggle light mode");
        label(button);

        button.addEventListener("click", () => {
            const light = root.classList.toggle("light");
            try { localStorage.setItem(KEY, light ? "light" : "dark"); } catch (e) { /* ignore */ }
            label(button);
        });
    });
})();
