// ── ai.js ─────────────────────────────────────────────────────────────────────
// Capa de lenguaje. Regla dura del proyecto:
//   LOS NÚMEROS SALEN DEL CÓDIGO, LAS PALABRAS SALEN DEL MODELO.
//
// Por eso aquí el LLM hace exactamente dos cosas:
//   1) parseFood: convertir texto libre en {alimento, gramos}. Las CALORÍAS Y
//      MACROS no las inventa el modelo — el cliente los busca después en
//      USDA/Open Food Facts. El modelo solo identifica qué comiste y cuánto.
//   2) writeCoachNote: redactar en prosa recomendaciones YA CALCULADAS por
//      coach.js. Recibe las cifras hechas y tiene prohibido producir otras.

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

// Los modelos chicos alucinan con facilidad; mantener temperatura baja ayuda.
const TEMP = 0.2;

export async function parseFood(env, text) {
  if (!env.AI) throw new Error("Workers AI no está configurado.");
  const clean = String(text || "").slice(0, 500); // techo de entrada
  if (!clean.trim()) return [];

  const res = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content: [
          "Extraes alimentos de una frase en español y devuelves JSON.",
          "Para cada alimento das su nombre genérico en singular y una estimación de gramos.",
          "NUNCA devuelvas calorías, proteínas ni macros: eso se consulta en una base de datos aparte.",
          "Si la persona no dice cantidad, estima una porción típica en gramos.",
          "Usa nombres simples y buscables (ej. 'pechuga de pollo', 'arroz blanco', 'aguacate').",
          "Si la frase no contiene comida, devuelve una lista vacía.",
        ].join(" "),
      },
      { role: "user", content: clean },
    ],
    temperature: TEMP,
    response_format: {
      type: "json_schema",
      json_schema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                gramos: { type: "number" },
              },
              required: ["nombre", "gramos"],
            },
          },
        },
        required: ["items"],
      },
    },
  });

  const raw = res?.response ?? res;
  let parsed = raw;
  if (typeof raw === "string") {
    try { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/); // por si envuelve el JSON en texto
      parsed = m ? JSON.parse(m[0]) : { items: [] };
    }
  }

  // Saneado: el schema no está garantizado, así que validamos a mano.
  return (parsed?.items || [])
    .filter(it => it && typeof it.nombre === "string" && it.nombre.trim())
    .map(it => ({
      nombre: it.nombre.trim().slice(0, 80),
      gramos: Math.max(1, Math.min(2000, Math.round(Number(it.gramos) || 100))),
    }))
    .slice(0, 10);
}

export async function writeCoachNote(env, recs, profile) {
  if (!env.AI) throw new Error("Workers AI no está configurado.");
  const payload = (recs || []).slice(0, 3).map(r => ({
    titulo: r.title,
    detalle: r.detail,
    datos: r.data || {},
  }));
  if (!payload.length) return "";

  const res = await env.AI.run(MODEL, {
    messages: [
      {
        role: "system",
        content: [
          "Eres un entrenador personal escribiendo en español, tuteando, en tono directo y cálido.",
          "Recibes conclusiones YA CALCULADAS sobre la persona.",
          "REGLA ABSOLUTA: no inventes ni recalcules ninguna cifra. Usa solo los números que aparecen en los datos que te doy, tal cual.",
          "Si necesitas un número que no está en los datos, omítelo en vez de estimarlo.",
          "Escribe un solo párrafo de 3 a 5 frases que conecte las conclusiones y diga qué hacer esta semana.",
          "No uses listas, viñetas, encabezados ni emojis. No repitas literalmente el texto que te paso: reescríbelo con tus palabras.",
          "No des consejo médico ni menciones suplementos o fármacos.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          objetivo: profile?.goal || "desconocido",
          conclusiones: payload,
        }),
      },
    ],
    temperature: 0.4,
    max_tokens: 320,
  });

  const out = (res?.response ?? "").toString().trim();
  return out.slice(0, 1200);
}
