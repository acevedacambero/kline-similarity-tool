const fs = require('node:fs');
const vm = require('node:vm');

function loadPage(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 3) throw new Error(`Expected 3 script blocks, found ${scripts.length}`);
  const elements = new Map();
  const makeElement = id => ({
    id, value: id === 'timeframe' ? 'day' : id === 'matchPreset' ? 'balanced' : '',
    checked: id === 'isolate', disabled: false, style: {}, dataset: {}, textContent: '',
    addEventListener() {}, querySelectorAll() { return []; }, appendChild() {}, click() {},
    getContext() { return null; }
  });
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  };
  const modeRadio = { value: 'recent', checked: true, addEventListener() {} };
  const document = {
    getElementById: getElement,
    querySelector(selector) { return selector.includes('input[name=mode]') ? modeRadio : null; },
    querySelectorAll(selector) { return selector === 'input[name=mode]' ? [modeRadio] : []; },
    addEventListener() {}, createDocumentFragment() { return { appendChild() {} }; },
    createElement(tag) { return makeElement(tag); }
  };
  const context = vm.createContext({
    console, document, window: { addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} },
    Worker: function Worker() {}, Blob: function Blob() {}, FileReader: function FileReader() {},
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    TextDecoder, indexedDB: { open() { return {}; } }, Map, Set, Array, Object, Math, Date,
    Promise, ArrayBuffer, Uint8Array, Int32Array, Float64Array, setTimeout, clearTimeout
  });
  vm.runInContext(scripts[2][1], context, { filename: 'page.js' });
  return { context, elements };
}

module.exports = { loadPage };
