/**
 * Static Favicon Loader
 * Loads a static favicon without animation to avoid performance violations
 */

(function() {
  const logoSvgUrl = '/logos/nretech-circular-icon.svg';

  /**
   * Load static favicon
   */
  function initFavicon() {
    try {
      let faviconLink = document.querySelector('link[rel="icon"]');
      
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }
      
      faviconLink.href = logoSvgUrl;
      faviconLink.type = 'image/svg+xml';
    } catch (err) {
      console.warn('Could not set favicon:', err);
    }
  }

  /**
   * Initialize favicon when DOM is ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFavicon);
  } else {
    // DOM is already ready
    initFavicon();
  }
})();
