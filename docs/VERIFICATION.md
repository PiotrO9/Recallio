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

`npm test` obejmuje trening, kontrakty, zapis konta i CSV. Testy zapisu sprawdzają atomowość, retry, migracje, izolację kont, snapshot i rebase outbox. `npm run test:storage:browser` sprawdza również IndexedDB w headless Chromium.

E2E uruchamia `next start` na porcie 3210 i sprawdza wejście do aplikacji w desktopowym i mobilnym Chromium. Testy kont i treningu wymagają konfiguracji lokalnego Supabase opisanej poniżej.

Pomiar lokalnej kolejki uruchamia `node tests/storage/bench-outbox.mjs`. Chromium mierzy pobranie i potwierdzenie 100 oraz 1000 operacji w IndexedDB, po trzy próby dla każdego rozmiaru. Czas przygotowania danych i połączenie z serwerem są poza pomiarem.

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

OpenNext buduje aplikację za pomocą Next.js, a Playwright uruchamia lokalny runtime Wrangler na porcie 3211. Testy sprawdzają `/api/health` oraz wejście do aplikacji w Chromium. W czasie wdrażania konfiguracji dodatkowa lokalna sonda potwierdziła odczyt ciasteczka w Route Handlerze i referencyjną projekcję FSRS. Odbiór środowiska chmurowego jest w `FLOW-02`.

OpenNext zgłasza ograniczone wsparcie Windows. Przy problemach z narzędziami budowania użyj Linuxa lub WSL. `npm audit --omit=dev` nie zgłosił podatności. Pełny audyt zgłosił podatności w drzewie narzędzi OpenNext, których `npm audit fix` bez wymuszonych zmian wersji nie rozwiązuje.

## Dostępność

Pomiar bazowy A11Y-01 na lokalnym koncie obejmował 44 wykonane testy E2E i 26 skanów axe na dwóch profilach Chromium. Każdy plik `test-results/**/axe-*.json` podaje stan, regułę, selektor i przyczynę. Wykryto 0 naruszeń automatycznych. W 20 skanach wynik `incomplete` dotyczył kontrastu. Wymagały pomiaru na wyrenderowanym tle. Logowanie, błąd pola i potwierdzenie importu miały po dwa skany bez `incomplete`.

### Odbiór zmian w Recallio, 26 listopada 2026

