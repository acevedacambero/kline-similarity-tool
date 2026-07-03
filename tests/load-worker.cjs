const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function findHtml() {
  const root = path.resolve(__dirname, '..');
  const names = fs.readdirSync(root).filter(name => name.toLowerCase().endsWith('.html'));
  if (names.length !== 1) throw new Error(`Expected one HTML file in ${root}, found ${names.length}`);
  return path.join(root, names[0]);
}

function loadWorker(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script id="workerSrc"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('workerSrc not found');
  const messages = [];
  const self = { postMessage: value => messages.push(value), onmessage: null };
  const context = vm.createContext({
    self, postMessage: self.postMessage, console, setTimeout, clearTimeout,
    Map, Array, Object, Math, Date, Promise, ArrayBuffer, DataView,
    Uint8Array, Int32Array, Float64Array, TextDecoder,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    indexedDB: { open() { throw new Error('disabled in unit tests'); } }
  });
  vm.runInContext(match[1], context, { filename: 'workerSrc.js' });
  return { api: self.__KLINE_TEST_API__, self, context, messages };
}

module.exports = { findHtml, loadWorker };
