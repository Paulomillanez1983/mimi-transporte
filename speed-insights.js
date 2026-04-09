// Vercel Speed Insights for vanilla HTML/JavaScript
// This script dynamically loads and initializes Vercel Speed Insights
(function() {
  'use strict';
  
  // Only run in production (when deployed to Vercel)
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Speed Insights: Skipping in development mode');
    return;
  }
  
  // Create and inject the Speed Insights module script
  const script = document.createElement('script');
  script.type = 'module';
  script.async = true;
  
  // Use the inject function from the Speed Insights package
  script.innerHTML = `
    import { inject } from 'https://cdn.jsdelivr.net/npm/@vercel/speed-insights@1/dist/index.mjs';
    
    // Initialize Speed Insights
    inject({
      framework: 'vanilla',
      debug: false
    });
  `;
  
  // Append to head
  if (document.head) {
    document.head.appendChild(script);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      document.head.appendChild(script);
    });
  }
})();
