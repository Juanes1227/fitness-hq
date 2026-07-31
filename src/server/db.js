// ── Helpers de acceso a D1 (una fila/consulta por usuario — aislamiento por user_id) ──

export async function getUserByEmail(env, email) {
  return env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
}
export async function getUserById(env, id) {
  return env.DB.prepare("SELECT id, email, created_at FROM users WHERE id = ?").bind(id).first();
}
export async function createUser(env, { email, passwordHash, salt }) {
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "INSERT INTO users (email, password_hash, salt, created_at) VALUES (?, ?, ?, ?)"
  ).bind(email, passwordHash, salt, now).run();
  return res.meta.last_row_id;
}

export async function getProfile(env, userId) {
  const row = await env.DB.prepare("SELECT * FROM profiles WHERE user_id = ?").bind(userId).first();
  if (!row) return null;
  return { weight:row.weight, height:row.height, age:row.age, sex:row.sex, activity:row.activity, goal:row.goal, week: row.week_json ? JSON.parse(row.week_json) : undefined };
}
export async function upsertProfile(env, userId, profile) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO profiles (user_id, weight, height, age, sex, activity, goal, week_json, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      weight=excluded.weight, height=excluded.height, age=excluded.age, sex=excluded.sex,
      activity=excluded.activity, goal=excluded.goal, week_json=excluded.week_json, updated_at=excluded.updated_at
  `).bind(userId, profile.weight??null, profile.height??null, profile.age??null, profile.sex??null,
          profile.activity??null, profile.goal??null, profile.week?JSON.stringify(profile.week):null, now).run();
}

export async function getAllExerciseLogs(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT exercise_name, date, sets_json FROM exercise_logs WHERE user_id = ? ORDER BY date ASC"
  ).bind(userId).all();
  const out = {};
  for (const r of results) {
    (out[r.exercise_name] ||= []).push({ date: r.date, sets: JSON.parse(r.sets_json) });
  }
  return out;
}
export async function saveExerciseLog(env, userId, exerciseName, date, sets) {
  await env.DB.prepare(`
    INSERT INTO exercise_logs (user_id, exercise_name, date, sets_json) VALUES (?,?,?,?)
    ON CONFLICT(user_id, exercise_name, date) DO UPDATE SET sets_json=excluded.sets_json
  `).bind(userId, exerciseName, date, JSON.stringify(sets)).run();
}

export async function getMeals(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT id, date, type, name, src, grams, kcal, protein, carbs, fat FROM meals WHERE user_id = ? ORDER BY date ASC"
  ).bind(userId).all();
  const out = {};
  for (const r of results) (out[r.date] ||= []).push(r);
  return out;
}
export async function getMealsByDate(env, userId, date) {
  const { results } = await env.DB.prepare(
    "SELECT id, date, type, name, src, grams, kcal, protein, carbs, fat FROM meals WHERE user_id = ? AND date = ? ORDER BY id ASC"
  ).bind(userId, date).all();
  return results;
}
export async function addMeal(env, userId, m) {
  const res = await env.DB.prepare(`
    INSERT INTO meals (user_id, date, type, name, src, grams, kcal, protein, carbs, fat) VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(userId, m.date, m.type, m.name, m.src??null, m.grams??null, m.kcal??null, m.protein??null, m.carbs??null, m.fat??null).run();
  return res.meta.last_row_id;
}
export async function deleteMeal(env, userId, id) {
  await env.DB.prepare("DELETE FROM meals WHERE user_id = ? AND id = ?").bind(userId, id).run();
}

export async function getMetrics(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT date, weight, fat, muscle FROM metrics WHERE user_id = ? ORDER BY date ASC"
  ).bind(userId).all();
  return results;
}
export async function upsertMetric(env, userId, m) {
  await env.DB.prepare(`
    INSERT INTO metrics (user_id, date, weight, fat, muscle) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, date) DO UPDATE SET weight=excluded.weight, fat=excluded.fat, muscle=excluded.muscle
  `).bind(userId, m.date, m.weight??null, m.fat??null, m.muscle??null).run();
}

export async function getSwaps(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT slot_id, ex_id, ex_name, ex_es FROM exercise_swaps WHERE user_id = ?"
  ).bind(userId).all();
  const out = {};
  for (const r of results) {
    // El id vuelve a número cuando es un id de wger (todo dígitos); las
    // alternativas locales usan ids tipo "la1" y quedan como texto.
    const id = /^\d+$/.test(r.ex_id) ? Number(r.ex_id) : r.ex_id;
    out[r.slot_id] = { id, name: r.ex_name, es: r.ex_es || undefined };
  }
  return out;
}
export async function saveSwap(env, userId, slotId, ex) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO exercise_swaps (user_id, slot_id, ex_id, ex_name, ex_es, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id, slot_id) DO UPDATE SET ex_id=excluded.ex_id, ex_name=excluded.ex_name, ex_es=excluded.ex_es, updated_at=excluded.updated_at
  `).bind(userId, slotId, String(ex.id), ex.name, ex.es??null, now).run();
}
export async function deleteSwap(env, userId, slotId) {
  await env.DB.prepare("DELETE FROM exercise_swaps WHERE user_id = ? AND slot_id = ?").bind(userId, slotId).run();
}
