// Shared test setup: a localStorage stub (the domain layer's only browser
// dependency) so store.js/persist.js load under plain Node without a DOM.
//
// store.js and rollup.js import each other (see the comment at the bottom of
// store.js) — a query-string cache-busting trick to get a "fresh module" per
// test would silently break that relationship, since rollup.js's own
// `./store.js` import wouldn't carry the busted query and would resolve back
// to a stale cached instance. Instead we import both modules exactly once
// (Node's module cache is process-wide) and use store.js's own `reset()` to
// clear state between tests — the same mechanism the app's "Reset to
// Example" button uses, so it is exercised by the app itself, not just by
// tests reaching around it.

export function stubLocalStorage() {
  const v = {};
  globalThis.localStorage = {
    getItem: (k) => (k in v ? v[k] : null),
    setItem: (k, val) => { v[k] = val; },
    removeItem: (k) => { delete v[k]; },
  };
}

stubLocalStorage();
export const S = await import('../src/store.js');
export const { seed } = await import('../src/seed.js');

S.init(seed);

/** Call at the start of every test that needs a known-clean graph. */
export function freshStore() {
  S.reset(seed);
  return S;
}
