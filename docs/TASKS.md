# Kolejka Recallio

Wybieraj pierwsze gotowe zadanie. Zależność jest spełniona, gdy wskazany wiersz ma status `DONE` i jego commit został opublikowany na gałęzi kolejki. `IN_PROGRESS` wskazuje bieżące zadanie w lokalnej kopii, a `BLOCKED` wymaga wpisu z warunkiem wznowienia. Po ukończeniu lub zablokowaniu zadania zaktualizuj wiersz w tym samym commicie. Plan techniczny opisuje architekturę i etapy, a ten plik przechowuje stan wykonania.

| ID | Stan | Zależy od | Zakres i odbiór |
| --- | --- | --- | --- |
| SETUP-01 | DONE | — | Przygotuj punkt startowy kolejki. Sprawdź uzgodnione porządki i skill, zweryfikuj dokumentację i testy, opublikuj wspólną bazę zmian na gałęzi roboczej. |
| SCHED-01 | DONE | SETUP-01 | Zaimplementuj deterministyczny adapter FSRS-6 i reset postępu według ADR. Sprawdź stany i projekcje na istniejących scenariuszach referencyjnych. |
| QUEUE-01 | DONE | SCHED-01 | Zaimplementuj kolejkę nowych, terminowych i dodatkowych fiszek oraz powroty sesyjne. Sprawdź limit wspólny dla kierunków, małe zestawy i dzień w strefie profilu. |
| DATA-01 | DONE | SETUP-01 | Przygotuj lokalne migracje, ograniczenia właściciela i rodzica, RLS oraz granty. Sprawdź migrację i izolację dwóch kont przez SQL i REST. Odbiór funkcji RPC należy do `SYNC-01`. |
| PLATFORM-01 | DONE | SETUP-01 | Przygotuj build i smoke test w lokalnym runtime Workers. Sprawdź obsługę Route Handlers, cookies i zależności. Zapisz polecenia uruchomienia i wynik. |
| AUTH-01 | DONE | DATA-01 | Dodaj rejestrację, logowanie, reset, weryfikację sesji i zmianę konta. Sprawdź z lokalnym środowiskiem testowym wygasłą sesję, prywatne trasy i wylogowanie z niewysłanymi zmianami. |
| SYNC-DB | DONE | DATA-01 | Przygotuj rolę backendu, transakcyjną blokadę i licznik konta oraz zapis spójnego snapshotu. Sprawdź izolację, rollback i uprawnienia RPC w PostgreSQL. |
| SYNC-01 | DONE | SYNC-DB, AUTH-01, SCHED-01 | Dodaj serwerowe push, pull i snapshot. Sprawdź atomowe potwierdzenia, ponowienie po utracie odpowiedzi, kursor konkurencyjnych zapisów, konflikty i odrzucenie dostępu do cudzych danych. |
| SYNC-02 | DONE | SYNC-01 | Połącz transport z lokalnym repozytorium. Sprawdź retry, częściową paczkę, atomowe zastosowanie strony i kursora, wznowienie po ponownym logowaniu oraz rebase snapshotu. Dodaj synchronizację przed wylogowaniem z niewysłanymi zmianami. |
| FLOW-01 | DONE | SYNC-02, QUEUE-01 | Dodaj minimalną ścieżkę jednej fiszki i możliwość odświeżenia jej bez sieci w lokalnym środowisku integracyjnym. Ocena przeżywa odświeżenie i trafia dokładnie raz na drugie urządzenie, a drugie konto pozostaje odizolowane. |
| FLOW-02 | BLOCKED | FLOW-01, PLATFORM-01 | Potwierdź ścieżkę na środowisku testowym Supabase i Workers. Wymaga dostępu i zgody na operacje zdalne. Zapisz dowody dla synchronizacji, callbacku Auth i dwóch kont. |
| DECK-01 | DONE | FLOW-01 | Dodaj zarządzanie zestawami i fiszkami. Sprawdź kierunek, zachowanie postępu po edycji, jawny reset i usunięcie wygrywające ze starą edycją. |
| TRAIN-01 | DONE | DECK-01, QUEUE-01 | Podłącz trening i ustawienia wybierane przez użytkownika. Sprawdź oba kierunki, limit, zamrożoną fiszkę, zapis przed przejściem dalej i retry bez podwójnej oceny. |
| SETTINGS-LIMIT | DONE | TRAIN-01 | Ustaw 20 nowych fiszek dziennie podczas pierwszej konfiguracji. Sprawdź zapis tej wartości oraz możliwość późniejszej zmiany. |
| SETTINGS-01 | DONE | TRAIN-01 | Zastosuj nową strefę istniejącego profilu przy najbliższym resecie w dotychczasowej strefie. Sprawdź granicę dnia i zachowanie wcześniejszych wprowadzeń. |
| IMPORT-01 | DONE | DECK-01 | Dodaj podgląd, wybór akcji, trwały plan zapisu i eksport. Sprawdź wykrywanie duplikatów, zmianę rewizji, wznowienie po błędzie i roundtrip. |
| PWA-01 | DONE | FLOW-01, TRAIN-01 | Dodaj przygotowanie zestawu offline i aktualizację bez utraty outbox. Sprawdź na buildzie produkcyjnym reload po przerwaniu sieci, quota, aktualizację klienta i izolację cache. |
| UX-01 | DONE | TRAIN-01, IMPORT-01, PWA-01 | Zweryfikuj klawiaturę, fokus, kontrast, małe ekrany i stany błędów. Usuń wykryte niezgodności i sprawdź pełne ścieżki użytkownika. |
| RELEASE-LOCAL | DONE | UX-01 | Powiąż kryteria MVP z lokalnymi wynikami i odtwórz testową kopię danych w osobnej bazie. Sprawdź zachowanie fiszki, jej oceny, kursora i izolacji kont. |
| ENTRY-01 | DONE | AUTH-01, DECK-01 | Wejście do aplikacji prowadzi do logowania lub własnych zestawów. Usunięto publiczny trening przykładowy. |
| RELEASE-01 | TODO | RELEASE-LOCAL, FLOW-02, SETTINGS-LIMIT, SETTINGS-01 | Uzupełnij dowody dla środowiska docelowego, w tym próbę kopii i odtworzenia oraz test działania aplikacji. Publikacja produkcyjna wymaga osobnego zlecenia. |
| REFACTOR-1 | DONE | — | Zgodność decyzji CSV w podglądzie i przy zapisie. |
| REFACTOR-2 | DONE | — | Odróżnienie zapisu od odświeżenia po zapisie. |
| REFACTOR-3 | DONE | — | Wspólne przygotowanie zestawu offline. |
| REFACTOR-4 | DONE | — | Przygotowanie i ponowne przeliczenie tej samej oceny poza widokiem. |
| REFACTOR-5 | DONE | — | Wspólna zmiana treści dla zapisu lokalnego i odtwarzania snapshotu. |
| REFACTOR-6 | DONE | — | Nawigacja biblioteki wraz z pozycją powrotu. |
| REFACTOR-7 | DONE | — | Wspólna konfiguracja lokalnych usług konta. |
| REFACTOR-8 | DONE | — | Limity treści współdzielone przez import, UI i kontrakty. |
| REFACTOR-9 | TODO | — | Osobne scenariusze E2E i współdzielone przygotowanie kont. |
| REFACTOR-10 | TODO | — | Pomiar i weryfikacja kosztu opróżniania lokalnej kolejki. |

