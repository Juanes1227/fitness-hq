// ── Cliente de la API (reemplaza el acceso directo a localStorage) ────────────
// Todas las funciones asumen que ya hay una sesión válida (cookie fhq_session);
// si el backend responde 401, dejamos que el AuthGate en App.jsx lo maneje.

async function req(path, opts={}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers||{}) },
    credentials: "same-origin",
  });
  if (res.status === 401) { const e = new Error("unauthenticated"); e.code = 401; throw e; }
  if (!res.ok) { const body = await res.json().catch(()=>({})); throw new Error(body.error || `Error ${res.status}`); }
  return res.status === 204 ? null : res.json();
}

export const api = {
  signup: (email,password) => req("/api/auth/signup", { method:"POST", body: JSON.stringify({email,password}) }),
  login:  (email,password) => req("/api/auth/login",  { method:"POST", body: JSON.stringify({email,password}) }),
  logout: () => req("/api/auth/logout", { method:"POST" }),
  me:     () => req("/api/me"),

  getProfile: () => req("/api/profile"),
  saveProfile: (profile) => req("/api/profile", { method:"PUT", body: JSON.stringify(profile) }),

  getExLog: () => req("/api/exlog"),
  saveExLog: (name, date, sets) => req("/api/exlog", { method:"POST", body: JSON.stringify({name,date,sets}) }),

  getMeals: () => req("/api/meals"),
  getMealsByDate: (date) => req(`/api/meals?date=${encodeURIComponent(date)}`),
  addMeal: (meal) => req("/api/meals", { method:"POST", body: JSON.stringify(meal) }),
  deleteMeal: (id) => req(`/api/meals/${id}`, { method:"DELETE" }),

  getMetrics: () => req("/api/metrics"),
  saveMetric: (m) => req("/api/metrics", { method:"POST", body: JSON.stringify(m) }),

  importDump: (dump) => req("/api/import", { method:"POST", body: JSON.stringify({dump}) }),

  // IA — solo lenguaje. parseFood devuelve {nombre, gramos}; los macros los
  // resuelve el cliente contra USDA/OFF. explain redacta sobre cifras ya calculadas.
  parseFood: (text) => req("/api/ai/parse-food", { method:"POST", body: JSON.stringify({text}) }),
  explain: (recs, profile) => req("/api/ai/explain", { method:"POST", body: JSON.stringify({recs, profile}) }),
};

// Reconstruye el mismo formato del backup JSON local (profile, metrics[], exlog:*, meals:*)
// a partir de la API, para que "Exportar" siga funcionando igual que antes.
export async function exportBundleFromApi() {
  const [profile, exlog, meals, metrics] = await Promise.all([
    api.getProfile(), api.getExLog(), api.getMeals(), api.getMetrics(),
  ]);
  const dump = { profile, metrics };
  Object.entries(exlog||{}).forEach(([name,sessions]) => { dump[`exlog:${name}`] = sessions; });
  Object.entries(meals||{}).forEach(([date,items]) => { dump[`meals:${date}`] = items; });
  return dump;
}
