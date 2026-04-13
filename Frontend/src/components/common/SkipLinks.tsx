/**
 * Skip Links Component for Accessibility
 * Allows keyboard users to skip to main content
 */
export const SkipLinks = () => {
  return (
    <div className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:z-[9999] focus-within:top-4 focus-within:left-4">
      <a
        href="#main-content"
        className="block px-4 py-2 bg-blue-600 text-white rounded-lg font-bold font-heading shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
      >
        Skip to main content
      </a>
    </div>
  );
};

