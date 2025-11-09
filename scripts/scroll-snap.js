/**
 * Section-by-section scroll snapping for homepage
 * Only active when html.home class is present
 */

(function () {
  // Check if this is the homepage
  if (!document.documentElement.classList.contains('home')) {
    return;
  }

  const sections = Array.from(document.querySelectorAll('.fullpage-section'));
  if (sections.length === 0) return;

  const navbarHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--navbar-height')) || 72;
  const snapOffset = 24; // visual offset for alignment
  const totalSnapOffset = navbarHeight + snapOffset;

  let isSnapping = false;
  let scrollTimeout;

  /**
   * Find the section closest to viewport center
   */
  function getNearestSection() {
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    let nearest = sections[0];
    let minDistance = Math.abs(sections[0].offsetTop - viewportCenter);

    for (let section of sections) {
      const distance = Math.abs(section.offsetTop - viewportCenter);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = section;
      }
    }

    return nearest;
  }

  /**
   * Smoothly scroll to a section
   */
  function scrollToSection(section) {
    isSnapping = true;
    const targetY = section.offsetTop - totalSnapOffset;
    
    // Use smooth scrolling
    window.scrollTo({
      top: targetY,
      behavior: 'smooth'
    });

    // Reset snapping flag after scroll completes
    setTimeout(() => {
      isSnapping = false;
    }, 800); // Match smooth scroll duration
  }

  /**
   * Handle scroll event - snap to nearest section
   */
  function handleScroll() {
    if (isSnapping) return;

    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      const nearest = getNearestSection();
      scrollToSection(nearest);
    }, 100); // Wait 100ms after scroll stops
  }

  // Only listen for scroll on desktop (avoid mobile touch scroll interruption)
  if (window.innerWidth > 768) {
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  // Cleanup on page navigation
  window.addEventListener('beforeunload', () => {
    window.removeEventListener('scroll', handleScroll);
  });
})();
