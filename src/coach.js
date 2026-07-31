// ── coach.js ──────────────────────────────────────────────────────────────────
// TODA la lógica numérica del entrenador vive aquí: progresión de cargas, volumen
// por músculo, tendencia de peso y ajuste calórico.
//
// Regla del proyecto: LOS NÚMEROS SALEN DE ESTE ARCHIVO. El LLM solo redacta
// encima de lo que aquí se calcula — nunca produce cifras.
//
// Módulo puro (sin React, sin fetch) para poder probarlo con Node directamente.

// ── Helpers de fecha (copias locales para mantener el módulo independiente) ────
export const toKey = d => d.toISOString().slice(0, 10);
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const parseKey = k => new Date(k + "T00:00:00");
const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

// ── Normalización de músculos ─────────────────────────────────────────────────
// EX_DB usa nombres descriptivos ("Pectoral superior (clavicular)", "Deltoides
// posterior"…). Para comparar contra referencias de volumen hay que colapsarlos
// a grupos canónicos.
const MUSCLE_ALIASES = [
  [/pectoral|pecho/i,                    "Pecho"],
  [/dorsal|romboide|trapecio|infraespin/i, "Espalda"],
  [/deltoi|hombro|manguito/i,            "Hombros"],
  [/b[ií]ceps|braquial|braquiorradial/i, "Bíceps"],
  [/tr[ií]ceps/i,                        "Tríceps"],
  [/cu[aá]driceps/i,                     "Cuádriceps"],
  [/isquiotibial|femoral/i,              "Isquios"],
  [/gl[uú]teo/i,                         "Glúteos"],
  [/gemelo|s[oó]leo|gastrocnemio|pantorr/i, "Gemelos"],
  [/core|abdomin|lumbar/i,               "Core"],
];
export function canonicalMuscle(name) {
  if (!name) return null;
  for (const [re, group] of MUSCLE_ALIASES) if (re.test(name)) return group;
  return null; // desconocido → se ignora en el análisis de volumen
}

// Series semanales por grupo muscular. MEV = mínimo para progresar,
// MAV = rango productivo habitual en literatura de hipertrofia.
export const VOLUME_LANDMARKS = {
  Pecho:      { mev: 10, mav: 20 },
  Espalda:    { mev: 10, mav: 20 },
  Hombros:    { mev: 8,  mav: 20 },
  Bíceps:     { mev: 8,  mav: 16 },
  Tríceps:    { mev: 8,  mav: 16 },
  Cuádriceps: { mev: 8,  mav: 18 },
  Isquios:    { mev: 8,  mav: 16 },
  Glúteos:    { mev: 6,  mav: 16 },
  Gemelos:    { mev: 8,  mav: 16 },
  Core:       { mev: 0,  mav: 16 },
};

// ── Clasificación del ejercicio → incremento de carga apropiado ───────────────
// Un salto de 2.5 kg es trivial en sentadilla y brutal en elevaciones laterales.
const LIFT_PATTERNS = [
  [/squat|sentadilla|deadlift|peso muerto|leg press|prensa|hip thrust|hack|good morning|split squat|b[uú]lgara/i, "lower_compound"],
  [/bench|banca|overhead press|press militar|ohp|row|remo|pulldown|polea al pecho|pull-?up|chin-?up|dominad|dip|fondo|landmine/i, "upper_compound"],
];
const LOAD_STEPS = {
  // pct: incremento objetivo como % de la carga · step: redondeo a discos reales
  lower_compound: { pct: 0.025, step: 2.5, min: 2.5, max: 10 },
  upper_compound: { pct: 0.020, step: 2.5, min: 2.5, max: 5 },
  isolation:      { pct: 0.030, step: 1,   min: 1,   max: 4 },
};
export function classifyLift(name = "") {
  for (const [re, cat] of LIFT_PATTERNS) if (re.test(name)) return cat;
  return "isolation";
}
export function loadStep(weight, name) {
  const cfg = LOAD_STEPS[classifyLift(name)];
  const raw = (weight || 0) * cfg.pct;
  const stepped = Math.round(raw / cfg.step) * cfg.step;
  return Math.min(cfg.max, Math.max(cfg.min, stepped || cfg.min));
}
const round1 = n => Math.round(n * 10) / 10;

