# Weryfikacja

## Fundament

```sh
npm ci
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Testy jednostkowe: odpowiedni przykład dla rewersu; zapętlenie kolejki i odrzucenie pustego zbioru; równoległe ponowienie tego samego eventu w IndexedDB zapisuje jedną odpowiedź; nowe zdarzenie w przeciwnym kierunku jest osobne. fake-indexeddb sprawdza adapter, nie zastępuje prawdziwej przeglądarki.

E2E uruchamia własny `next start` na 127.0.0.1:3210, bez ponownego użycia cudzego serwera. Desktop Chrome i emulowany iPhone w Chromium: start, ukryta odpowiedź, reveal, ocena, kolejna karta, reload i trwała historia, zmiana kierunku, brak overflow. Emulacja telefonu nie jest testem Safari/iOS. Zrzuty w ignorowanym test-results/.

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

Nie oznaczać tych testów jako zaliczonych przez istniejące testy demo. Wyniki chmurowe wymagają rzeczywistego środowiska Supabase/Workers. Do testów auth używać kont testowych, nie rzeczywistych danych użytkownika.

## Wynik weryfikacji fundamentu (2026-11-17)

Sprawdzone lokalnie: typy TypeScript, 3 testy jednostkowe, produkcyjny build Next.js oraz 4 testy E2E (dwa scenariusze na desktop/mobile). Drugi scenariusz symuluje błąd IndexedDB: fiszka zostaje na ekranie, ponowienie zapisuje jedną odpowiedź. Przejrzano zrzuty desktop i mobile. Brak weryfikacji Supabase, Workers, Safari i pełnego offline — tych funkcji jeszcze nie zaimplementowano.
