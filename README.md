# Recallio

Aplikacja do nauki fiszek z prywatnym treningiem dla zalogowanych użytkowników. Pełną ścieżkę konta zweryfikowano lokalnie z Supabase, Next.js oraz Wranglerem.

## Uruchomienie

Wymagania: Node.js >=22.12 i npm. Skonfiguruj Supabase według sekcji o kontach.

```sh
npm ci
npm run dev
```

Otwórz http://localhost:3000. Produkcja lokalna: `npm run build`, potem `npm start`.

## Co już działa

Po skonfigurowaniu konta dostępne są prywatne zestawy, import i eksport CSV, trening z FSRS-6 i osobnym postępem dla obu kierunków oraz synchronizacja zapisów między urządzeniami. Użytkownik wybiera zestawy, które chce przygotować do nauki offline. Stan odbioru środowiska docelowego jest w [kolejce zadań](docs/TASKS.md).

## Dokumentacja

- [Brief produktu](docs/PRODUCT-BRIEF.md)
- [Plan techniczny i kolejne etapy](docs/TECHNICAL-PLAN.md)
- [Kolejka zadań](docs/TASKS.md)
- [Kontrakty v1](docs/CONTRACTS.md)
- [Weryfikacja](docs/VERIFICATION.md)
- [Zasady pracy w repozytorium](AGENTS.md)

## Praca z kolejką w Codexie

Uruchom cel w jednym czacie projektu.

```text
/goal Użyj $recallio-queue i wykonuj kolejno gotowe zadania z docs/TASKS.md. Zacznij od SETUP-01, uwzględniając uzgodnione porządki w repozytorium. Po każdym zadaniu lub zapisaniu jego blokady zrób osobny commit i push na origin/codex/recallio-queue. Po blokadzie przejdź do kolejnego niezależnego zadania. Pracuj, aż wszystkie pozycje będą ukończone i opublikowane albo każda pozostała będzie zablokowana lub będzie czekać na zablokowaną zależność. Wdrożenia i operacje w chmurze wymagają osobnego zlecenia.
```

Jeśli skill nie pojawia się na liście w otwartym czacie, wskaż bezpośrednio `.agents/skills/recallio-queue/SKILL.md`.

## Komendy

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Testy E2E uruchamiają lokalny build na porcie 3210 i używają Chromium w trybie headless.

## Konfiguracja kont

Skopiuj [.env.example](.env.example) do `.env.local` i uzupełnij publiczny adres projektu oraz klucz publishable. Synchronizacja potrzebuje osobnego połączenia PostgreSQL dla backendu lub bindingu Hyperdrive. Konfigurację lokalnej bazy, poczty i połączenia opisuje [weryfikacja](docs/VERIFICATION.md#lokalna-baza-supabase).