// ── Progresión autorregulada por RPE ──────────────────────────────────────────
// El RPE es el dato más informativo del log: 80×8 @7 y 80×8 @9.5 exigen
// decisiones opuestas. Sin RPE caemos a una heurística por reps, avisando.
export function suggestProgression(history, repRange, exerciseName = "") {
  // No confiar en el orden de entrada: la "última sesión" debe ser la más
  // reciente por fecha, venga como venga la lista.
  const sorted = [...(history || [])].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const last = sorted.length ? sorted[sorted.length - 1] : null;
  if (!last) return null;
  const sets = (last.sets || []).filter(s => s.weight || s.reps);
  if (!sets.length) return null;

  const { lo, hi } = repRange;
  const reps = sets.map(s => s.reps).filter(r => r != null);
  if (!reps.length) return null;

  const weight = Math.max(...sets.map(s => s.weight || 0));
  const rpes = sets.map(s => s.rpe).filter(r => r != null && r > 0);
  const avgRPE = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
  const allAtTop = reps.every(r => r >= hi);
  const anyBelowLo = reps.some(r => r < lo);
  const step = loadStep(weight, exerciseName);

  // Sin RPE: heurística degradada + nudge para que empiece a registrarlo
  if (avgRPE == null) {
    if (allAtTop) return {
      action: "up", weight: round1(weight + step), tone: "good",
      txt: `Sube a ${round1(weight + step)} kg — completaste el tope de reps. Registra el RPE y la sugerencia será más precisa.`,
    };
    if (anyBelowLo) return {
      action: "hold", weight, tone: "warn",
      txt: `Mantén ${weight} kg — alguna serie no llegó a ${lo} reps.`,
    };
    return {
      action: "hold", weight, tone: "info",
      txt: `Repite ${weight} kg buscando 1 rep más por serie. Registra el RPE para afinar esto.`,
    };
  }

  // Con RPE: autorregulación real
  if (allAtTop && avgRPE <= 7) {
    const big = Math.min(LOAD_STEPS[classifyLift(exerciseName)].max, step * 2);
    return {
      action: "up", weight: round1(weight + big), tone: "good",
      txt: `Sube a ${round1(weight + big)} kg — tope de reps con RPE ${round1(avgRPE)}, te sobró margen para un salto doble.`,
    };
  }
  if (allAtTop && avgRPE <= 9) return {
    action: "up", weight: round1(weight + step), tone: "good",
    txt: `Sube a ${round1(weight + step)} kg — tope de reps con RPE ${round1(avgRPE)}.`,
  };
  if (allAtTop) return {
    action: "hold", weight, tone: "warn",
    txt: `Mantén ${weight} kg — llegaste al tope pero con RPE ${round1(avgRPE)}. Consolida antes de subir.`,
  };
  if (anyBelowLo && avgRPE >= 9.5) {
    const down = round1(weight - loadStep(weight, exerciseName) * 2);
    return {
      action: "down", weight: down, tone: "bad",
      txt: `Baja a ${down} kg — no llegaste a ${lo} reps y el RPE fue ${round1(avgRPE)}. La carga está por encima de lo que puedes sostener.`,
    };
  }
  if (avgRPE <= 8) return {
    action: "hold", weight, tone: "info",
    txt: `Mantén ${weight} kg y suma reps — RPE ${round1(avgRPE)} deja margen dentro del rango.`,
  };
  return {
    action: "hold", weight, tone: "info",
    txt: `Mantén ${weight} kg — RPE ${round1(avgRPE)}, sigue acumulando reps en el rango.`,
  };
}

