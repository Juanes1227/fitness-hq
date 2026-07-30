import { useState, useEffect, useCallback, useMemo } from "react";

const T = {
  bg:"#060810", surface:"#0b1022", card:"#0d1228", border:"#192040",
  blue:"#3b82f6", green:"#10b981", amber:"#f59e0b",
  purple:"#8b5cf6", cyan:"#06b6d4", red:"#ef4444", pink:"#ec4899",
  white:"#dde4f2", muted:"#4e607a", dim:"#222d42",
  font:"'Barlow Condensed','Arial Narrow',Arial,sans-serif",
  mono:"monospace",
};

const TARGETS = { kcal:2600, protein:175, carbs:280, fat:75 };
const MEAL_TYPES = [
  {id:"breakfast",l:"Desayuno",icon:"🌅"},
  {id:"lunch",    l:"Almuerzo",icon:"☀️"},
  {id:"dinner",   l:"Cena",    icon:"🌙"},
  {id:"snack",    l:"Snack",   icon:"⚡"},
];

const WGER   = "https://wger.de/api/v2";
const USDA_K = "DEMO_KEY";
const USDA   = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF    = "https://world.openfoodfacts.org/cgi/search.pl";

const ROUTINE = {
  legs: {
    label:"PIERNA (LEGS)", day:"LUNES", color:"#f59e0b", icon:"🏋️",
    note:"Descanso 2–3 min en compuestos. 90 seg en máquinas.",
    slots:[
      {id:"l1",name:"Barbell Back Squat",    es:"Sentadilla con Barra",        sets:4,reps:"6–8",  note:"RPE 8–9",  cat:9, search:"barbell squat"},
      {id:"l2",name:"Romanian Deadlift",     es:"Peso Muerto Rumano",          sets:4,reps:"8–10", note:"2–3 min",  cat:9, search:"romanian deadlift"},
      {id:"l3",name:"Leg Press Machine",     es:"Prensa de Pierna",            sets:3,reps:"10–12",note:"Máquina",  cat:9, search:"leg press"},
      {id:"l4",name:"Leg Curl Machine",      es:"Curl Femoral en Máquina",     sets:3,reps:"12–15",note:"Isquios",  cat:9, search:"leg curl"},
      {id:"l5",name:"Standing Calf Raise",   es:"Gemelo de Pie en Máquina",    sets:4,reps:"20–25",note:"Lento",    cat:14,search:"calf raise"},
    ]
  },
  push: {
    label:"EMPUJE (PUSH)", day:"MIÉRCOLES", color:"#10b981", icon:"🏋️",
    note:"Iniciar con barra fresco. Pec Deck al final cuando ya hay fatiga.",
    slots:[
      {id:"s1",name:"Barbell Bench Press",   es:"Press de Banca con Barra",    sets:4,reps:"6–8",  note:"RPE 8",   cat:11,search:"bench press barbell"},
      {id:"s2",name:"Barbell Overhead Press",es:"Press Militar con Barra",     sets:4,reps:"8–10", note:"De pie",  cat:13,search:"overhead press barbell"},
      {id:"s3",name:"Incline Dumbbell Press",es:"Press Inclinado Mancuerna",   sets:3,reps:"10–12",note:"45°",     cat:11,search:"incline dumbbell press"},
      {id:"s4",name:"Pec Deck / Cable Fly",  es:"Pec Deck o Apertura en Cable",sets:3,reps:"12–15",note:"Máquina", cat:11,search:"pec deck"},
      {id:"s5",name:"Tricep Pushdown Cable", es:"Extensión Tríceps en Polea",  sets:3,reps:"12–15",note:"Polea alta",cat:8,search:"tricep pushdown cable"},
    ]
  },
  pull: {
    label:"TRACCIÓN (PULL)", day:"VIERNES", color:"#3b82f6", icon:"🏋️",
    note:"Sábado de descanso — puedes ir a fondo sin preocuparte por recuperación inmediata.",
    slots:[
      {id:"p1",name:"Barbell Bent-Over Row", es:"Remo con Barra Inclinado",    sets:4,reps:"6–8",  note:"RPE 8–9",     cat:12,search:"barbell row bent over"},
      {id:"p2",name:"Lat Pulldown",          es:"Polea al Pecho Agarre Abierto",sets:4,reps:"10–12",note:"Cable",       cat:12,search:"lat pulldown"},
      {id:"p3",name:"Seated Cable Row",      es:"Remo en Polea Sentado",       sets:3,reps:"10–12",note:"Agarre neutro",cat:12,search:"seated cable row"},
      {id:"p4",name:"Face Pull Cable",       es:"Face Pull en Cable",          sets:3,reps:"15–20",note:"Rot. externa", cat:13,search:"face pull cable"},
      {id:"p5",name:"EZ Bar Biceps Curl",    es:"Curl con Barra EZ",           sets:3,reps:"10–12",note:"Control exc.", cat:8, search:"bicep curl ez bar"},
    ]
  },
};

