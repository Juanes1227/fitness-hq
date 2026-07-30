// ── Crypto helpers (Web Crypto — sin dependencias externas, corre nativo en Workers) ──

function b64(bytes) {
  let s = "";
  bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

const PBKDF2_ITERATIONS = 100000;

export function randomSalt() {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: unb64(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key, 256
  );
  return b64(new Uint8Array(bits));
}

export async function verifyPassword(password, salt, expectedHash) {
  const hash = await hashPassword(password, salt);
  // comparación en tiempo constante
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i=0;i<hash.length;i++) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64(new Uint8Array(sig));
}

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

// Cookie de sesión firmada y sin estado: payload = userId + expiración, firmado con HMAC.
// No necesita tabla de sesiones en D1 — verificar la firma alcanza.
export async function signSession(userId, secret) {
  const payload = JSON.stringify({ uid: userId, exp: Date.now() + SESSION_MAX_AGE*1000 });
  const encoded = b64(new TextEncoder().encode(payload));
  const sig = await hmac(secret, encoded);
  return `${encoded}.${sig}`;
}

export async function verifySession(token, secret) {
  if (!token) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = await hmac(secret, encoded);
  if (expected !== sig) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64(encoded)));
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
    return payload.uid;
  } catch { return null; }
}

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  header.split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i<0) return;
    out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  });
  return out;
}

export function sessionCookieHeader(token) {
  return `fhq_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;
}
export function clearSessionCookieHeader() {
  return `fhq_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
