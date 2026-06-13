// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Suppress known Next.js / React exceptions that don't indicate real test failures
Cypress.on('uncaught:exception', (err) => {
  // Next.js server actions use redirect() which throws NEXT_REDIRECT — expected behavior
  if (err.message.includes('NEXT_REDIRECT')) {
    return false;
  }
  // Next.js app router's InnerLayoutRouter wraps pages in <Suspense> on the client,
  // but the initial SSR HTML has <main> at that slot. React detects the mismatch,
  // logs this error, and self-heals with a full client render. The page works correctly.
  if (err.message.includes('Hydration failed') ||
      err.message.includes('There was an error while hydrating')) {
    return false;
  }
  // A serialised DOM Event (PointerEvent/MouseEvent) leaked into the unhandled-rejection
  // handler; JSON.stringify produces {"isTrusted":true}. This is not a real app error.
  if (err.message.includes('"isTrusted":true') || err.message === '{"isTrusted":true}') {
    return false;
  }
  // BridgeGrid fetch requests are aborted during page navigation (e.g. delete redirect).
  // In Cypress, the unhandledrejection reason is a raw DOM Event object; err.message ends up
  // as "[object Event]" or "[object PointerEvent]" (the Event's toString). The root cause is
  // AbortError from the cancelled fetch, but it surfaces here as the DOM Event wrapper.
  if (err.name === 'AbortError' || err.message?.includes('AbortError') ||
      err.message?.includes('[object Event]') || err.message?.includes('[object PointerEvent]')) {
    return false;
  }
  return true;
});