const SCHEDULE = [
  {lbl:"Lun",icon:"🏋️",key:"legs", title:"PIERNA",  sub:"Squat · RDL · Prensa",   color:"#f59e0b"},
  {lbl:"Mar",icon:"🏊",key:"swim1",title:"NATACIÓN", sub:">1km técnica",            color:"#06b6d4"},
  {lbl:"Mié",icon:"🏋️",key:"push", title:"PUSH",    sub:"Banca · OHP · Cable",     color:"#10b981"},
  {lbl:"Jue",icon:"🏊",key:"swim2",title:"NATACIÓN", sub:">1km fondo",              color:"#06b6d4"},
  {lbl:"Vie",icon:"🏋️",key:"pull", title:"PULL",    sub:"Remo · Polea · EZ Bar",   color:"#3b82f6"},
  {lbl:"Sáb",icon:"🌙",key:"rest", title:"DESCANSO", sub:"Carb loading",            color:"#8b5cf6"},
  {lbl:"Dom",icon:"🚴",key:"ride", title:"CICLISMO", sub:">50km Road",              color:"#f59e0b"},
];

// ── Date helpers ──────────────────────────────────────────────────────────────
const toKey  = d => d.toISOString().slice(0,10);
const today  = () => new Date();
const addDays= (d,n) => { const r=new Date(d); r.setDate(r.getDate()+n); return r; };
const sameDay= (a,b) => toKey(a)===toKey(b);
const dow    = d => (d.getDay()+6)%7;
const weekOf = d => { const m=addDays(d,-dow(d)); return Array.from({length:7},(_,i)=>addDays(m,i)); };
const fmt    = d => d.toLocaleDateString("es-CO",{day:"2-digit",month:"short"});

// ── Storage (localStorage) ────────────────────────────────────────────────────
const store = {
  get: async (k) => {
    try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch { return null; }
  },
  set: async (k,v) => {
    try { localStorage.setItem(k,JSON.stringify(v)); } catch {}
  },
};

// ── wger API ──────────────────────────────────────────────────────────────────
async function wgerSearch(term) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    // Sin filtro de idioma para maximizar resultados; base_id es el ID canónico
    const res = await fetch(
      `${WGER}/exercisesearch/?term=${encodeURIComponent(term)}&format=json`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const data = await res.json();
    const primary = (data.suggestions||[])
      .filter(s => s.data?.base_id || s.data?.id)
      .slice(0, 10)
      .map(s => ({ id: s.data.base_id ?? s.data.id, name: s.value }));
    if (primary.length) return primary;

    // Fallback: buscar por nombre en exercisetranslation (inglés = language 2)
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 8000);
    const res2 = await fetch(
      `${WGER}/exercisetranslation/?format=json&language=2&limit=15`,
      { signal: ctrl2.signal }
    );
    clearTimeout(t2);
    const data2 = await res2.json();
    const low = term.toLowerCase();
    return (data2.results||[])
      .filter(r => r.name?.toLowerCase().includes(low))
      .slice(0, 10)
      .map(r => ({ id: r.exercise, name: r.name }));
  } catch { return []; }
}

async function wgerInfo(id) {
  try {
    const res  = await fetch(`${WGER}/exerciseinfo/${id}/?format=json`);
    const data = await res.json();
    const tr   = (data.translations||[]).find(t=>t.language===2)||data.translations?.[0]||{};
    const desc = (tr.description||"").replace(/<[^>]+>/g,"").trim();
    return {
      name: tr.name||"",
      description: desc,
      category: data.category?.name||"",
      muscles: (data.muscles||[]).map(m=>m.name_en||m.name).filter(Boolean),
      musclesSecondary: (data.muscles_secondary||[]).map(m=>m.name_en||m.name).filter(Boolean),
      equipment: (data.equipment||[]).map(e=>e.name).filter(Boolean),
      images: (data.images||[]).map(i=>i.image).filter(Boolean),
    };
  } catch { return null; }
}

// ── Nutrition APIs ────────────────────────────────────────────────────────────
async function searchUSDA(q) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    // Branded + Foundation + SR Legacy + Survey para cubrir alimentos procesados y crudos
    const r = await fetch(
      `${USDA}?query=${encodeURIComponent(q)}&api_key=${USDA_K}&pageSize=8&dataType=Foundation,SR%20Legacy,Survey%20(FNDDS),Branded`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const d = await r.json();
    if (d.error) return []; // DEMO_KEY rate-limited
    return (d.foods||[]).map(f=>{
      const g=id=>{const n=(f.foodNutrients||[]).find(n=>n.nutrientId===id);return n?Math.round(n.value*10)/10:0;};
      return {id:`u${f.fdcId}`,name:f.description,src:"USDA",per100:{kcal:g(1008),protein:g(1003),carbs:g(1005),fat:g(1004)}};
    }).filter(f=>f.per100.kcal>0);
  } catch{return[];}
}

async function searchOFF(q) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    // Sin cc=co: busca en la base global (>3M productos) no solo Colombia
    // lc=es prioriza nombres en español pero incluye todo
    const r = await fetch(
      `${OFF}?search_terms=${encodeURIComponent(q)}&action=process&json=1&page_size=15&fields=product_name,nutriments,brands,countries_tags`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    const d = await r.json();
    return (d.products||[]).filter(p=>p.product_name&&p.nutriments).map(p=>{
      const n=p.nutriments;
      // energy-kcal_100g directa; si no, convertir kJ (energy_100g)
      const kcal = Math.round(n["energy-kcal_100g"] || (n["energy_100g"]||0)/4.184);
      const co = (p.countries_tags||[]).some(c=>c.includes("colombia"))?"🇨🇴 ":"🌍 ";
      return {id:`o${p.code}`,name:p.product_name,src:co+"OFF",
        per100:{kcal,protein:Math.round((n.proteins_100g||0)*10)/10,
                carbs:Math.round((n.carbohydrates_100g||0)*10)/10,fat:Math.round((n.fat_100g||0)*10)/10}};
    }).filter(f=>f.per100.kcal>0).slice(0,12);
  } catch{return[];}
}

