# Recallio — instrukcje dla agentów

## Najpierw przeczytaj

README.md, docs/TECHNICAL-PLAN.md, docs/CONTRACTS.md i własne zadanie w docs/AGENT-BACKLOG.md. Oryginalne wymagania: docs/PRODUCT-BRIEF.md. W razie konfliktu: jawna instrukcja użytkownika > brief produktu > zatwierdzone kontrakty > wskazówki referencyjne. Propozycje w dokumentach nie są zaimplementowanymi funkcjami.

## Stan projektu

Działa wyłącznie demo. Nie opisuj historii ocen jako planowania powtórek, IndexedDB jako kompletnego offline ani lokalnego builda jako wdrożenia na Workers. Nie używaj demo jako systemu uwierzytelnienia.

## Technologia i granice

- npm, Node >=22.12, Next.js App Router, React, TypeScript strict, CSS.
- `src/app`: routing, layout, kompozycja; przyszłe Route Handlers są adapterami.
- `src/domain`: czyste typy i funkcje; bez React, przeglądarki, SQL i HTTP.
- `src/features`: interakcje i kontrolery przypadków użycia.
- `src/storage`: lokalne repozytoria i migracje IndexedDB.
- Przyszłe `src/contracts`: współdzielone schematy runtime i DTO.
- Przyszłe `src/sync`: kolejka, transport i uzgadnianie danych.
- Przyszłe `src/server`: weryfikacja tożsamości, usługi, adapter Supabase.
- Wstrzykuj zegar, generator identyfikatorów i losowość w logice produkcyjnej.
- Rachmistrz (`D:/CODE/rachmistrz`) jest referencją UI: Manrope, krem, zieleń, duża czytelna treść, brak presji czasu. Nie kopiuj logiki matematyki.

## Praca niezależnych agentów

Przed zmianą plików przeczytaj `docs/COORDINATION.md`. Rejestr we wspólnym katalogu Git to źródło statusu; backlog opisuje zadania, ale jego status nie rezerwuje pracy. Uruchom `node scripts/coordinate.mjs status`, a potem `claim` z unikalnym właścicielem. Rezerwacja obejmuje atomową kontrolę zależności. Skopiuj token do prywatnego kontekstu czatu i przekaż go do kolejnych poleceń; nie commituj go. Osobny branch/worktree utwórz od zintegrowanego HEAD, zgłoś przez `attach`, przed pracą sprawdź status i zakres. Jeśli rejestr zablokowany lub brak zadań — zgłoś sytuację, nie obchodź blokady.

`CORE-01` należy do integratora; DATA/LOCAL/LEARN/CSV/PLATFORM zaczynają dopiero po jego integracji i DONE. Wspólne pliki (`package.json`, lockfile, tsconfig, `src/contracts`, `globals.css`, migracje SQL, decyzje) zmienia tylko integrator lub jeden jawnie wyznaczony właściciel. Każdy agent przekazuje commit i raport przez `review`; integrator sprawdza, integruje i dopiero wtedy wykonuje `done`. Nie wykonuj push ani wdrożenia bez zlecenia. Rejestr lokalny nie jest koordynacją między różnymi kopiami repozytorium lub komputerami. Nie usuwaj automatycznie rezerwacji ani blokady.

## Niezmienniki

Każda odpowiedź ma stabilne ID. Ponowienie używa tego samego zdarzenia. Lokalny commit poprzedza następną fiszkę. Historia, projekcja postępu i outbox produkcyjny zapisują się atomowo. Treść i postęp mają osobne wersje. Usunięcie wygrywa z późniejszą edycją ze starego urządzenia. Żadnego bezwarunkowego nadpisywania całego konta. Sekrety nigdy w NEXT_PUBLIC ani w repo. RLS sprawdza właściciela i rodzica, nie tylko istnienie sesji.

## Weryfikacja

`npm run typecheck`, `npm test`, `npm run build`; po zmianach UI/zapisu `npm run test:e2e`. Pierwszy raz: `npx playwright install chromium`. Testy headless, bez otwierania podglądów i przejmowania fokusu. Testuj błąd, retry i izolację użytkowników, gdy zmieniasz te mechanizmy. Brak środowiska chmurowego opisz jako ograniczenie, nie jako zaliczony test. Nie dodawaj zależności, narzędzi ani skilli hurtowo ze startera.
