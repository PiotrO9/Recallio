# Weryfikacja

## Testy lokalne

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:storage:browser
npm run test:e2e
```

`npm test` obejmuje demo, kontrakty, zapis konta i CSV. Testy zapisu sprawdzają atomowość, retry, migracje, izolację kont, snapshot i rebase outbox. `npm run test:storage:browser` sprawdza również IndexedDB w headless Chromium.

E2E uruchamia `next start` na 127.0.0.1:3210 i testuje demo w desktopowym Chromium oraz emulacji iPhone'a w Chromium. Scenariusze obejmują zmianę kierunku, zapis i odczyt historii po odświeżeniu oraz błąd IndexedDB. Po błędzie fiszka zostaje na ekranie, a ponowienie zapisuje jedną odpowiedź. Zrzuty trafiają do `test-results/`.

## Wymagane scenariusze następnych etapów

- Atomiczność: błąd przy każdym store → zero częściowego postępu/outbox.
- Idempotencja: HTTP timeout po commit → retry → jedno zdarzenie i jedna projekcja.
- Wiele kart: równoległy drain i crash lease → brak utraty/dublowania.
- RLS: dwóch użytkowników, anon, manipulacja owner/deck FK, bezpośredni REST/RPC.
- Konflikty: edit/edit, edit/delete, review/delete, review/reset, dwa review offline.
- Zegar: przyszły/cofnięty, DST, zmiana strefy i granica dnia.
- Offline: przygotowanie, utrata sieci, zamknięcie/reload, ponowny sync na buildzie produkcyjnym.
- Aktualizacja: stary klient, SW, DB migration z niewysłanym outbox.
- CSV: polskie znaki, cytaty, multiline, BOM, limit, identyczne wpisy i warianty, roundtrip.
- Trening: małe zestawy, mixed, limit nowych, dodatkowe ćwiczenie i błąd.
- Dostępność: pełna obsługa klawiaturą, widoczny fokus, kontrast, czytelne etykiety, duże pola dotyku, brak przewijania poziomego przy szerokości 320 px.

Nie oznaczać tych testów jako zaliczonych przez istniejące testy demo. Wyniki chmurowe wymagają rzeczywistego środowiska Supabase/Workers. Do testów auth używać kont testowych, nie rzeczywistych danych użytkownika.