// ── Micro-components ──────────────────────────────────────────────────────────
const Pill = ({c=T.muted,children,sm}) => (
  <span style={{fontSize:sm?8:9,fontWeight:700,letterSpacing:.5,padding:sm?"1px 5px":"2px 7px",borderRadius:3,
    textTransform:"uppercase",whiteSpace:"nowrap",background:c+"22",color:c+"ee",border:`1px solid ${c}44`,display:"inline-block"}}>{children}</span>
);

const Bar = ({label,val,max,color}) => {
  const pct=Math.min(100,Math.round(val/max*100));
  return (
    <div style={{marginBottom:7}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:T.muted}}>{label}</span>
        <span style={{fontSize:10,fontWeight:700,color:pct>=100?color:T.white}}>{val}g<span style={{color:T.muted,fontWeight:400,fontSize:9}}>/{max}g</span></span>
      </div>
      <div style={{height:4,background:T.dim,borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:pct>=100?color:color+"99",borderRadius:3,transition:"width .4s"}}/>
      </div>
    </div>
  );
};

const Ring = ({val,max}) => {
  const pct=Math.min(1,val/max),r=38,c=2*Math.PI*r;
  const col=val>max?T.red:pct>.85?T.amber:T.green;
  return (
    <div style={{position:"relative",width:88,height:88,flexShrink:0}}>
      <svg width="88" height="88" viewBox="0 0 88 88" style={{transform:"rotate(-90deg)"}}>
        <circle cx="44" cy="44" r={r} fill="none" stroke={T.dim} strokeWidth="6"/>
        <circle cx="44" cy="44" r={r} fill="none" stroke={col} strokeWidth="6"
          strokeDasharray={c} strokeDashoffset={c*(1-pct)} strokeLinecap="round"/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{fontFamily:T.mono,fontSize:15,fontWeight:700,color:col,lineHeight:1}}>{val}</div>
        <div style={{fontSize:7,color:T.muted,letterSpacing:1}}>KCAL</div>
        <div style={{fontSize:7,color:T.muted}}>/{max}</div>
      </div>
    </div>
  );
};

// ── Week Nav shared component ─────────────────────────────────────────────────
function WeekNav({selDate, onSelect}) {
  const [ws,setWs] = useState(()=>addDays(selDate,-dow(selDate)));
  const days = useMemo(()=>Array.from({length:7},(_,i)=>addDays(ws,i)),[ws]);
  const td   = today();
  return (
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 10px 8px",marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <button onClick={()=>setWs(d=>addDays(d,-7))} style={btnStyle}>‹</button>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:2,color:T.muted,textTransform:"uppercase"}}>{fmt(days[0])} — {fmt(days[6])}</span>
        <button onClick={()=>setWs(d=>addDays(d,7))}  style={btnStyle}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
        {days.map((d,i)=>{
          const s=SCHEDULE[i],isSel=sameDay(d,selDate),isTod=sameDay(d,td);
          return (
            <button key={i} onClick={()=>onSelect(d)}
              style={{background:isSel?s.color+"33":"none",border:`2px solid ${isSel?s.color:isTod?T.muted+"55":T.border}`,
                borderRadius:8,padding:"5px 2px 6px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
              <span style={{fontSize:7,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:isSel?s.color:T.muted}}>{s.lbl}</span>
              <span style={{fontSize:14,lineHeight:1}}>{s.icon}</span>
              <span style={{fontSize:9,fontWeight:700,color:isSel?T.white:T.muted}}>{d.getDate()}</span>
              {isTod&&<span style={{width:4,height:4,borderRadius:"50%",background:s.color}}/>}
            </button>
          );
        })}
      </div>
      <div style={{marginTop:7,textAlign:"center",fontSize:9,color:T.muted}}>
        {fmt(selDate)} — {SCHEDULE[dow(selDate)].icon} <span style={{color:SCHEDULE[dow(selDate)].color,fontWeight:700}}>{SCHEDULE[dow(selDate)].title}</span> · {SCHEDULE[dow(selDate)].sub}
      </div>
    </div>
  );
}
const btnStyle={background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"3px 10px",color:T.muted,cursor:"pointer",fontSize:16,lineHeight:1};

// ── wger Drawer ───────────────────────────────────────────────────────────────
function WgerDrawer({exId,exName,color,onClose}) {
  const [info,setInfo]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ if(!exId){setLoading(false);return;} wgerInfo(exId).then(d=>{setInfo(d);setLoading(false);}); },[exId]);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:300,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div style={{background:T.surface,border:`1px solid ${color}44`,borderRadius:"14px 14px 0 0",width:"100%",maxHeight:"70vh",overflow:"auto",padding:18}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color,textTransform:"uppercase",marginBottom:2}}>wger.de · Base de Datos de Ejercicios</div>
            <div style={{fontFamily:"Impact,sans-serif",fontSize:18,color:"#fff"}}>{exName}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.muted,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        {loading&&<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:11}}>Cargando desde wger.de…</div>}
        {info&&(
          <>
            {info.images.length>0&&(
              <div style={{display:"flex",gap:8,marginBottom:14,overflow:"auto"}}>
                {info.images.slice(0,3).map((img,i)=>(
                  <img key={i} src={img} alt={info.name} style={{height:100,borderRadius:8,border:`1px solid ${T.border}`,objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
                ))}
              </div>
            )}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              {info.category&&<Pill c={color}>{info.category}</Pill>}
              {info.equipment.map(e=><Pill key={e} c={T.purple}>{e}</Pill>)}
              {info.muscles.map(m=><Pill key={m} c={T.blue}>{m}</Pill>)}
              {info.musclesSecondary.map(m=><Pill key={m} c={T.muted} sm>{m}</Pill>)}
            </div>
            {info.description&&(
              <div style={{background:T.card,borderRadius:8,padding:12,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:T.muted,marginBottom:6}}>INSTRUCCIONES</div>
                <div style={{fontSize:11,color:T.white,lineHeight:1.7}}>{info.description}</div>
              </div>
            )}
          </>
        )}
        {!info&&!loading&&<div style={{textAlign:"center",padding:"16px 0",color:T.muted,fontSize:11}}>Sin datos en wger para este ejercicio.</div>}
      </div>
    </div>
  );
}