Wersja aplikacji `cd189b8`, Windows 11 Pro (kompilacja 26300), Chromium 159.0.8154.6, Playwright 1.65.1, axe-core 4.14.1. Profile `desktop` i `mobile` używały lokalnych kont Supabase. Profil mobilny emuluje iPhone’a 13 w Chromium. Wynik „spełnia” odnosi się do opisanej próby. Pełna ocena procesu wymaga również odbioru z technologiami asystującymi. [Wymagania dotyczące zgodności W3C](https://www.w3.org/TR/WCAG22/#conformance-reqs)

| Proces i stan początkowy                                                | Czynność oraz kryteria WCAG                                                                                                             | Oczekiwany i zaobserwowany wynik                                                                                                                                                                                                                                                     | Dowód                                                                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Konto, formularz logowania i rejestracji                                | Wysłać puste pola, poprawić dane, ponowić po błędzie sieci. 1.3.1, 2.4.2, 3.3.1–3.3.3, 4.1.2                                            | Spełnia. Fokus wskazuje e-mail, którego nazwą pozostaje „Adres e-mail”. Opis hasła zachowuje wskazówkę po dodaniu i usunięciu błędu. Drugie wysłanie podczas oczekiwania daje jedno żądanie. Tytuły rozróżniają rejestrację, odbiór poczty i nowe hasło.                             | [Formularze](../e2e/entry.spec.ts), [poczta i zmiana hasła](../e2e/auth.spec.ts)                            |
| Biblioteka, 10 tys. fiszek                                              | Wpisać kolejno dwie frazy, odsłonić kolejne 50 wyników, edytować, wrócić, przejść Dalej i odświeżyć. 2.4.2–2.4.4, 4.1.3                 | Spełnia. Region statusu zawiera ostateczną liczbę. Fokus przechodzi na wynik 51, przy powrocie na edytowany link, a po utracie dopasowania na pole wyszukiwania. Tytuł odpowiada widokowi.                                                                                           | [Wyszukiwanie](../e2e/card-search.spec.ts)                                                                  |
| Trening pisemny, obie strony fiszki                                     | Wpisać tekst i cyfrę, odsłonić wzorzec, wprowadzić znak w trakcie kompozycji, nacisnąć Tab. 1.3.1–1.3.2, 2.1.1, 2.1.4, 2.4.3, 4.1.2     | Spełnia. Pole ma opis z pytaniem. Po odsłonięciu fokus trafia na grupę z opisem wzorca i pytaniem o samoocenę, potem na pierwszą ocenę. Zdarzenie kompozycji zachowuje kartę.                                                                                                        | [Oba kierunki](../e2e/typed-study.spec.ts)                                                                  |
| Błąd zapisu i błąd odczytu kolejnego pytania                            | Przerwać transakcję IndexedDB, ponowić, wymusić błąd odczytu, ponowić sam odczyt. 2.4.3, 3.3.1, 4.1.3                                   | Spełnia. „Ponów zapis” zachowuje odpowiedź użytkownika. „Ponów odczyt” wyjaśnia, że ocena przetrwała. Przed odczytem historia i kolejka mają po jednym rekordzie z tym samym ID. Po odczycie można kontynuować.                                                                      | [Trening pisemny](../e2e/typed-study.spec.ts), [transakcje przeglądarki](../tests/storage/browser.test.mjs) |
| Sesja dzienna i praca offline                                           | Przygotować dwa zestawy, wyłączyć sieć, ocenić, odświeżyć i przywrócić sieć. 2.1.1, 2.4.3, 4.1.3                                        | Spełnia. Po pierwszej ocenie kontrolka ma fokus i opis drugiego pytania. Po zakończeniu widoczne jest podsumowanie. Drugie urządzenie otrzymuje dokładnie dwie oceny.                                                                                                                | [Sesja dzienna](../e2e/daily.spec.ts), [zapis i powrót do zestawu](../e2e/study-flow.spec.ts)               |
| Import, konflikt na drugiej stronie                                     | Wkleić nagłówek i 21 par, przejść do problemu, wskazać fiszkę. Przerwać osobny import pliku i wznowić. 1.3.1, 1.4.1, 2.4.3, 3.3.1–3.3.3 | Spełnia. Wiersz źródłowy 22 otwiera się na drugiej stronie. Akcja i pole wyboru celu mają opis problemu. Źródło i zmienione pole są podpisane tekstem. Po decyzji zapis jest dostępny.                                                                                               | [Wklejka](../e2e/paste.spec.ts), [plik i częściowy zapis](../e2e/mockup-views.spec.ts)                      |
| „Do poprawy”, dwie sugestie                                             | Otworzyć listę, wybrać drugi link, wrócić po zapisie i przyciskiem Wstecz. Otworzyć również nieaktualny cel. 2.4.3, 2.4.4, 2.5.3, 4.1.3 | Spełnia. Otwarcie wskazuje nagłówek, a powrót wskazuje wybraną fiszkę. Brak celu wskazuje nagłówek i wyjaśnienie. Offline widać datę ostatniej aktualizacji.                                                                                                                         | [Sugestie](../e2e/repair-list.spec.ts)                                                                      |
| Potwierdzenie importu, usuwanie fiszki, konto z jedną niewysłaną zmianą | Tab i Shift+Tab w oknie, Escape, anulowanie odrzucenia, awaria synchronizacji i ponowienie. 2.1.1–2.1.2, 2.4.3, 3.3.4                   | Spełnia. Fokus pozostaje w otwartym dialogu, Escape zwraca go na przycisk. Po resecie postępu fokus wraca na ponownie aktywny przycisk, a po usunięciu ostatniej fiszki trafia na nagłówek listy. Po anulowaniu odrzucenia zmiana pozostaje dostępna i dociera na drugie urządzenie. | [Dialog](../e2e/mockup-views.spec.ts), [konto i usuwanie](../e2e/study-flow.spec.ts)                        |

W przebiegu Next.js wykonano 46 z 46 scenariuszy E2E, 85 z 85 testów jednostkowych i jeden test rzeczywistego IndexedDB. Te same 46 scenariuszy E2E przeszło również na lokalnym runtime Workers (Wrangler). Budowanie produkcyjne Next.js i OpenNext, kontrola typów oraz formatowanie zakończyły się powodzeniem. W każdym runtime wykonano po 26 końcowych skanów axe, po 13 stanów lub wariantów na profil. Wszystkie raporty mają puste `violations` i `incomplete`. W pomiarze bazowym obszarem niepewności był nagłówek z tłem na pseudoelemencie. W obecnej wersji pas nagłówka ma własne tło, a dodatkowy pomiar sprawdza jego tekst i oba stany linków.

### Kontrast, cele dotykowe i powiększenie

Pomiar z wyrenderowanych stylów obejmuje kolor tekstu, tło kontrolki, tło rodzica, obramowanie i obrys fokusu. Raporty `contrast-*.json` podają także rozmiar elementu w pikselach CSS. Regresja sprawdza pary właściwe dla danej kontrolki. [Pomiary](../e2e/visual-accessibility.ts)

| Stan                                 | Wynik pomiaru                                                                                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logowanie, pole e-mail z fokusem     | Obramowanie `#90829b` względem białego wnętrza 3,59:1, względem zewnętrznego `#fffcf6` 3,50:1. Obrys `#65428e` względem tego samego tła 7,53:1.                                                                                                    |
| Główny przycisk i nagłówek aplikacji | Biały napis na `#584080` 8,54:1. Link główny `#29233a` na `#fbf9fb` 14,36:1, aktywny link `#584080` na `#ede8f2` 7,08:1.                                                                                                                           |
| Cztery oceny w treningu              | Kontrast tekstu 6,84–8,31:1. Najniższy kontrast obramowania względem wnętrza 3,57:1, względem tła zewnętrznego 3,99:1 po zaokrągleniu. Wszystkie cztery oceny, link edycji sugestii i link wyniku wyszukiwania spełniły projektowy cel 44 × 44 px. |

**Układ.** Test biblioteki obejmuje tekst 200% i długą nazwę zestawu. Osobna próba w Chromium ustawiła powiększenie karty przez `chrome.tabs.setZoom(4)`. Szerokość treści zmieniła się z 1280 na 320 px CSS. Sprawdzono wymiary dokumentu i elementów po przewinięciu do długiej nazwy, wielowierszowej odpowiedzi, oceny i obu stron porównania importu. W osobnym teście przy 320 px narzucono interlinię 1,5, odstęp akapitu 2 em, liter 0,12 em i słów 0,16 em. Aktywne pole decyzji można było wskazać w widocznym obszarze. Wymuszone kolory zachowały obrys, tekst błędu i podkreślenie aktywnego linku „Moje zestawy”. Przy ograniczonym ruchu tekst oczekiwania pozostał widoczny. [Biblioteka](../e2e/library-sync.spec.ts) · [Formularze](../e2e/entry.spec.ts) · [Porównanie importu](../e2e/paste.spec.ts)

### Odbiór ręczny i zakres kryteriów

| Środowisko lub proces                            | Status i warunek odbioru                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows, Firefox 160.0.1 i NVDA                  | **Do sprawdzenia.** W środowisku wykonawczym brak dostępnej sesji NVDA. Na pustym koncie przejść od logowania do pierwszego zestawu. W sesji z dwiema powtórkami zanotować faktyczną kolejność pytania, wzorca, pytania o ocenę i komunikatu po zapisie. Sprawdzić zmianę zapytania, edycję drugiej sugestii, konflikt z drugiej strony importu i anulowanie z niewysłaną zmianą. |
| Fizyczny iPhone, Safari i VoiceOver              | **Do sprawdzenia.** Potrzebny dostęp do urządzenia. Powtórzyć te same procesy gestami. Z otwartą klawiaturą wpisać i odsłonić odpowiedź, obrócić telefon, przejść przez formularz, wznowić trening offline. Zapisać model, wersję iOS, wersję Safari, wypowiedziany tekst i pozycję fokusu.                                                                                       |
| Logowanie i nowe hasło z menedżerem haseł        | **Do sprawdzenia.** Sprawdzić natywne autouzupełnienie i wklejenie hasła na obu platformach, także po nieudanej próbie (1.3.5, 3.3.8).                                                                                                                                                                                                                                            |
| Materiały czasowe i sterowanie ruchem            | **Nie dotyczy badanych widoków.** Udostępniają tekstowe fiszki, pola, linki i przyciski. Brak odtwarzania audio/wideo (1.2.1–1.2.5, 1.4.2), funkcji wymagającej ruchu urządzenia (2.5.4), gestów wielopunktowych lub przeciągania (2.5.1, 2.5.7).                                                                                                                                 |
| Treść, język i wskazówki                         | **Do sprawdzenia.** Ocenić dekoracje i ich opisy, instrukcje sensoryczne, tekst w grafice, dodatkową treść po najechaniu lub fokusie, kolejność po zmianie orientacji i język obcojęzycznych fiszek (1.1.1, 1.3.2–1.3.4, 1.4.5, 1.4.13, 3.1.1–3.1.2). Dokument bazowy określa język polski.                                                                                       |
| Czas, ruch i urządzenia wejściowe                | **Do sprawdzenia.** Na rzeczywistym urządzeniu przejść przez wygaśnięcie sesji, odświeżanie w tle i oczekiwanie, sprawdzić możliwość anulowania aktywacji wskaźnikiem oraz brak błysków (2.2.1–2.2.2, 2.3.1, 2.5.2).                                                                                                                                                              |
| Orientacja, przewidywalność i powtarzanie danych | **Do sprawdzenia dla pełnego procesu.** Przejście „Przejdź do treści” ma test klawiaturowy. Przejrzeć pozostałe strony pod kątem pomijania nawigacji, sposobów ich odnalezienia, nagłówków i etykiet, zmian po fokusie lub wpisie, spójności identyfikacji, nawigacji i pomocy oraz ponownego wprowadzania danych (2.4.1, 2.4.5–2.4.6, 3.2.1–3.2.4, 3.2.6, 3.3.7).                |

Przy każdym przebiegu ręcznym wpisać w tej sekcji datę i commit, wersję przeglądarki i czytnika, stan początkowy, czynność, oczekiwany i zaobserwowany odczyt oraz wynik. Barierę zapisać razem z najkrótszym sposobem odtworzenia. Zadanie odbioru pozostaje w [kolejce](TASKS.md#dostępność-wcag-22-aa).

## Odbiór MVP

| Kryteria briefu                                                                                                  | Lokalny dowód                                                                                                                                                                                | Co wymaga dalszego sprawdzenia                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Rejestracja i reset hasła, wejście bez sesji                                                                     | [Auth E2E](../e2e/auth.spec.ts) z lokalną pocztą, [wejście do aplikacji](../e2e/entry.spec.ts)                                                                                               | Dostarczenie poczty i callback HTTPS na testowym środowisku                                                             |
| Zestawy ręczne, czytelne błędy CSV, pomijanie duplikatów, zachowanie treści i postępu, eksport bez utraty treści | [Ścieżka użytkownika](../e2e/study-flow.spec.ts), [testy CSV](../tests/import/csv.test.ts) i [test transakcji importu](../tests/storage/content-repository.test.ts)                          | Pełny eksport i ponowny import z interfejsu na środowisku testowym. Roundtrip samych danych jest sprawdzony jednostkowo |
| Dwa niezależne kierunki, ciągły trening, odporność na szybkie oceny, reset limitu o północy w Warszawie          | [Scheduler](../tests/learning-scheduler.test.ts), [kolejka](../tests/learning-queue.test.ts) i [ścieżka treningu](../e2e/study-flow.spec.ts)                                                 | Pomiar długiej prywatnej sesji z ponownym otwarciem aplikacji                                                           |
| Trwały zapis, offline po przygotowaniu, instalacja PWA                                                           | [Test IndexedDB](../tests/storage/browser.test.mjs) i [E2E z odświeżeniem oraz aktualizacją workera](../e2e/study-flow.spec.ts)                                                              | Instalacja i pełne zamknięcie oraz ponowne uruchomienie na rzeczywistych urządzeniach z wdrożeniem HTTPS                |
| Idempotencja, praca na dwóch urządzeniach, izolacja kont                                                         | [API synchronizacji](../e2e/sync-api.spec.ts), [ścieżka dwóch urządzeń](../e2e/study-flow.spec.ts), [REST](../tests/database/rest.test.mjs) i [RLS](../supabase/tests/account_isolation.sql) | Odbiór w Supabase i Workers w `FLOW-02`                                                                                 |
| Czytelny interfejs i stylistyka Rachmistrza                                                                      | Wspólne kolory i typografia, scenariusze klawiatury i testy axe                                                                                                                              | Ręczny odbiór na docelowych urządzeniach                                                                                |

### Odtworzenie lokalnej kopii

Użyto dwóch tymczasowych baz w lokalnym PostgreSQL z Supabase. W pierwszej uruchomiono migracje Recallio i zapisano dane dwóch syntetycznych kont. Tabela `auth.users` i funkcja `auth.uid()` miały uproszczoną definicję testową, a role PostgreSQL pochodziły ze wspólnego lokalnego klastra. Kopię w formacie custom z `pg_dump -Fc` odtworzono przez `pg_restore --single-transaction --exit-on-error` do drugiej bazy utworzonej z `template0`.

W odtworzonej bazie właściciel odczytał swoją fiszkę i ocenę, a drugie konto nie widziało żadnej z nich. Rola backendu odczytała potwierdzenie operacji, zachowała kursor 3 i poprawnie przydzieliła 4. Usunięto obie tymczasowe bazy i plik kopii. Odbiór środowiska docelowego nadal obejmuje przywrócenie kopii w rzeczywistym Supabase z pełnym Auth oraz test działania aplikacji w Workers.

## Wymagane scenariusze następnych etapów

- Atomiczność: błąd przy każdym store → zero częściowego postępu/outbox.
- Idempotencja: HTTP timeout po commit → retry → jedno zdarzenie i jedna projekcja.
- Wiele kart: równoległy drain i crash lease → brak utraty/dublowania.
- RLS: dwóch użytkowników, anon, manipulacja owner/deck FK, bezpośredni REST/RPC.
- Konflikty: edit/edit, edit/delete, review/delete, review/reset, dwa review offline.
- Zegar: przyszły/cofnięty, DST i granica dnia w Warszawie niezależnie od strefy urządzenia.
- Offline: przygotowanie, utrata sieci, zamknięcie/reload, ponowny sync na buildzie produkcyjnym.
- Aktualizacja: stary klient, SW, DB migration z niewysłanym outbox.
- CSV: polskie znaki, cytaty, multiline, BOM, limit, identyczne wpisy i warianty, roundtrip.
- Trening: małe zestawy, mixed, limit nowych, dodatkowe ćwiczenie i błąd.
- Dostępność: pełna obsługa klawiaturą, widoczny fokus, kontrast, czytelne etykiety, duże pola dotyku, brak przewijania poziomego przy szerokości 320 px.

Wyniki chmurowe wymagają rzeczywistego środowiska Supabase/Workers. Do testów auth używać kont testowych, nie rzeczywistych danych użytkownika.