## Wyniki i blokady

Dodawaj po jednym krótkim wpisie na wynik. Dla `DONE` podaj ID, co dostarczono i weryfikację. Dla `BLOCKED` podaj ID, co udało się zrobić, przyczynę z dowodem oraz sprawdzalny warunek wznowienia. Jeśli część prac zachowano wyłącznie lokalnie, odnotuj jej lokalizację lub hash.

- `SETUP-01` — uporządkowano dokumentację, usunięto koordynator pracy równoległej i uruchomiono kolejkę. Przeszły walidacja skilla, typecheck, 53 testy, build, test IndexedDB w Chromium i 4 testy E2E.
- `SCHED-01` — dodano wersjonowany adapter FSRS-6, limitowanie czasu zdarzeń i reset epoki rozpoznawany również po snapshotcie. Przeszły typecheck, 63 testy, build, próbka projekcji w bundlu Chromium, test zapisu w Chromium i 4 testy E2E. Weryfikacja runtime Workers należy do `PLATFORM-01`.
- `QUEUE-01` — dodano kolejkę domenową z pierwszeństwem powrotów po błędach, unikaniem powtórzenia fiszki przy dostępnej alternatywie oraz limitem według dnia w strefie profilu. Przeszły typecheck, 68 testów i build. Podłączenie do sesji użytkownika należy do `TRAIN-01`.
- `DATA-01` — dodano migrację i konfigurację lokalnego Supabase, ograniczenia właściciela i rodzica oraz prywatny schemat synchronizacji. Przeszły inicjalizacja i kontrola historii migracji, 12 asercji pgTAP, test REST dwóch kont, doradcy Supabase, typecheck, 68 testów i build. Dowód dla funkcji RPC zostaje w odbiorze `SYNC-01`.
- `PLATFORM-01` — dodano lokalny build OpenNext i testy w Wrangler. Przeszły typecheck, 68 testów, oba buildy i po 6 testów E2E na każdej platformie. Sonda lokalna potwierdziła ciasteczka i FSRS. Audyt zależności uruchomieniowych przeszedł. Pełny audyt wykazał podatności narzędzi OpenNext opisane w dokumentacji weryfikacji.
- `AUTH-01` — dodano obsługę kont, reset przez e-mail, serwerową weryfikację sesji i bezpieczne wylogowanie z IndexedDB. Przeszły typecheck, 69 testów, build Next.js i OpenNext oraz po 8 testów E2E na obu runtime. Wysyłka outbox przed wylogowaniem wymaga `SYNC-02`.
- `SYNC-DB` — wydzielono migrację roli backendu bez logowania, blokady i kursora konta oraz magazynu stron snapshotu. Przeszły upgrade lokalnej bazy, 21 asercji pgTAP, doradcy Supabase, typecheck, 69 testów i build.
- `SYNC-01` — dodano prywatne endpointy, atomowe potwierdzenia, kanoniczną projekcję FSRS i niezmienne strony snapshotu. Przeszły typecheck, 69 testów, oba buildy, 10 scenariuszy E2E w Next.js oraz test API na obu profilach Chromium w lokalnym Wranglerze.
- `SYNC-02` — połączono kolejkę IndexedDB z API, ponawianiem identycznego payloadu, ochroną przed zmianą konta i atomowym zapisem kursora. Dodano synchronizację przed wylogowaniem. Przeszły typecheck, 73 testy, build, test competing tabs w Chromium i 10 E2E. Klient wysyła po jednej operacji, aby uwzględnić rewizję z potwierdzenia przed zależną edycją.
- `FLOW-01` — podłączono trening dla wcześniej przygotowanych danych konta oraz minimalną stronę offline. Scenariusz E2E przeszedł na desktop i mobile w Next.js oraz lokalnym Wranglerze. Ocena przeżyła przeładowanie bez sieci, została wysłana raz, pojawiła się na drugim urządzeniu i pozostała prywatna. Przeszły też typecheck, 73 testy i test IndexedDB w Chromium.
- `FLOW-02` — lokalny odpowiednik przeszedł w Next.js i Wranglerze. Zakres bieżącego zlecenia obejmuje Git i lokalne środowisko. Odbiór chmurowy można wznowić po otrzymaniu wskazanych środowisk testowych Supabase i Cloudflare oraz osobnego zlecenia na ich konfigurację i wykonanie testu. `RELEASE-01` czeka na ten dowód.
- `DECK-01` — dodano wyszukiwanie i edycję zestawów i fiszek, wybór kierunku, potwierdzanie usunięcia i reset zakresu kierunku. E2E na obu profilach potwierdziły zachowanie postępu po edycji i odrzucenie późnej edycji usuniętej fiszki. Przeszły typecheck, 73 testy, build i scenariusze dema.
- `TRAIN-01` — dodano jawny wybór limitu i pierwszej strefy, opcjonalne liczniki, dodawanie nowych kart na życzenie, skróty i zakończenie sesji. Symulowany błąd transakcji w E2E zostawia odkrytą fiszkę, a ponowienie wykorzystuje tę samą ocenę. Przeszły typecheck, 73 testy, build i 12 E2E.
- `SETTINGS-LIMIT` — pierwsza konfiguracja domyślnie proponuje 20 nowych fiszek dziennie. E2E potwierdziły zapis i synchronizację 20, zmianę na 0 i zachowanie tej wartości po odświeżeniu. Przeszły typecheck, 74 testy, build i 14 E2E.
- `SETTINGS-01` — zmiana strefy zachowuje licznik do najbliższego resetu w dotychczasowej strefie. Testy potwierdziły zmianę przy granicy dnia, DST, powtórzoną datę kalendarzową i utrwalenie terminu po synchronizacji. Przeszły typecheck, 76 testów, 21 asercji pgTAP, oba buildy, 14 E2E w Next.js oraz test treningu na obu profilach w lokalnym Wranglerze.
- `IMPORT-01` — dodano podgląd CSV, rozstrzyganie wierszy, zapis kursora importu razem z operacją i eksport w formacie kanonicznym. Przeszły typecheck, 74 testy, build i 12 E2E, w tym import z pominięciem duplikatu i pobranie wyeksportowanego pliku na obu profilach.
- `PWA-01` — dodano manifest i ikony, przygotowanie wybranego zestawu po pełnym snapshocie oraz aktualizację workera z zachowaniem kolejki ocen. Przeszły typecheck, 74 testy, test IndexedDB i scenariusz PWA na obu profilach Chromium w Next.js i lokalnym Wranglerze. Test objął brak miejsca, udane ponowienie, aktualizację z niewysłaną oceną i izolację cache.
- `UX-01` — poprawiono kontrast, fokus, link pomijający nawigację i rozmiary pól dotyku. Ocenianie klawiszami 1–4 działa po przejściu fokusem do ocen. Przeszły typecheck, 74 testy, oba buildy i po 14 E2E z audytem axe oraz kontrolą układu przy 320 px.
- `RELEASE-LOCAL` — [powiązano kryteria MVP z testami](VERIFICATION.md#odbiór-mvp) i odtworzono syntetyczną kopię PostgreSQL w osobnej bazie. Zachowano fiszkę, ocenę, potwierdzenie, kursor i izolację dwóch kont. `RELEASE-01` czeka na `FLOW-02`.
- `ENTRY-01` — sprawdzono wejście gościa, bibliotekę po zalogowaniu i potwierdzenie konta. Przeszły typecheck, 73 testy, build i 10 E2E.

- `REFACTOR-1` — Podgląd i zapis używają wspólnej decyzji. E2E obejmuje dwa wiersze przypisane do tej samej fiszki i korektę wyboru.

- `REFACTOR-2` — Błąd odczytu po udanym zapisie ma własne ponowienie. E2E wymusza awarię odświeżenia biblioteki i ustawień.

- `REFACTOR-3` — Wspólne przygotowanie zestawu rozpoznaje brak miejsca. Oba ekrany przeszły próbę nieudanego przygotowania i ponowienia.

- `REFACTOR-4` — Utworzenie zdarzenia i przeliczenie projekcji są osobne. E2E potwierdza ponowienie tej samej oceny po błędzie zapisu.

- `REFACTOR-5` — Zapis i rebase używają tej samej projekcji. Testy repozytorium sprawdzają rollback, konflikt rewizji, usunięcie rodzica i retry.

- `REFACTOR-6` — Przejścia biblioteki mają wspólne miejsce. E2E sprawdza filtr, przewijanie, fokus i historię po ponownym otwarciu zestawu.

- `REFACTOR-7` — Pięć ekranów tworzy usługi przez jedną fabrykę per konto. Ponowienie w panelu sprawdza termin przed odczytem. Testy obejmują dwa konta i retry.

- `REFACTOR-8` — Limity pól mają jedno źródło. Test porównuje akceptację CSV i kontraktu na granicy oraz o jeden znak powyżej.
