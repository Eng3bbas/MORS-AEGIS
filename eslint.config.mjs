// Minimal ESLint flat config, run with `npx --yes eslint@10 .` so the project keeps zero npm
// dependencies. Globals are listed by hand instead of importing the `globals` package.
const shared = [
  'console', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal',
  'fetch', 'Response', 'Request', 'Headers', 'Blob', 'FormData', 'structuredClone', 'queueMicrotask',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'crypto', 'atob', 'btoa',
  'Intl', 'WebAssembly', 'DOMException', 'Event', 'EventTarget'
];
const browser = [
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'alert',
  'confirm', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'matchMedia',
  'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'HTMLElement', 'HTMLCanvasElement',
  'Image', 'ImageData', 'File', 'FileReader', 'DOMParser', 'XMLSerializer', 'Path2D', 'OffscreenCanvas',
  'createImageBitmap', 'CustomEvent', 'KeyboardEvent', 'PointerEvent', 'Worker', 'devicePixelRatio'
];
const node = ['process', 'Buffer', 'global', 'globalThis', 'setImmediate', 'clearImmediate'];
const asGlobals = names => Object.fromEntries(names.map(name => [name, 'readonly']));

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }]
};

export default [
  { ignores: ['node_modules/**', 'dist/**', 'var/**', 'launcher/**'] },
  {
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: asGlobals([...shared, ...browser]) },
    rules
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: asGlobals([...shared, ...node]) },
    rules
  }
];