// ── Volumen semanal por músculo ───────────────────────────────────────────────
// Cuenta series efectivas por grupo canónico. Las secundarias cuentan 0.5
// (convención habitual: una serie de remo no estimula el bíceps como un curl).
export function weeklySetsByMuscle(logs, muscleMap, { weeks = 4, now = new Date() } = {}) {
  const since = toKey(addDays(now, -7 * weeks));
  const totals = {};
  Object.entries(logs || {}).forEach(([name, sessions]) => {
    const map = muscleMap[name];
    if (!map) return; // ejercicio sin datos musculares (p.ej. alternativa de swap)
    sessions.filter(s => s.date >= since).forEach(s => {
      const n = (s.sets || []).filter(x => x.weight || x.reps).length;
      (map.primary || []).forEach(m => {
        const g = canonicalMuscle(m); if (g) totals[g] = (totals[g] || 0) + n;
      });
      (map.secondary || []).forEach(m => {
        const g = canonicalMuscle(m); if (g) totals[g] = (totals[g] || 0) + n * 0.5;
      });
    });
  });
  // A promedio semanal
  const perWeek = {};
  Object.entries(totals).forEach(([g, v]) => { perWeek[g] = round1(v / weeks); });
  return perWeek;
}

// ── Tendencia de peso corporal (regresión lineal) ─────────────────────────────
// Usar el dato del día es ruido (agua, sal, hora). La pendiente sobre varias
// semanas es lo único accionable.
export function weightTrend(metrics, { windowDays = 28 } = {}) {
  const pts = (metrics || [])
    .filter(m => m && m.date && m.weight != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 4) return null;

  const lastDate = pts[pts.length - 1].date;
  const win = pts.filter(m => daysBetween(m.date, lastDate) <= windowDays);
  if (win.length < 4) return null;

  const spanDays = daysBetween(win[0].date, win[win.length - 1].date);
  if (spanDays < 14) return null; // menos de 2 semanas no dice nada

  const x = win.map(m => daysBetween(win[0].date, m.date));
  const y = win.map(m => m.weight);
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const den = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  if (!den) return null;
  const slopePerDay = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / den;

  return {
    kgPerWeek: round1(slopePerDay * 7),
    spanDays,
    points: n,
    currentWeight: round1(y[y.length - 1]),
  };
}

// Ritmo esperado por objetivo, como % del peso corporal por semana.
const RATE_BANDS = {
  cut:      { target: -0.007, lo: -0.012, hi: -0.003 },
  maintain: { target: 0,      lo: -0.0025, hi: 0.0025 },
  bulk:     { target: 0.003,  lo: 0.001,  hi: 0.005 },
};
const KCAL_PER_KG = 7700;

// Ajuste calórico a partir de la tendencia real vs. la esperada.
export function calorieAdjustment(trend, goal) {
  const band = RATE_BANDS[goal];
  if (!trend || !band) return null;
  const bw = trend.currentWeight;
  if (!bw) return null;

  const actual = trend.kgPerWeek;
  const loKg = band.lo * bw, hiKg = band.hi * bw, targetKg = band.target * bw;
  if (actual >= loKg && actual <= hiKg) {
    return { onTrack: true, kcalDelta: 0, actualKgPerWeek: actual, trend };
  }
  const gapKg = targetKg - actual;                       // + → hay que comer más
  let delta = (gapKg * KCAL_PER_KG) / 7;                 // kcal/día
  delta = Math.max(-250, Math.min(250, delta));          // cambios conservadores
  delta = Math.round(delta / 25) * 25;
  return {
    onTrack: false,
    kcalDelta: delta,
    actualKgPerWeek: actual,
    expectedRange: [round1(loKg), round1(hiKg)],
    trend,
  };
}

