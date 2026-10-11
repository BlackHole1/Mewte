// Applies the saved theme before first paint, so a dark page never flashes white.
(function () {
  try {
    var theme = localStorage.getItem("mewte-theme");
    var dark =
      theme === "dark" ||
      (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch {
    // Storage is unavailable; the stylesheet's default theme applies.
  }
})();
