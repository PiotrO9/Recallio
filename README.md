# Recallio

Aplikacja do nauki fiszek z lokalnym demem. Po skonfigurowaniu Supabase działa również obsługa kont.

## Uruchomienie

Wymagania: Node.js >=22.12 i npm. Demo działa bez kont i usług zewnętrznych.

```sh
npm ci
npm run dev
```

Otwórz http://localhost:3000. Produkcja lokalna: `npm run build`, potem `npm start`.

## Co już działa

- Polski, responsywny ekran w stylistyce Rachmistrza.
- Gotowy zestaw sześciu fiszek, wybór A → B lub B → A przed rozpoczęciem.
- Odsłanianie odpowiedzi i przykładu, cztery oceny, ciągła kolejka demonstracyjna.
- Historia ocen w IndexedDB; odświeżenie zachowuje zapisane odpowiedzi.
- Ochrona przed ponowionym zapisem tego samego zdarzenia; błąd zapisu zatrzymuje fiszkę.

Demo nie wylicza terminów, nie odtwarza pozycji sesji po odświeżeniu, nie synchronizuje danych i nie zapewnia otwarcia strony offline. IndexedDB nie jest kopią zapasową: wyczyszczenie danych witryny usuwa historię. Demo ma osobną bazę i nigdy nie migruje jej do konta.

Repozytorium zawiera też kontrakty v1, lokalne repozytorium danych konta i parser CSV. Te moduły czekają na podłączenie do interfejsu.

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

Skopiuj [.env.example](.env.example) do `.env.local` i uzupełnij publiczny adres projektu oraz klucz publishable. Konfigurację lokalnej bazy, wiadomości e-mail i testów opisuje [weryfikacja](docs/VERIFICATION.md#konta-i-wiadomości-email).
