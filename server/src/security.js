const crypto = require("node:crypto");

function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input), "utf8").digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function randomCode6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function timingSafeEqualHex(a, b) {
  const aa = Buffer.from(String(a), "hex");
  const bb = Buffer.from(String(b), "hex");
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

module.exports = { sha256Hex, randomToken, randomCode6, timingSafeEqualHex };

