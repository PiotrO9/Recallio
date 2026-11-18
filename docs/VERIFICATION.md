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

Test REST używa lokalnego adresu `127.0.0.1:54321` i usuwa utworzone konta testowe. Publiczne tabele przyznają użytkownikom wyłącznie odczyt własnych wierszy. Tabele kursora, resetów i potwierdzeń są w prywatnym schemacie. Funkcje blokady konta i przydziału kursora sprawdzają testy pgTAP z `SYNC-DB`.

### Konta i wiadomości e-mail

W sesji terminala z uruchomionym lokalnym Supabase ustaw adres API i klucze testowe z `status`. Playwright odczytuje linki potwierdzenia i resetu z lokalnej skrzynki na porcie 54324.

```powershell
$recallioStatus = npx --yes supabase@3.2.0 status -o json | ConvertFrom-Json
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $recallioStatus.PUBLISHABLE_KEY
$env:RECALLIO_TEST_JWT_SECRET = $recallioStatus.JWT_SECRET
$env:RECALLIO_RUN_AUTH_TESTS = '1'
npm run build
npm run test:e2e
```

Na środowisku wdrożeniowym wpisz dokładny adres `/auth/confirm` na listę przekierowań i skonfiguruj SMTP oraz szablony wiadomości z `supabase/templates/`. Oddziel klucze testowe od kluczy wdrożenia.

### Serwer synchronizacji

Ustaw `RECALLIO_DATABASE_URL` jako serwerową zmienną połączenia PostgreSQL. Login backendu powinien mieć prawo `SET ROLE recallio_backend` i nie potrzebuje roli administracyjnej. Na Workers alternatywą jest binding Hyperdrive `RECALLIO_DB`. Route Handlers weryfikują sesję przed otwarciem transakcji, a każda transakcja ustala bieżące konto i rolę bazodanową.

Na lokalnym Supabase uruchom `npx --yes supabase@3.2.0 migration up`. Z tym samym środowiskiem E2E ustaw `RECALLIO_RUN_SYNC_TESTS=1` i wczytaj lokalny `SERVICE_ROLE_KEY` do `RECALLIO_TEST_SERVICE_ROLE_KEY` dla tworzenia i usuwania testowych kont. Uruchom `npm run test:e2e -- e2e/sync-api.spec.ts`. Klucz serwisowy jest potrzebny wyłącznie w testach.

Polecenie `npm run test:e2e -- e2e/study-flow.spec.ts` używa tych samych ustawień. Sprawdza pobranie fiszki, zapis i odświeżenie bez sieci, pojedyncze zdarzenie po synchronizacji, postęp na drugim urządzeniu oraz izolację drugiego konta. Obejmuje także manifest, kontrolowany limit miejsca w Chromium, ponowienie przygotowania offline i aktywację oczekującego service workera przy wstrzymanym wysyłaniu ocen. Test odczytuje wpisy Cache Storage i sprawdza, że po usunięciu sesji wspólny cache nie udostępnia poprzedniego zestawu. Profile desktop i mobile używają Chromium. Instalacja i działanie na rzeczywistych urządzeniach wymagają odbioru środowiska docelowego.

## Lokalny runtime Workers

```powershell
npm run workers:build
$env:RECALLIO_E2E_RUNTIME = 'workers'
npm run test:e2e
Remove-Item Env:RECALLIO_E2E_RUNTIME
```

OpenNext buduje aplikację za pomocą Next.js, a Playwright uruchamia lokalny runtime Wrangler na porcie 3211. Testy sprawdzają `/api/health` oraz działanie dema w Chromium. W czasie wdrażania konfiguracji dodatkowa lokalna sonda potwierdziła odczyt ciasteczka w Route Handlerze i referencyjną projekcję FSRS. Odbiór środowiska chmurowego jest w `FLOW-02`.

OpenNext zgłasza ograniczone wsparcie Windows. Przy problemach z narzędziami budowania użyj Linuxa lub WSL. `npm audit --omit=dev` nie zgłosił podatności. Pełny audyt zgłosił podatności w drzewie narzędzi OpenNext, których `npm audit fix` bez wymuszonych zmian wersji nie rozwiązuje.

