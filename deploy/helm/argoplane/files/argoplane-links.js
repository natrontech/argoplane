// ArgoPlane: Add click-to-navigate for "by ArgoPlane" branding elements
// Loaded as an ArgoCD UI extension from /tmp/extensions/
(function() {
  'use strict';
  var AP_URL = 'https://argoplane.io';

  function attachLink(selector, pseudo) {
    document.querySelectorAll(selector).forEach(function(el) {
      if (el.dataset.apLinked) return;
      el.dataset.apLinked = '1';
      el.addEventListener('click', function(e) {
        // Only open if clicking in the pseudo-element area (lower part)
        var rect = el.getBoundingClientRect();
        var relY = e.clientY - rect.top;
        // For sidebar: ::after is at the bottom (~50%+)
        // For login: ::before with order:99 is at the bottom (~60%+)
        if (pseudo === 'after' && relY > rect.height * 0.5) {
          window.open(AP_URL, '_blank', 'noopener');
        } else if (pseudo === 'before' && relY > rect.height * 0.6) {
          window.open(AP_URL, '_blank', 'noopener');
        }
      });
    });
  }

  function init() {
    attachLink('.sidebar__logo-container', 'after');
    attachLink('.login__box .login__logo', 'before');
  }

  // Run on load and observe for SPA navigation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-attach after SPA route changes
  var observer = new MutationObserver(function() { init(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