// ── Swap Drawer ───────────────────────────────────────────────────────────────
function SwapDrawer({slot,color,onSwap,onClose}) {
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(true);
  const [q,setQ]=useState(slot.search||slot.name);
  const doSearch=async(term)=>{ setLoading(true); const r=await wgerSearch(term); setResults(r); setLoading(false); };
  useEffect(()=>{ doSearch(q); },[]);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:200,display:"flex",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{background:T.surface,border:`1px solid ${color}33`,borderRadius:"14px 0 0 14px",width:"min(380px,94vw)",height:"100%",overflow:"auto",padding:16,display:"flex",flexDirection:"column",gap:8}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color,textTransform:"uppercase"}}>ALTERNATIVAS · wger.de</div>
            <div style={{fontFamily:"Impact,sans-serif",fontSize:15,color:"#fff"}}>{slot.name}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.muted,fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:6}}>
          <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch(q)}
            style={{flex:1,background:T.card,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 10px",color:T.white,fontSize:11,outline:"none",fontFamily:T.font}}/>
          <button onClick={()=>doSearch(q)} style={{background:color+"22",border:`1px solid ${color}44`,borderRadius:6,padding:"7px 12px",color,fontSize:11,cursor:"pointer",fontWeight:700}}>🔍</button>
        </div>
        {loading&&<div style={{textAlign:"center",padding:"16px 0",color:T.muted,fontSize:11}}>Buscando en wger.de…</div>}
        <div style={{display:"flex",flexDirection:"column",gap:5,flex:1,overflow:"auto"}}>
          {results.map(ex=>(
            <div key={ex.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#fff",marginBottom:3}}>{ex.name}</div>
                <Pill c={T.cyan} sm>wger #{ex.id}</Pill>
              </div>
              <button onClick={()=>onSwap(slot.id,ex)} style={{background:color+"22",border:`1px solid ${color}44`,borderRadius:6,color,fontSize:9,fontWeight:700,padding:"4px 8px",cursor:"pointer",textTransform:"uppercase",marginLeft:6}}>USAR</button>
            </div>
          ))}
          {!loading&&results.length===0&&<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:11}}>Sin resultados. Prueba otro término.</div>}
        </div>
      </div>
    </div>
  );
}

// ── Exercise Card ─────────────────────────────────────────────────────────────
function ExCard({slot,override,color,onSwap,onDetail}) {
  const name=override?.name||slot.name;
  return (
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",display:"flex",gap:8,alignItems:"center",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:color}}/>
      <div style={{background:color+"11",border:`1px solid ${color}33`,borderRadius:7,padding:"6px 8px",textAlign:"center",flexShrink:0,minWidth:48}}>
        <div style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color,lineHeight:1}}>{slot.sets}</div>
        <div style={{fontSize:7,color:T.muted,letterSpacing:1}}>SERIES</div>
        <div style={{fontSize:9,fontWeight:700,color:T.white,marginTop:2}}>{slot.reps}</div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:700,color:"#fff",lineHeight:1.2,marginBottom:3}}>{name}</div>
        <div style={{fontSize:9,fontStyle:"italic",color:T.muted,marginBottom:4}}>{override?`alternativa wger #${override.id}`:slot.es}</div>
        <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
          <Pill c={color} sm>{slot.note}</Pill>
          {override&&<Pill c={T.cyan} sm>wger</Pill>}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
        <button onClick={()=>onSwap(slot)} style={{background:"none",border:`1px solid ${color}44`,borderRadius:5,color:color+"cc",fontSize:8,fontWeight:700,padding:"3px 6px",cursor:"pointer",textTransform:"uppercase"}}>SWAP</button>
        <button onClick={()=>onDetail(override?.id||null,name)} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:5,color:T.muted,fontSize:8,fontWeight:700,padding:"3px 6px",cursor:"pointer",textTransform:"uppercase"}}>INFO</button>
      </div>
    </div>
  );
}