## Dostępność

`e2e/demo.spec.ts` sprawdza link pomijający nawigację oraz przejście klawiaturą z rozpoczęcia nauki do oceny w demie, a także fokus w logowaniu. `e2e/study-flow.spec.ts` sprawdza odsłonięcie fiszki, ocenę i ponowienie błędnego zapisu z klawiatury oraz komunikat o nieprawidłowym CSV. Axe analizuje demo, logowanie, trening, zestawy i podgląd importu pod kątem wybranych reguł WCAG A i AA. Testy kontrolują brak przewijania w poziomie przy 320 px. Oba profile Chromium przeszły lokalnie w Next.js i Wranglerze. Testy nie obejmują rzeczywistych czytników ekranu.

## Odbiór MVP

| Kryteria briefu | Lokalny dowód | Co wymaga dalszego sprawdzenia |
| --- | --- | --- |
| Rejestracja i reset hasła, demo bez konta | [Auth E2E](../e2e/auth.spec.ts) z lokalną pocztą, [demo E2E](../e2e/demo.spec.ts) | Dostarczenie poczty i callback HTTPS na testowym środowisku |
| Zestawy ręczne, czytelne błędy CSV, pomijanie duplikatów, zachowanie treści i postępu, eksport bez utraty treści | [Ścieżka użytkownika](../e2e/study-flow.spec.ts), [testy CSV](../tests/import/csv.test.ts) i [test transakcji importu](../tests/storage/content-repository.test.ts) | Pełny eksport i ponowny import z interfejsu na środowisku testowym. Roundtrip samych danych jest sprawdzony jednostkowo |
| Dwa niezależne kierunki, ciągły trening, odporność na szybkie oceny | [Scheduler](../tests/learning-scheduler.test.ts), [kolejka](../tests/learning-queue.test.ts) i [ścieżka treningu](../e2e/study-flow.spec.ts) | Pomiar długiej prywatnej sesji z ponownym otwarciem aplikacji. Zmiana strefy czeka na `SETTINGS-01` |
| Trwały zapis, offline po przygotowaniu, instalacja PWA | [Test IndexedDB](../tests/storage/browser.test.mjs) i [E2E z odświeżeniem oraz aktualizacją workera](../e2e/study-flow.spec.ts) | Instalacja i pełne zamknięcie oraz ponowne uruchomienie na rzeczywistych urządzeniach z wdrożeniem HTTPS |
| Idempotencja, praca na dwóch urządzeniach, izolacja kont | [API synchronizacji](../e2e/sync-api.spec.ts), [ścieżka dwóch urządzeń](../e2e/study-flow.spec.ts), [REST](../tests/database/rest.test.mjs) i [RLS](../supabase/tests/account_isolation.sql) | Odbiór w Supabase i Workers w `FLOW-02` |
| Czytelny interfejs i stylistyka Rachmistrza | Wspólne kolory i typografia, scenariusze klawiatury i testy axe | Ręczny odbiór na docelowych urządzeniach |

### Odtworzenie lokalnej kopii

Użyto dwóch tymczasowych baz w lokalnym PostgreSQL z Supabase. W pierwszej uruchomiono migracje Recallio i zapisano dane dwóch syntetycznych kont. Tabela `auth.users` i funkcja `auth.uid()` miały uproszczoną definicję testową, a role PostgreSQL pochodziły ze wspólnego lokalnego klastra. Kopię w formacie custom z `pg_dump -Fc` odtworzono przez `pg_restore --single-transaction --exit-on-error` do drugiej bazy utworzonej z `template0`.

W odtworzonej bazie właściciel odczytał swoją fiszkę i ocenę, a drugie konto nie widziało żadnej z nich. Rola backendu odczytała potwierdzenie operacji, zachowała kursor 3 i poprawnie przydzieliła 4. Usunięto obie tymczasowe bazy i plik kopii. Odbiór środowiska docelowego nadal obejmuje przywrócenie kopii w rzeczywistym Supabase z pełnym Auth oraz test działania aplikacji w Workers.

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