// ── Meseta real (ventana larga, exigiendo que el volumen se haya sostenido) ───
export function detectPlateau(sessions, { windowDays = 42, minSessions = 4, now = new Date() } = {}) {
  const e1rm = (w, r) => w * (1 + Math.max(r, 0) / 30);
  const since = toKey(addDays(now, -windowDays));
  const hist = (sessions || [])
    .filter(s => s.date >= since && (s.sets || []).some(x => x.weight && x.reps))
    .sort((a, b) => (a.date || "").localeCompare(b.date || "")); // cronológico o el "antes/después" se invierte
  if (hist.length < minSessions) return null;

  const mid = Math.floor(hist.length / 2);
  const best = arr => Math.max(...arr.flatMap(s => s.sets.map(x => e1rm(x.weight || 0, x.reps || 0))));
  const setsOf = arr => arr.reduce((a, s) => a + s.sets.filter(x => x.weight || x.reps).length, 0);

  const firstHalf = hist.slice(0, mid), secondHalf = hist.slice(mid);
  const b1 = best(firstHalf), b2 = best(secondHalf);
  // Si el volumen cayó, no es meseta — es que entrenaste menos.
  if (setsOf(secondHalf) < setsOf(firstHalf) * 0.8) return null;
  if (b2 > b1 * 1.005) return null;

  return { from: round1(b1), to: round1(b2), sessions: hist.length, windowDays };
}

// ── Alimentos ricos en proteína del propio historial del usuario ──────────────
// En vez de recitar "un huevo tiene Xg", mira lo que la persona ya come.
export function topProteinFoods(meals, { limit = 3, minDensity = 0.12 } = {}) {
  const byName = {};
  Object.values(meals || {}).flat().forEach(m => {
    if (!m?.name || !m.grams || !m.protein) return;
    const density = m.protein / m.grams; // g proteína por g de alimento
    if (density < minDensity) return;
    const cur = byName[m.name] || { name: m.name, count: 0, density };
    cur.count++;
    byName[m.name] = cur;
  });
  return Object.values(byName)
    .sort((a, b) => b.count - a.count || b.density - a.density)
    .slice(0, limit);
}

