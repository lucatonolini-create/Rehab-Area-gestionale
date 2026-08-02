-- USC Cremonese Rehab Area – Schema Supabase
-- Esegui questo script nell'SQL Editor del tuo progetto Supabase

-- ── Atleti ───────────────────────────────────────────────────────────────────
create table if not exists atleti (
  id                   text primary key,
  nome                 text not null,
  nome_completo        text,
  data_nascita         text default '',
  categoria            text not null,
  posizione            text default '',
  piede_dominante      text default 'Destro',
  tipo_infortunio      text,
  evento               text,
  meccanismo           text,
  contatto             text,
  lato                 text,
  posizione_infortunio text,
  infortunio           text default '',
  inizio_rehab         text default '',
  fine_rehab           text,
  stato                text not null default 'In recupero',
  progresso            integer default 0,
  progresso_manuale    integer,
  fisioterapista       text default '',
  preparatore_atletico text default '',
  telefono             text default '',
  email                text default '',
  note                 text default '',
  peso                 text,
  altezza              text,
  plicometrie_medie    text,
  altezza_da_seduto    text,
  osiics_codice        text,
  osiics_descrizione   text,
  osiics_code_id       text,
  storico_infortuni    jsonb default '[]'::jsonb,
  questionari_kinesiofobia jsonb default '[]'::jsonb,
  referti_clinici      jsonb default '[]'::jsonb,
  created_at           timestamptz default now()
);

-- ── Migrazione: aggiungi colonne mancanti su DB esistenti ──────────────────────
-- Esegui questi ALTER TABLE se il DB è già stato creato con lo schema precedente.
alter table atleti add column if not exists nome_completo        text;
alter table atleti add column if not exists evento               text;
alter table atleti add column if not exists meccanismo           text;
alter table atleti add column if not exists contatto             text;
alter table atleti add column if not exists lato                 text;
alter table atleti add column if not exists posizione_infortunio text;
alter table atleti add column if not exists progresso_manuale    integer;
alter table atleti add column if not exists peso                 text;
alter table atleti add column if not exists altezza              text;
alter table atleti add column if not exists plicometrie_medie    text;
alter table atleti add column if not exists altezza_da_seduto    text;
alter table atleti add column if not exists osiics_codice        text;
alter table atleti add column if not exists osiics_descrizione   text;
alter table atleti add column if not exists osiics_code_id       text;
alter table atleti add column if not exists questionari_kinesiofobia jsonb default '[]'::jsonb;
alter table atleti add column if not exists referti_clinici      jsonb default '[]'::jsonb;
alter table atleti add column if not exists storico_infortuni    jsonb default '[]'::jsonb;
alter table atleti add column if not exists data_nascita         text;

-- ── Programmi ─────────────────────────────────────────────────────────────────
create table if not exists programmi (
  id         text primary key,
  atleta_id  text references atleti(id) on delete cascade,
  nome       text not null,
  fase       text default '',
  data       text not null,
  esercizi      jsonb default '[]'::jsonb,
  esercizicampo jsonb default '[]'::jsonb,
  tests         jsonb default '[]'::jsonb,
  carico        jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ── Impostazioni (riga singola) ───────────────────────────────────────────────
create table if not exists impostazioni (
  id               integer primary key default 1,
  nome_club        text default 'USC Cremonese',
  nome_struttura   text default 'Rehab Area',
  indirizzo        text default '',
  fisioterapisti   jsonb default '[]'::jsonb,
  preparatori      jsonb default '[]'::jsonb,
  rosa             jsonb default '[]'::jsonb
);

alter table impostazioni add column if not exists rosa jsonb default '[]'::jsonb;

insert into impostazioni (id) values (1) on conflict do nothing;

-- ── Row Level Security (accesso libero – aggiungere auth in futuro) ───────────
alter table atleti enable row level security;
alter table programmi enable row level security;
alter table impostazioni enable row level security;

create policy "Accesso completo atleti"       on atleti       for all using (true) with check (true);
create policy "Accesso completo programmi"    on programmi    for all using (true) with check (true);
create policy "Accesso completo impostazioni" on impostazioni for all using (true) with check (true);
