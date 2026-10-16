-- Tabella giocatori: UUID stabile per ogni atleta della rosa.
-- Usata come source of truth per athlete_id in ntli, ntli_daily, e ovunque
-- non esista un record atleti (infortuni formali).
CREATE TABLE IF NOT EXISTS giocatori (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text        UNIQUE NOT NULL,
  categoria   text,
  ruolo       text,
  created_at  timestamptz DEFAULT now()
);

-- RLS: permetti lettura/scrittura agli utenti autenticati
ALTER TABLE giocatori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticati_rw" ON giocatori
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
