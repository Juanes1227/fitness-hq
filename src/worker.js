import {
  randomSalt, hashPassword, verifyPassword,
  signSession, verifySession, parseCookies,
  sessionCookieHeader, clearSessionCookieHeader, isValidEmail,
} from "./server/auth.js";
import {
  getUserByEmail, getUserById, createUser,
  getProfile, upsertProfile,
  getAllExerciseLogs, saveExerciseLog,
  getMeals, getMealsByDate, addMeal, deleteMeal,
  getMetrics, upsertMetric,
  getSwaps, saveSwap, deleteSwap,
} from "./server/db.js";
import { parseFood, writeCoachNote, probeModels } from "./server/ai.js";

function json(data, init={}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers||{}) },
  });
}
const bad = (msg, status=400) => json({ error: msg }, { status });

async function currentUserId(request, env) {
  const cookies = parseCookies(request);
  return verifySession(cookies.fhq_session, env.SESSION_SECRET);
}

async function requireUser(request, env) {
  const uid = await currentUserId(request, env);
  if (!uid) return null;
  return getUserById(env, uid);
}

async function readJSON(request) {
  try { return await request.json(); } catch { return null; }
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method;

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (pathname === "/api/auth/signup" && method === "POST") {
    const body = await readJSON(request);
    if (!body || !isValidEmail(body.email) || !body.password || body.password.length < 8) {
      return bad("Email inválido o contraseña muy corta (mínimo 8 caracteres).");
    }
    const email = body.email.trim().toLowerCase();
    if (await getUserByEmail(env, email)) return bad("Ya existe una cuenta con ese email.", 409);
    const salt = randomSalt();
    const passwordHash = await hashPassword(body.password, salt);
    const userId = await createUser(env, { email, passwordHash, salt });
    const token = await signSession(userId, env.SESSION_SECRET);
    return json({ id: userId, email }, { headers: { "Set-Cookie": sessionCookieHeader(token) } });
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await readJSON(request);
    if (!body || !body.email || !body.password) return bad("Falta email o contraseña.");
    const email = body.email.trim().toLowerCase();
    const user = await getUserByEmail(env, email);
    if (!user || !(await verifyPassword(body.password, user.salt, user.password_hash))) {
      return bad("Email o contraseña incorrectos.", 401);
    }
    const token = await signSession(user.id, env.SESSION_SECRET);
    return json({ id: user.id, email: user.email }, { headers: { "Set-Cookie": sessionCookieHeader(token) } });
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
  }

  if (pathname === "/api/me" && method === "GET") {
    const user = await requireUser(request, env);
    if (!user) return bad("No autenticado.", 401);
    return json({ id: user.id, email: user.email });
  }

  // A partir de aquí todo requiere sesión válida
  const user = await requireUser(request, env);
  if (!user) return bad("No autenticado.", 401);
  const uid = user.id;

  // ── Perfil ────────────────────────────────────────────────────────────────
  if (pathname === "/api/profile" && method === "GET") {
    return json(await getProfile(env, uid));
  }
  if (pathname === "/api/profile" && method === "PUT") {
    const body = await readJSON(request);
    if (!body) return bad("Body inválido.");
    await upsertProfile(env, uid, body);
    return json({ ok: true });
  }

  // ── Log de ejercicio ──────────────────────────────────────────────────────
  if (pathname === "/api/exlog" && method === "GET") {
    return json(await getAllExerciseLogs(env, uid));
  }
  if (pathname === "/api/exlog" && method === "POST") {
    const body = await readJSON(request);
    if (!body?.name || !body?.date || !Array.isArray(body.sets)) return bad("Body inválido.");
    await saveExerciseLog(env, uid, body.name, body.date, body.sets);
    return json({ ok: true });
  }

  // ── Comidas ───────────────────────────────────────────────────────────────
  if (pathname === "/api/meals" && method === "GET") {
    const date = url.searchParams.get("date");
    return json(date ? await getMealsByDate(env, uid, date) : await getMeals(env, uid));
  }
  if (pathname === "/api/meals" && method === "POST") {
    const body = await readJSON(request);
    if (!body?.date || !body?.type || !body?.name) return bad("Body inválido.");
    const id = await addMeal(env, uid, body);
    return json({ id });
  }
  const mealMatch = pathname.match(/^\/api\/meals\/(\d+)$/);
  if (mealMatch && method === "DELETE") {
    await deleteMeal(env, uid, Number(mealMatch[1]));
    return json({ ok: true });
  }

  // ── Métricas corporales ───────────────────────────────────────────────────
  if (pathname === "/api/metrics" && method === "GET") {
    return json(await getMetrics(env, uid));
  }
  if (pathname === "/api/metrics" && method === "POST") {
    const body = await readJSON(request);
    if (!body?.date || body.weight==null) return bad("Body inválido.");
    await upsertMetric(env, uid, body);
    return json({ ok: true });
  }

  // ── Sustituciones de ejercicio (SWAP en Rutina) ────────────────────────────
  if (pathname === "/api/swaps" && method === "GET") {
    return json(await getSwaps(env, uid));
  }
  if (pathname === "/api/swaps" && method === "POST") {
    const body = await readJSON(request);
    if (!body?.slotId || !body?.ex?.id || !body?.ex?.name) return bad("Body inválido.");
    await saveSwap(env, uid, body.slotId, body.ex);
    return json({ ok: true });
  }
  const swapMatch = pathname.match(/^\/api\/swaps\/([^/]+)$/);
  if (swapMatch && method === "DELETE") {
    await deleteSwap(env, uid, decodeURIComponent(swapMatch[1]));
    return json({ ok: true });
  }

  // ── IA: solo lenguaje, nunca cifras ───────────────────────────────────────
  // parse-food devuelve qué comiste y cuánto; los macros los resuelve el
  // cliente contra USDA/OFF. explain redacta sobre números ya calculados.
  if (pathname === "/api/ai/parse-food" && method === "POST") {
    const body = await readJSON(request);
    if (!body?.text) return bad("Falta el texto.");
    try {
      return json({ items: await parseFood(env, body.text) });
    } catch (err) {
      return json({ error: "La IA no está disponible ahora mismo.", detail: String(err) }, { status: 503 });
    }
  }

  // Diagnóstico: qué modelos siguen vivos (Cloudflare los deprecia seguido).
  if (pathname === "/api/ai/models" && method === "GET") {
    try {
      return json({ models: await probeModels(env) });
    } catch (err) {
      return json({ error: String(err) }, { status: 503 });
    }
  }

  if (pathname === "/api/ai/explain" && method === "POST") {
    const body = await readJSON(request);
    if (!Array.isArray(body?.recs)) return bad("Body inválido.");
    try {
      return json({ note: await writeCoachNote(env, body.recs, body.profile) });
    } catch (err) {
      return json({ error: "La IA no está disponible ahora mismo.", detail: String(err) }, { status: 503 });
    }
  }

  // ── Importar respaldo local (mismo formato del export JSON de la app) ─────
  if (pathname === "/api/import" && method === "POST") {
    const body = await readJSON(request);
    if (!body?.dump) return bad("Body inválido.");
    const dump = body.dump;
    let imported = { profile:false, metrics:0, exlog:0, meals:0, swaps:0 };
    if (dump.profile) { await upsertProfile(env, uid, dump.profile); imported.profile = true; }
    if (Array.isArray(dump.metrics)) {
      for (const m of dump.metrics) { await upsertMetric(env, uid, m); imported.metrics++; }
    }
    if (dump.swaps && typeof dump.swaps === "object") {
      for (const [slotId, ex] of Object.entries(dump.swaps)) {
        if (ex?.id && ex?.name) { await saveSwap(env, uid, slotId, ex); imported.swaps++; }
      }
    }
    for (const [key, val] of Object.entries(dump)) {
      if (key.startsWith("exlog:") && Array.isArray(val)) {
        const name = key.slice(6);
        for (const session of val) {
          await saveExerciseLog(env, uid, name, session.date, session.sets);
          imported.exlog++;
        }
      }
      if (key.startsWith("meals:") && Array.isArray(val)) {
        for (const meal of val) { await addMeal(env, uid, { ...meal, date: key.slice(6) }); imported.meals++; }
      }
    }
    return json({ ok: true, imported });
  }

  return bad("Ruta no encontrada.", 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: "Error interno.", detail: String(err) }, { status: 500 });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
