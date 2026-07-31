-- fitness-hq · esquema D1
-- Aplicar con: wrangler d1 execute fitness-hq-db --remote --file=./schema.sql
-- (usa --local en vez de --remote para probar contra la base local de wrangler dev)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weight     REAL,
  height     REAL,
  age        INTEGER,
  sex        TEXT,
  activity   REAL,
  goal       TEXT,
  week_json  TEXT,   -- JSON.stringify(profile.week), 7 entradas
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS exercise_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  date          TEXT NOT NULL,   -- YYYY-MM-DD
  sets_json     TEXT NOT NULL,   -- JSON.stringify([{weight,reps,rpe}, ...])
  UNIQUE(user_id, exercise_name, date)
);
CREATE INDEX IF NOT EXISTS idx_exlog_user ON exercise_logs(user_id);

CREATE TABLE IF NOT EXISTS meals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,      -- YYYY-MM-DD
  type       TEXT NOT NULL,      -- breakfast/lunch/dinner/snack
  name       TEXT NOT NULL,
  src        TEXT,
  grams      REAL,
  kcal       REAL,
  protein    REAL,
  carbs      REAL,
  fat        REAL
);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals(user_id, date);

CREATE TABLE IF NOT EXISTS metrics (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,         -- YYYY-MM-DD
  weight  REAL,
  fat     REAL,
  muscle  REAL,
  PRIMARY KEY(user_id, date)
);

-- Sustituciones de ejercicio en la rutina fija (slot_id: "l1","s3","p5", etc.)
CREATE TABLE IF NOT EXISTS exercise_swaps (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot_id    TEXT NOT NULL,
  ex_id      TEXT NOT NULL,      -- id de wger (numérico) o de alternativa local ("la1"), como texto
  ex_name    TEXT NOT NULL,
  ex_es      TEXT,
  updated_at TEXT,
  PRIMARY KEY(user_id, slot_id)
);
