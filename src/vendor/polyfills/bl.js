// BufferList minimal polyfill (browser-safe replacement for npm `bl`)
// Only implements the API surface used by mdict vendor code:
//   new BufferList(buf?) / .append(buf) / .slice(start, end) / .length
"use strict";

function BufferList(buf) {
  if (!(this instanceof BufferList)) return new BufferList(buf);
  this._bufs = [];
  this.length = 0;
  if (buf) this.append(buf);
}

BufferList.prototype.append = function (buf) {
  if (Array.isArray(buf)) {
    for (var i = 0; i < buf.length; i++) this.append(buf[i]);
    return this;
  }
  if (!buf) return this;
  // Nested BufferList support (npm `bl` allows appending another BufferList).
  if (buf instanceof BufferList || (buf._bufs && typeof buf.slice === "function")) {
    for (var j = 0; j < buf._bufs.length; j++) this.append(buf._bufs[j]);
    return this;
  }
  // Normalize to Buffer so `.length` is always correct (ArrayBuffer has no `.length`).
  if (buf instanceof ArrayBuffer) {
    buf = Buffer.from(buf);
  } else if (buf instanceof Uint8Array && !Buffer.isBuffer(buf)) {
    buf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  } else if (typeof buf === "string") {
    buf = Buffer.from(buf);
  }
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  this._bufs.push(buf);
  this.length += buf.length;
  return this;
};

BufferList.prototype.slice = function (start, end) {
  if (start === undefined || start === null) start = 0;
  if (end === undefined || end === null || end > this.length) end = this.length;
  start = Math.max(0, start);
  end = Math.max(start, end);
  if (start >= this.length || end <= start) return Buffer.alloc(0);
  var parts = [];
  var pos = 0;
  var target = end - start;
  var collected = 0;
  for (var i = 0; i < this._bufs.length && collected < target; i++) {
    var b = this._bufs[i];
    var bStart = Math.max(0, start - pos);
    var bEnd = Math.min(b.length, end - pos);
    if (bStart < bEnd) {
      parts.push(b.slice(bStart, bEnd));
      collected += bEnd - bStart;
    }
    pos += b.length;
  }
  if (parts.length === 0) return Buffer.alloc(0);
  if (parts.length === 1) return parts[0];
  return Buffer.concat(parts, target);
};

BufferList.prototype.get = function (index) {
  if (typeof index !== "number" || index < 0 || index >= this.length) return undefined;
  var pos = 0;
  for (var i = 0; i < this._bufs.length; i++) {
    var b = this._bufs[i];
    if (index < pos + b.length) return b[index - pos];
    pos += b.length;
  }
  return undefined;
};

BufferList.prototype.toString = function (encoding, start, end) {
  return this.slice(start, end).toString(encoding);
};

module.exports = BufferList;
