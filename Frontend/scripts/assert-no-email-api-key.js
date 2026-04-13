'use strict';

/**
 * CI/build guard that ensures the Vite frontend is never built with
 * VITE_EMAIL_SERVER_API_KEY defined. Because Vite inlines VITE_* env vars
 * into the browser bundle, shipping this value would leak the email server
 * secret to end users.
 */

const disallowedVar = 'VITE_EMAIL_SERVER_API_KEY';

if (process.env[disallowedVar]) {
  const message = [
    '',
    '🚫 Build blocked: insecure environment configuration detected.',
    `The variable ${disallowedVar} is set during the build.`,
    '',
    'VITE_* variables are bundled into the client at build time. Remove this',
    'variable from your build environment or switch to the server-side',
    'EMAIL_SERVER_API_KEY before re-running `npm run build`.',
    '',
  ].join('\n');
  console.error(message);
  process.exit(1);
}