// ── Day content ───────────────────────────────────────────────────────────────
const DAY_INFO = {
  swim1:{icon:"🏊",title:"Natación · Martes",color:"#06b6d4",items:["Objetivo: >1 km, técnica y pace controlado","Enfócate en stroke mechanics, no en velocidad máxima","Útil: pull buoy + aletas para segmentos de técnica","Intensidad: 65–70% FCmax — recuperación activa","Hidratación: mínimo 500ml antes de entrar al agua"]},
  swim2:{icon:"🏊",title:"Natación · Jueves",color:"#06b6d4",items:["Objetivo: >1 km — puede ser más intenso que el martes","Variación: intervalos 100m o 200m con descanso activo","Intensidad: 70–80% FCmax — fuerza aeróbica","Este es el 'harder swim' de la semana","Deja espacio para recuperar el viernes (PULL)"]},
  rest:{icon:"🌙",title:"Sábado · Sacred Rest",color:"#8b5cf6",items:["Descanso total — sin entrenamiento de ningún tipo","Carb loading: 6–8g carbos por kg de peso corporal","Dormir ≥8 horas — la noche antes del ciclismo es crítica","Hidratación activa: 3–4L agua + electrolitos","Preparar el kit de ciclismo para el domingo"]},
  ride:{icon:"🚴",title:"Domingo · Ciclismo",color:"#f59e0b",items:[">50 km en ruta — ritmo conversacional en Z2","Ritmo: 65–75% FCmax para desarrollo aeróbico de base","Nutrición en bici: 60g carbos/hora después de 45 min","Hidratación: 500–750ml/hora según el calor de Medellín","Post-ride: proteína + carbos dentro de los 30 minutos"]},
};

