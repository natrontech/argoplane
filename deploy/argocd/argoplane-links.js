// ArgoPlane: Add click-to-navigate for "by ArgoPlane" branding elements
// Loaded as an ArgoCD UI extension from /tmp/extensions/
(function() {
  'use strict';
  var AP_URL = 'https://natrontech.github.io/argoplane';

  // One delegated listener survives SPA re-renders, so there's no need to
  // watch every DOM mutation and re-attach handlers.
  document.addEventListener('click', function(e) {
    var el = e.target.closest && e.target.closest('.sidebar__logo-container, .login__box .login__logo');
    if (!el) return;
    // Only open when the click lands on the "by ArgoPlane" pseudo-element:
    // ::after in the sidebar (lower ~50%), ::before with order:99 on the
    // login box (lower ~40%).
    var rect = el.getBoundingClientRect();
    var threshold = el.classList.contains('login__logo') ? 0.6 : 0.5;
    if (e.clientY - rect.top > rect.height * threshold) {
      window.open(AP_URL, '_blank', 'noopener');
    }
  });
})();
