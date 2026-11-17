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

Każde zadanie ma właściciela, dozwolone pliki, bazowy commit i zależności. Używaj osobnych branchy/worktree, gdy repozytorium Git będzie już skonfigurowane. Obecny katalog może nie być repozytorium. Bez Git: osobne kopie i integrator, nigdy równoczesne mutacje wspólnych plików. Nie inicjalizuj Git, nie commituj, nie pushuj ani nie wdrażaj bez zlecenia.

Przed startem oznacz zadanie IN_PROGRESS i właściciela przez integratora. Wspólne pliki (package.json/lock, tsconfig, src/contracts, globals.css, migracje SQL, dokument decyzji) zmienia tylko integrator albo jeden jawnie przydzielony właściciel. Nie rozszerzaj zakresu cudzego zadania. Zmiana kontraktu wymaga opisania wpływu i zintegrowania przed pracą konsumentów. Mocki wolno pisać wyłącznie względem ustalonego interfejsu.

Oddając zadanie podaj: ID, bazę, zmienione pliki, zachowanie, komendy i wyniki testów, migracje, ograniczenia, zadania odblokowane. Nie oznaczaj DONE na podstawie samego kodu; integrator musi odtworzyć istotne testy. Nowy agent nie potrzebuje historii czatu — cały kontekst ma być w repo.

## Niezmienniki

Każda odpowiedź ma stabilne ID. Ponowienie używa tego samego zdarzenia. Lokalny commit poprzedza następną fiszkę. Historia, projekcja postępu i outbox produkcyjny zapisują się atomowo. Treść i postęp mają osobne wersje. Usunięcie wygrywa z późniejszą edycją ze starego urządzenia. Żadnego bezwarunkowego nadpisywania całego konta. Sekrety nigdy w NEXT_PUBLIC ani w repo. RLS sprawdza właściciela i rodzica, nie tylko istnienie sesji.

## Weryfikacja

`npm run typecheck`, `npm test`, `npm run build`; po zmianach UI/zapisu `npm run test:e2e`. Pierwszy raz: `npx playwright install chromium`. Testy headless, bez otwierania podglądów i przejmowania fokusu. Testuj błąd, retry i izolację użytkowników, gdy zmieniasz te mechanizmy. Brak środowiska chmurowego opisz jako ograniczenie, nie jako zaliczony test. Nie dodawaj zależności, narzędzi ani skilli hurtowo ze startera.