function DayContent({dayKey,swaps,onSwap,onDetail,color}) {
  const routine=ROUTINE[dayKey];
  if(routine) return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color,textTransform:"uppercase"}}>{routine.day}</div>
          <div style={{fontFamily:"Impact,sans-serif",fontSize:18,color:"#fff"}}>{routine.label}</div>
        </div>
        <div style={{display:"flex",gap:5}}>
          <div style={{background:color+"11",border:`1px solid ${color}33`,borderRadius:7,padding:"5px 10px",textAlign:"center"}}>
            <div style={{fontFamily:T.mono,fontSize:16,fontWeight:700,color}}>{routine.slots.reduce((a,s)=>a+s.sets,0)}</div>
            <div style={{fontSize:7,color:T.muted,letterSpacing:1}}>SERIES</div>
          </div>
          <div style={{background:color+"11",border:`1px solid ${color}33`,borderRadius:7,padding:"5px 10px",textAlign:"center"}}>
            <div style={{fontFamily:T.mono,fontSize:16,fontWeight:700,color}}>{routine.slots.length}</div>
            <div style={{fontSize:7,color:T.muted,letterSpacing:1}}>EJERC.</div>
          </div>
        </div>
      </div>
      {routine.note&&(
        <div style={{background:color+"11",border:`1px solid ${color}33`,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:10,color:color+"cc"}}>
          💡 {routine.note}
        </div>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {routine.slots.map(slot=>(
          <ExCard key={slot.id} slot={slot} override={swaps[slot.id]||null} color={color} onSwap={onSwap} onDetail={onDetail}/>
        ))}
      </div>
      {Object.keys(swaps).length>0&&(
        <div style={{marginTop:10,textAlign:"center"}}>
          <Pill c={T.cyan}>{Object.keys(swaps).length} ejercicio(s) cambiado(s) · wger.de</Pill>
        </div>
      )}
    </div>
  );
  const info=DAY_INFO[dayKey];
  if(!info) return null;
  return (
    <div style={{background:T.card,border:`1px solid ${info.color}33`,borderRadius:12,padding:16}}>
      <div style={{fontFamily:"Impact,sans-serif",fontSize:20,color:"#fff",marginBottom:12}}>{info.icon} {info.title}</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {info.items.map((item,i)=>(
          <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{width:20,height:20,background:info.color+"22",border:`1px solid ${info.color}44`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:9,fontWeight:700,color:info.color}}>{i+1}</div>
            <span style={{fontSize:11,color:T.white,lineHeight:1.5,marginTop:2}}>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── WORKOUT MODULE ────────────────────────────────────────────────────────────
function WorkoutModule() {
  const [selDate,setSelDate]=useState(today());
  const [swaps,setSwaps]=useState({});
  const [swapTarget,setSwapTarget]=useState(null);
  const [detailId,setDetailId]=useState(null);
  const [detailName,setDetailName]=useState("");
  const sched=SCHEDULE[dow(selDate)];
  function handleSwap(slot){setSwapTarget({slot,color:sched.color});}
  function applySwap(slotId,ex){setSwaps(s=>({...s,[slotId]:ex}));setSwapTarget(null);}
  return (
    <div>
      <WeekNav selDate={selDate} onSelect={setSelDate}/>
      <DayContent dayKey={sched.key} swaps={swaps} onSwap={handleSwap} onDetail={(id,name)=>{setDetailId(id);setDetailName(name);}} color={sched.color}/>
      {swapTarget&&<SwapDrawer slot={swapTarget.slot} color={swapTarget.color} onSwap={applySwap} onClose={()=>setSwapTarget(null)}/>}
      {detailId&&<WgerDrawer exId={detailId} exName={detailName} color={sched.color} onClose={()=>setDetailId(null)}/>}
    </div>
  );
}

// ── NUTRITION MODULE ──────────────────────────────────────────────────────────
function NutritionModule({selDate}) {
  const key=toKey(selDate);
  const [meals,setMeals]=useState([]);
  const [q,setQ]=useState("");
  const [results,setResults]=useState([]);
  const [busy,setBusy]=useState(false);
  const [addTo,setAddTo]=useState("lunch");
  const [pick,setPick]=useState(null);
  const [grams,setGrams]=useState(100);
  const [open,setOpen]=useState(false);
  useEffect(()=>{store.get(`meals:${key}`).then(v=>setMeals(v||[]));setOpen(false);setResults([]);setQ("");setPick(null);},[key]);
  const search=useCallback(async()=>{
    if(!q.trim())return; setBusy(true); setResults([]);
    const [u,o]=await Promise.all([searchUSDA(q),searchOFF(q)]);
    const m=[]; for(let i=0;i<Math.max(u.length,o.length);i++){if(o[i])m.push(o[i]);if(u[i])m.push(u[i]);}
    setResults(m.slice(0,10)); setBusy(false);
  },[q]);
  useEffect(()=>{const t=setTimeout(()=>{if(q.length>2)search();},500);return()=>clearTimeout(t);},[q,search]);
  const mFor=(f,g)=>({kcal:Math.round(f.per100.kcal*g/100),protein:Math.round(f.per100.protein*g/100*10)/10,carbs:Math.round(f.per100.carbs*g/100*10)/10,fat:Math.round(f.per100.fat*g/100*10)/10});
  async function add(){
    if(!pick)return;
    const m={id:Date.now(),type:addTo,name:pick.name,src:pick.src,grams,...mFor(pick,grams)};
    const u=[...meals,m]; setMeals(u); await store.set(`meals:${key}`,u);
    setPick(null); setQ(""); setResults([]); setOpen(false);
  }
  async function del(id){const u=meals.filter(m=>m.id!==id);setMeals(u);await store.set(`meals:${key}`,u);}
  const tot=useMemo(()=>meals.reduce((a,m)=>({kcal:a.kcal+(m.kcal||0),protein:a.protein+(m.protein||0),carbs:a.carbs+(m.carbs||0),fat:a.fat+(m.fat||0)}),{kcal:0,protein:0,carbs:0,fat:0}),[meals]);
  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:10,background:T.card,borderRadius:12,padding:12,border:`1px solid ${T.border}`,alignItems:"center"}}>
        <Ring val={tot.kcal} max={TARGETS.kcal}/>
        <div style={{flex:1}}>
          <Bar label="Proteína" val={tot.protein} max={TARGETS.protein} color={T.blue}/>
          <Bar label="Carbos"   val={tot.carbs}   max={TARGETS.carbs}   color={T.amber}/>
          <Bar label="Grasa"    val={tot.fat}     max={TARGETS.fat}     color={T.pink}/>
        </div>
      </div>
      <button onClick={()=>setOpen(o=>!o)} style={{width:"100%",background:open?T.dim:T.green+"22",border:`1px solid ${open?T.border:T.green+"55"}`,borderRadius:8,padding:"9px",color:open?T.muted:T.green,fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",marginBottom:10}}>
        {open?"✕ Cerrar":"＋ Agregar alimento"}
      </button>
      {open&&(
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:10}}>
          <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>
            {MEAL_TYPES.map(m=><button key={m.id} onClick={()=>setAddTo(m.id)} style={{background:addTo===m.id?T.green+"22":"none",border:`1px solid ${addTo===m.id?T.green+"55":T.border}`,borderRadius:6,padding:"4px 10px",color:addTo===m.id?T.green:T.muted,fontSize:10,fontWeight:700,cursor:"pointer"}}>{m.icon} {m.l}</button>)}
          </div>
          <div style={{position:"relative",marginBottom:8}}>
            <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&search()}
              placeholder="ej: arroz, pechuga, aguacate…"
              style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"8px 34px 8px 10px",color:T.white,fontSize:12,outline:"none",fontFamily:T.font,boxSizing:"border-box"}}/>
            <span onClick={search} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",fontSize:15,cursor:"pointer"}}>🔍</span>
          </div>
          {busy&&<div style={{textAlign:"center",padding:"8px 0",color:T.muted,fontSize:11}}>Buscando USDA + Open Food Facts…</div>}
          {!pick&&results.length>0&&(
            <div style={{maxHeight:220,overflow:"auto",display:"flex",flexDirection:"column",gap:4}}>
              {results.map(f=>(
                <div key={f.id} onClick={()=>setPick(f)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=T.green+"66"}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:"#fff",marginBottom:2}}>{f.name}</div>
                    <div style={{display:"flex",gap:3}}><Pill c={f.src==="USDA"?T.cyan:T.green} sm>{f.src}</Pill><Pill c={T.amber} sm>{f.per100.kcal} kcal/100g</Pill><Pill c={T.blue} sm>P{f.per100.protein}g</Pill></div>
                  </div>
                  <span style={{color:T.green,fontSize:18}}>＋</span>
                </div>
              ))}
            </div>
          )}
          {pick&&(
            <div style={{background:T.surface,border:`1px solid ${T.green}44`,borderRadius:8,padding:10}}>
              <div style={{fontSize:11,fontWeight:700,color:T.white,marginBottom:8}}>{pick.name}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
                <span style={{fontSize:10,color:T.muted}}>GRAMOS:</span>
                <input type="number" value={grams} min={1} max={2000} onChange={e=>setGrams(Number(e.target.value))}
                  style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 8px",color:T.white,fontSize:14,fontWeight:700,width:68,fontFamily:T.mono,outline:"none"}}/>
                <div style={{display:"flex",gap:3}}>{[50,100,150,200].map(g=><button key={g} onClick={()=>setGrams(g)} style={{background:grams===g?T.green+"33":"none",border:`1px solid ${grams===g?T.green+"66":T.border}`,borderRadius:4,padding:"3px 6px",color:grams===g?T.green:T.muted,fontSize:9,cursor:"pointer"}}>{g}g</button>)}</div>
              </div>
              <div style={{display:"flex",gap:5,marginBottom:8}}>
                {Object.entries(mFor(pick,grams)).map(([k,v])=>(
                  <div key={k} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 6px",textAlign:"center",flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:k==="kcal"?T.amber:k==="protein"?T.blue:k==="fat"?T.pink:T.green}}>{v}{k!=="kcal"?"g":""}</div>
                    <div style={{fontSize:7,color:T.muted,textTransform:"uppercase"}}>{k}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={add} style={{flex:1,background:T.green+"22",border:`1px solid ${T.green}55`,borderRadius:6,padding:"8px 0",color:T.green,fontSize:11,fontWeight:700,cursor:"pointer",textTransform:"uppercase"}}>✓ Agregar</button>
                <button onClick={()=>{setPick(null);setResults([]);}} style={{background:"none",border:`1px solid ${T.border}`,borderRadius:6,padding:"8px 12px",color:T.muted,fontSize:11,cursor:"pointer"}}>✕</button>
              </div>
            </div>
          )}
        </div>
      )}
      {MEAL_TYPES.map(mt=>{
        const items=meals.filter(m=>m.type===mt.id); if(!items.length)return null;
        const s=items.reduce((a,m)=>({kcal:a.kcal+m.kcal,protein:a.protein+m.protein}),{kcal:0,protein:0});
        return (
          <div key={mt.id} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:10,fontWeight:700,color:T.muted}}>{mt.icon} {mt.l.toUpperCase()}</span>
              <span style={{fontSize:9,color:T.muted}}>{s.kcal} kcal · {s.protein}g P</span>
            </div>
            {items.map(item=>(
              <div key={item.id} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:7,padding:"7px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div><div style={{fontSize:11,fontWeight:700,color:"#fff"}}>{item.name}</div><div style={{fontSize:9,color:T.muted}}>{item.grams}g · {item.kcal} kcal · P{item.protein}g · C{item.carbs}g · G{item.fat}g</div></div>
                <button onClick={()=>del(item.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:14}}>✕</button>
              </div>
            ))}
          </div>
        );
      })}
      {!meals.length&&!open&&<div style={{textAlign:"center",padding:"20px 0",color:T.muted,fontSize:11}}>Sin registros para este día.<br/><span style={{color:T.green}}>Toca ＋ Agregar alimento.</span></div>}
    </div>
  );
}