// ── Motor de recomendaciones ──────────────────────────────────────────────────
// Devuelve como máximo `max` tarjetas, ordenadas por impacto. Cada una lleva
// `data` con las cifras crudas para que la capa de redacción (LLM) las use tal cual.
export function buildRecommendations({ logs = {}, meals = {}, metrics = [], targets, profile, muscleMap = {}, max = 3, now = new Date() }) {
  const recs = [];

  // 1) Tendencia de peso vs. objetivo — la señal más accionable que existe.
  const trend = weightTrend(metrics);
  const adj = calorieAdjustment(trend, profile?.goal);
  if (adj && !adj.onTrack) {
    const up = adj.kcalDelta > 0;
    recs.push({
      id: "calorie-adjust", priority: 100, icon: up ? "🔺" : "🔻", tone: "warn",
      title: up ? "Come más: vas más rápido de lo previsto" : "Ajusta calorías: el peso no se mueve como debería",
      detail: `Tu peso cambia ${adj.actualKgPerWeek} kg/semana (medido sobre ${trend.spanDays} días, ${trend.points} registros). Para tu objetivo el rango esperado es ${adj.expectedRange[0]} a ${adj.expectedRange[1]} kg/semana. Ajusta tu ingesta en ${up ? "+" : ""}${adj.kcalDelta} kcal/día y vuelve a evaluar en 2 semanas.`,
      data: { actualKgPerWeek: adj.actualKgPerWeek, expectedRange: adj.expectedRange, kcalDelta: adj.kcalDelta, spanDays: trend.spanDays, currentTargetKcal: targets?.kcal },
    });
  } else if (adj && adj.onTrack) {
    recs.push({
      id: "on-track", priority: 20, icon: "✅", tone: "good",
      title: "Vas en ritmo",
      detail: `Tu peso cambia ${adj.actualKgPerWeek} kg/semana, dentro de lo esperado para tu objetivo. No cambies nada todavía.`,
      data: { actualKgPerWeek: adj.actualKgPerWeek, kcalDelta: 0 },
    });
  } else if ((metrics || []).length < 4) {
    recs.push({
      id: "need-metrics", priority: 60, icon: "⚖️", tone: "info",
      title: "Faltan pesajes para poder ajustar",
      detail: "Con 4 pesajes repartidos en al menos 2 semanas puedo calcular tu tendencia real y decirte cuántas calorías mover. Hoy no hay datos suficientes.",
      data: { have: (metrics || []).length, need: 4 },
    });
  }

  // 2) Volumen por músculo contra referencias reales (no contra el propio plan).
  const perWeek = weeklySetsByMuscle(logs, muscleMap, { weeks: 4, now });
  const anyVolume = Object.values(perWeek).some(v => v > 0);
  if (anyVolume) {
    Object.entries(VOLUME_LANDMARKS).forEach(([group, { mev, mav }]) => {
      if (mev <= 0) return;
      const act = perWeek[group] || 0;
      if (act < mev) {
        recs.push({
          id: `volume-${group}`, priority: act === 0 ? 55 : 70, icon: "💪", tone: "warn",
          title: `${group}: por debajo del mínimo efectivo`,
          detail: `Promedias ${act} series semanales de ${group} en las últimas 4 semanas. El mínimo para progresar ronda ${mev} y el rango productivo va hasta ${mav}. Añade ${Math.ceil(mev - act)} series semanales.`,
          data: { group, actualSetsPerWeek: act, mev, mav, addSets: Math.ceil(mev - act) },
        });
      }
    });
  }

  // 3) Meseta real por ejercicio.
  Object.entries(logs).forEach(([name, sessions]) => {
    const p = detectPlateau(sessions, { now });
    if (!p) return;
    recs.push({
      id: `plateau-${name}`, priority: 65, icon: "📉", tone: "bad",
      title: `Meseta en ${name}`,
      detail: `Tu 1RM estimado pasó de ${p.from} a ${p.to} kg en ${p.sessions} sesiones durante las últimas ${p.windowDays / 7} semanas, manteniendo el volumen. Toca cambiar algo: una semana de descarga, variar el ejercicio, o revisar sueño y calorías.`,
      data: { exercise: name, from: p.from, to: p.to, sessions: p.sessions, weeks: p.windowDays / 7 },
    });
  });

  // 4) Proteína — anclada en lo que la persona realmente come.
  const since14 = toKey(addDays(now, -14));
  const mealDates = Object.keys(meals).filter(d => d >= since14).sort();
  if (mealDates.length >= 3 && targets?.protein) {
    const avgProtein = mealDates.reduce((a, d) => a + meals[d].reduce((s, m) => s + (m.protein || 0), 0), 0) / mealDates.length;
    if (avgProtein < targets.protein * 0.85) {
      const gap = Math.round(targets.protein - avgProtein);
      const favs = topProteinFoods(meals);
      const hint = favs.length
        ? `De lo que ya comes, lo más denso en proteína es ${favs.map(f => f.name).join(", ")} — subir una porción de eso es el camino de menor fricción.`
        : `Aún no tienes suficientes alimentos registrados como para sugerirte un cambio concreto sobre tu propia dieta.`;
      recs.push({
        id: "protein-gap", priority: 80, icon: "🥩", tone: "warn",
        title: "Proteína por debajo del objetivo",
        detail: `Promedias ${Math.round(avgProtein)} g/día frente a un objetivo de ${targets.protein} g (${mealDates.length} días con registro). Te faltan ${gap} g diarios. ${hint}`,
        data: { avgProtein: Math.round(avgProtein), targetProtein: targets.protein, gap, favorites: favs.map(f => f.name) },
      });
    }
  } else if (mealDates.length < 3) {
    recs.push({
      id: "need-meals", priority: 40, icon: "📋", tone: "info",
      title: "Faltan días de registro nutricional",
      detail: "Con 3 o más días registrados en las últimas 2 semanas puedo comparar tu ingesta real contra tus objetivos.",
      data: { have: mealDates.length, need: 3 },
    });
  }

  return recs.sort((a, b) => b.priority - a.priority).slice(0, max);
}
