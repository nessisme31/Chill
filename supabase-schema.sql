-- ════════════════════════════════════════════════
--  Les Chill — Battle Management — Supabase Schema
-- ════════════════════════════════════════════════

-- 1. BATTLES
CREATE TABLE battles (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  date             DATE,
  venue            TEXT,
  status           TEXT DEFAULT 'active',
  top16_validated  BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 2. JUDGES
CREATE TABLE judges (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id  UUID REFERENCES battles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  cypher     TEXT,
  position   INTEGER DEFAULT 0
);

-- 3. DJS
CREATE TABLE djs (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id  UUID REFERENCES battles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER DEFAULT 0
);

-- 4. CREWS
CREATE TABLE crews (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id  UUID REFERENCES battles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  member1    TEXT NOT NULL,
  member2    TEXT NOT NULL,
  email      TEXT,
  cypher     TEXT NOT NULL,
  sticker    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. QUALIFICATION SCORES
CREATE TABLE qual_scores (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id  UUID REFERENCES battles(id) ON DELETE CASCADE,
  crew_id    UUID REFERENCES crews(id) ON DELETE CASCADE,
  judge_id   UUID REFERENCES judges(id) ON DELETE CASCADE,
  score      DECIMAL(4,1),
  UNIQUE(battle_id, crew_id, judge_id)
);

-- 6. TOP 16 SCORES
CREATE TABLE top16_scores (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id  UUID REFERENCES battles(id) ON DELETE CASCADE,
  crew_id    UUID REFERENCES crews(id) ON DELETE CASCADE,
  judge_id   UUID REFERENCES judges(id) ON DELETE CASCADE,
  score      DECIMAL(4,1),
  UNIQUE(battle_id, crew_id, judge_id)
);

-- 7. TOP 16 GUESTS
CREATE TABLE top16_guests (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id  UUID REFERENCES battles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER DEFAULT 0
);

-- 8. BRACKET SLOTS
CREATE TABLE bracket_slots (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id    UUID REFERENCES battles(id) ON DELETE CASCADE,
  round        INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  position     INTEGER NOT NULL,
  crew_id      UUID REFERENCES crews(id) ON DELETE SET NULL,
  team_name    TEXT,
  sticker      TEXT,
  cypher       TEXT,
  is_guest     BOOLEAN DEFAULT FALSE,
  is_winner    BOOLEAN DEFAULT FALSE,
  UNIQUE(battle_id, round, match_number, position)
);

-- ════════════════════════════════════════════════
--  Row Level Security
-- ════════════════════════════════════════════════

ALTER TABLE battles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE judges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE djs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE qual_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE top16_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE top16_guests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON battles       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON judges        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON djs           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON crews         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON qual_scores   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON top16_scores  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON top16_guests  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON bracket_slots FOR ALL USING (true) WITH CHECK (true);