// ── PROGRESS MODULE ───────────────────────────────────────────────────────────
function ProgressModule() {
  const [data,setData]=useState([]);
  const [form,setForm]=useState({weight:"",fat:"",muscle:""});
  const [ok,setOk]=useState(false);
  useEffect(()=>{store.get("metrics").then(v=>setData(v||[]));},[]);
  async function save(){
    if(!form.weight)return;
    const e={date:toKey(today()),weight:parseFloat(form.weight),fat:parseFloat(form.fat)||null,muscle:parseFloat(form.muscle)||null};
    const u=[...data.filter(d=>d.date!==e.date),e].sort((a,b)=>a.date.localeCompare(b.date));
    setData(u); await store.set("metrics",u); setForm({weight:"",fat:"",muscle:""}); setOk(true); setTimeout(()=>setOk(false),2000);
  }
  const last=data[data.length-1];
  const delta=k=>{ if(!last||data.length<2)return null; const d=last[k]-data[0][k]; return{v:Math.abs(d).toFixed(1),dir:d<0?"↓":"↑",good:k==="fat"?d<0:d>0}; };
  const Spark=({field,color,label})=>{
    const vals=data.map(d=>d[field]).filter(v=>v!=null); if(vals.length<2)return null;
    const mn=Math.min(...vals)*.98,mx=Math.max(...vals)*1.02,W=220,H=50;
    const pts=data.filter(d=>d[field]!=null).map((d,i,a)=>`${(i/(a.length-1))*W},${H-((d[field]-mn)/(mx-mn))*H}`).join(" ");
    return (
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:10}}>
        <div style={{fontSize:8,color:T.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:5}}>{label}</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{flex:1}}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
            {data.filter(d=>d[field]!=null).map((d,i,a)=><circle key={i} cx={(i/(a.length-1))*W} cy={H-((d[field]-mn)/(mx-mn))*H} r="3" fill={color}/>)}
          </svg>
          <div style={{textAlign:"right",minWidth:40}}>
            <div style={{fontFamily:T.mono,fontSize:16,fontWeight:700,color,lineHeight:1}}>{last?.[field]??""}</div>
            <div style={{fontSize:7,color:T.muted}}>{field==="weight"?"kg":"%"}</div>
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:7,color:T.muted,marginTop:3}}>
          <span>{data[0]?.date?.slice(5)}</span><span>{data[data.length-1]?.date?.slice(5)}</span>
        </div>
      </div>
    );
  };
  return (
    <div>
      {last&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:12}}>
          {[{k:"weight",l:"Peso",u:"kg",c:T.white},{k:"fat",l:"Grasa",u:"%",c:T.amber},{k:"muscle",l:"Músculo",u:"%",c:T.blue}].map(s=>{
            const d=delta(s.k);
            return (
              <div key={s.k} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:8,color:T.muted,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>{s.l}</div>
                <div style={{fontFamily:T.mono,fontSize:19,fontWeight:700,color:s.c,lineHeight:1}}>{last[s.k]??"-"}</div>
                <div style={{fontSize:8,color:T.muted}}>{s.u}</div>
                {d&&<div style={{fontSize:8,marginTop:3,color:d.good?T.green:T.red}}>{d.dir}{d.v}{s.u}</div>}
              </div>
            );
          })}
        </div>
      )}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:12,marginBottom:12}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:T.muted,textTransform:"uppercase",marginBottom:9}}>📊 Registro — {toKey(today())}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:9}}>
          {[{k:"weight",l:"Peso (kg)",p:"88.7"},{k:"fat",l:"Grasa (%)",p:"28.6"},{k:"muscle",l:"Músculo (%)",p:"67.7"}].map(f=>(
            <div key={f.k}>
              <div style={{fontSize:8,color:T.muted,marginBottom:3}}>{f.l}</div>
              <input type="number" step=".1" value={form[f.k]} placeholder={f.p} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))}
                style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 8px",color:T.white,fontSize:13,fontFamily:T.mono,outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
        </div>
        <button onClick={save} disabled={!form.weight} style={{width:"100%",background:form.weight?T.cyan+"22":T.dim,border:`1px solid ${form.weight?T.cyan+"55":T.border}`,borderRadius:7,padding:"8px",color:form.weight?T.cyan:T.muted,fontSize:11,fontWeight:700,textTransform:"uppercase",cursor:form.weight?"pointer":"default"}}>
          {ok?"✓ Guardado":"Guardar registro"}
        </button>
      </div>
      {data.length>1&&(
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          <Spark field="weight" color={T.white} label="Peso corporal (kg)"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            <Spark field="fat"    color={T.amber} label="Grasa (%)"/>
            <Spark field="muscle" color={T.blue}  label="Músculo (%)"/>
          </div>
        </div>
      )}
      {data.length>0&&(
        <div style={{marginTop:12}}>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:T.muted,textTransform:"uppercase",marginBottom:7}}>HISTORIAL</div>
          {[...data].reverse().slice(0,6).map(m=>(
            <div key={m.date} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:7,padding:"6px 10px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:10,color:T.muted,fontFamily:T.mono}}>{m.date}</span>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:11,fontWeight:700,color:T.white}}>{m.weight}kg</span>
                {m.fat!=null&&<span style={{fontSize:10,color:T.amber}}>{m.fat}%G</span>}
                {m.muscle!=null&&<span style={{fontSize:10,color:T.blue}}>{m.muscle}%M</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!data.length&&<div style={{textAlign:"center",padding:"16px 0",color:T.muted,fontSize:10,lineHeight:1.8}}>Punto de partida Xiaomi scale:<br/><strong style={{color:T.white}}>88.7 kg · 28.6% grasa · 67.7% músculo</strong></div>}
    </div>
  );
}

// ── APP SHELL ─────────────────────────────────────────────────────────────────
const TABS=[
  {id:"workout",  l:"Rutina",   i:"🏋️",c:"#3b82f6"},
  {id:"nutrition",l:"Nutrición",i:"🥗", c:"#10b981"},
  {id:"progress", l:"Progreso", i:"📈", c:"#06b6d4"},
];

export default function App() {
  const [tab,setTab]=useState("workout");
  const [nutDate,setNutDate]=useState(today());
  const accent=TABS.find(t=>t.id===tab)?.c||"#3b82f6";
  return (
    <div style={{background:T.bg,color:T.white,fontFamily:T.font,minHeight:"100vh",padding:12}}>
      <div style={{background:"linear-gradient(120deg,#060d1e,#0c1532 60%,#07111f)",border:`1px solid ${T.border}`,borderRadius:14,padding:"12px 18px",marginBottom:10,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:`linear-gradient(90deg,#3b82f6,#10b981 40%,#f59e0b)`}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:7,letterSpacing:4,color:T.muted,textTransform:"uppercase",marginBottom:2}}>wger.de · USDA · Open Food Facts</div>
            <div style={{fontFamily:"Impact,'Arial Narrow',sans-serif",fontSize:22,letterSpacing:2,color:"#fff",lineHeight:1}}>
              FITNESS <span style={{color:accent,transition:"color .3s"}}>HQ</span>
            </div>
          </div>
          <div style={{display:"flex",gap:5}}>
            {[{v:"690+",l:"EJERC.",c:"#3b82f6"},{v:"88.7",l:"KG",c:T.white},{v:"175g",l:"PROT",c:"#10b981"}].map(s=>(
              <div key={s.l} style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 8px",textAlign:"center"}}>
                <div style={{fontFamily:T.mono,fontSize:13,fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:7,letterSpacing:1,color:T.muted,marginTop:1}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:10}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,background:tab===t.id?t.c+"22":T.card,border:`1px solid ${tab===t.id?t.c+"66":T.border}`,borderRadius:8,padding:"7px 4px",color:tab===t.id?t.c:T.muted,fontSize:10,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <span style={{fontSize:16}}>{t.i}</span><span>{t.l}</span>
          </button>
        ))}
      </div>
      {tab==="nutrition"&&<WeekNav selDate={nutDate} onSelect={setNutDate}/>}
      {tab==="workout"  &&<WorkoutModule/>}
      {tab==="nutrition"&&<NutritionModule selDate={nutDate}/>}
      {tab==="progress" &&<ProgressModule/>}
    </div>
  );
}
