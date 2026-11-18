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

## Lokalna baza Supabase

W uruchomionym Dockerze utwórz sieć raz, a potem uruchamiaj polecenia dla projektu Recallio:

```powershell
docker network create --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 recallio-local
npx --yes supabase@3.2.0 start --network-id recallio-local
npx --yes supabase@3.2.0 migration up
npx --yes supabase@3.2.0 test db --network-id recallio-local
npx --yes supabase@3.2.0 db advisors --level warn --fail-on error

$recallioStatus = npx --yes supabase@3.2.0 status -o json | ConvertFrom-Json
$env:RECALLIO_TEST_ANON_KEY = $recallioStatus.ANON_KEY
$env:RECALLIO_TEST_SERVICE_ROLE_KEY = $recallioStatus.SERVICE_ROLE_KEY
node --test tests/database/rest.test.mjs
Remove-Item Env:RECALLIO_TEST_ANON_KEY, Env:RECALLIO_TEST_SERVICE_ROLE_KEY
```

Test REST używa lokalnego adresu `127.0.0.1:54321` i usuwa utworzone konta testowe. Publiczne tabele przyznają użytkownikom wyłącznie odczyt własnych wierszy. Tabele kursora, resetów i potwierdzeń są w prywatnym schemacie. Testy produkcyjnych funkcji RPC do synchronizacji należą do `SYNC-01`.

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
