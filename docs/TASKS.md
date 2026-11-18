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
| FLOW-02 | TODO | FLOW-01, PLATFORM-01 | Potwierdź ścieżkę na środowisku testowym Supabase i Workers. Wymaga dostępu i zgody na operacje zdalne. Zapisz dowody dla synchronizacji, callbacku Auth i dwóch kont. |
| DECK-01 | TODO | FLOW-01 | Dodaj zarządzanie zestawami i fiszkami. Sprawdź kierunek, zachowanie postępu po edycji, jawny reset i usunięcie wygrywające ze starą edycją. |
| TRAIN-01 | TODO | DECK-01, QUEUE-01 | Podłącz produkcyjny trening i ustawienia. Sprawdź oba kierunki, limit, zamrożoną fiszkę, zapis przed przejściem dalej i retry bez podwójnej oceny. Domyślny limit i polityka zmiany strefy wymagają decyzji produktu. |
| IMPORT-01 | TODO | DECK-01 | Dodaj podgląd, wybór akcji, trwały plan zapisu i eksport. Sprawdź wykrywanie duplikatów, zmianę rewizji, wznowienie po błędzie i roundtrip. |
| PWA-01 | TODO | FLOW-01, TRAIN-01 | Dodaj przygotowanie zestawu offline i aktualizację bez utraty outbox. Sprawdź na buildzie produkcyjnym reload po przerwaniu sieci, quota, aktualizację klienta i izolację cache. |
| UX-01 | TODO | TRAIN-01, IMPORT-01, PWA-01 | Zweryfikuj klawiaturę, fokus, kontrast, małe ekrany i stany błędów. Usuń wykryte niezgodności i sprawdź pełne ścieżki użytkownika. |
| RELEASE-01 | TODO | UX-01, FLOW-02 | Powiąż kryteria MVP z wynikami testów, sprawdź kopię i przywracanie bazy oraz smoke test w środowisku docelowym. Publikacja produkcyjna wymaga osobnego zlecenia. |

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
