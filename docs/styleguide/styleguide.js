// Styleguide utilities: theme toggle, code copy

(function () {
  // Dark mode toggle
  var toggle = document.getElementById('theme-toggle');
  if (toggle) {
    var saved = localStorage.getItem('ap-theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      toggle.checked = true;
    }
    toggle.addEventListener('change', function () {
      if (toggle.checked) {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('ap-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('ap-theme', 'light');
      }
    });
  }
})();
