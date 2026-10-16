// Minimal replacement for `buffer-to-arraybuffer` (no Node deps).
"use strict";

module.exports = function toArrayBuffer(buf) {
  if (buf instanceof ArrayBuffer) return buf;
  if (buf && buf.buffer instanceof ArrayBuffer) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  throw new TypeError("toArrayBuffer: expected a Buffer/Uint8Array");
};
