# Praca nad Recallio

## Dokumentacja według zadania

- Uruchomienie i stan dema — [README](README.md).
- Zakres funkcji i [kryteria odbioru](docs/PRODUCT-BRIEF.md#20-kryteria-gotowości-pierwszej-wersji) — [brief produktu](docs/PRODUCT-BRIEF.md).
- Dane i synchronizacja — [kontrakty v1](docs/CONTRACTS.md), w tym sekcje [API](docs/CONTRACTS.md#api) i [CSV](docs/CONTRACTS.md#csv-v1).
- Architektura i [kolejność prac](docs/TECHNICAL-PLAN.md#11-etapy-i-kryteria-przejścia) — [plan techniczny](docs/TECHNICAL-PLAN.md).
- Wykonanie serii zadań — [kolejka](docs/TASKS.md) i [skill recallio-queue](.agents/skills/recallio-queue/SKILL.md).
- Testy i scenariusze odbioru — [weryfikacja](docs/VERIFICATION.md).

W razie konfliktu pierwszeństwo ma jawna instrukcja użytkownika, potem brief produktu, zatwierdzone kontrakty i wskazówki referencyjne.

## Stan projektu

Interfejs udostępnia lokalne demo. W kodzie są już kontrakty, repozytorium konta w IndexedDB i parser CSV. Podłączenie tych modułów oraz konta, harmonogram powtórek, synchronizacja, PWA i hosting na Workers pozostają w planie.

## Technologia i granice

- npm, Node >=22.12, Next.js App Router, React, TypeScript strict, CSS.
- `src/app`: routing, layout, kompozycja; przyszłe Route Handlers są adapterami.
- `src/domain`: czyste typy i funkcje; bez React, przeglądarki, SQL i HTTP.
- `src/features`: interakcje i kontrolery przypadków użycia.
- `src/storage`: lokalne repozytoria i migracje IndexedDB.
- `src/contracts`: współdzielone schematy runtime i DTO.
- Przyszłe `src/sync`: kolejka, transport i uzgadnianie danych.
- Przyszłe `src/server`: weryfikacja tożsamości, usługi, adapter Supabase.
- Wstrzykuj zegar, generator identyfikatorów i losowość w logice produkcyjnej.
- Przy zmianie UI korzystaj z [referencji Rachmistrza](docs/TECHNICAL-PLAN.md#rachmistrz). Zachowaj czytelną treść i trening bez presji czasu. Nie kopiuj logiki matematyki.

Zlecenie wykonania kolejki z pushem obejmuje kolejne commity i zapisy blokad na wskazanej gałęzi. Wdrożenie i operacje w chmurze wymagają osobnego zlecenia.

## Niezmienniki

Każda odpowiedź ma stabilne ID. Ponowienie używa tego samego zdarzenia. Lokalny commit poprzedza następną fiszkę. Historia, projekcja postępu i outbox produkcyjny zapisują się atomowo. Treść i postęp mają osobne wersje. Usunięcie wygrywa z późniejszą edycją ze starego urządzenia. Żadnego bezwarunkowego nadpisywania całego konta. Sekrety nigdy w NEXT_PUBLIC ani w repo. RLS sprawdza właściciela i rodzica, nie tylko istnienie sesji.

## Weryfikacja

`npm run typecheck`, `npm test`, `npm run build`; po zmianach UI/zapisu `npm run test:e2e`. Pierwszy raz: `npx playwright install chromium`. Testy headless, bez otwierania podglądów i przejmowania fokusu. Testuj błąd, retry i izolację użytkowników, gdy zmieniasz te mechanizmy. Brak środowiska chmurowego opisz jako ograniczenie, nie jako zaliczony test. Nie dodawaj zależności, narzędzi ani skilli hurtowo ze startera.
