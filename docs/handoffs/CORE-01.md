# CORE-01 — częściowe przekazanie

Stan: BLOCKED / niegotowe do integracji. Baza `7b90fca6aa4dec0a1196a0bac680b6d42424fc78`, branch `agent-core-01`, worktree `D:/CODE/Recallio-core-01`.

Wykonano: wspólne typy domeny i porty, Zod 4, ścisły walidator push z operacjami, identyfikatorami, oceną, wersją, limitem paczki/UTF-8 oraz bez userId; string dla bigint; propozycje decyzji konfliktów, sesji, czasu i resetu.

Weryfikacja: `npm run typecheck`, `npm test` (6 testów TS i 2 testy koordynacji), `npm run build` — przeszły. Bez testów Supabase/Workers: brak implementacji endpointów i bazy.

Pozostało przed REVIEW/DONE: zamknąć runtime schematy pull/snapshot/HTTP błędów i modele odpowiedzi, walidację wszystkich kontraktów domeny, fixture każdej operacji i wyników, wersjonowanie schedulerState; doprecyzować relację `progress.reset` per kierunek do `progress_resets` per karta i semantykę stale-base dla review. Rozstrzygnąć politykę liczników i domyślny limit z właścicielem produktu przed implementacją ustawień. Wybrany algorytm ma potwierdzić zgodność z efektywnym czasem. Nie odblokowywać zależnych zadań do przeglądu i integracji całości.

Zależność `zod` i lockfile zmienione w tym zadaniu, ponieważ CORE-01 jest pracą integratora nad wspólnymi kontraktami. Nie wykonano żadnych zmian w chmurze.
