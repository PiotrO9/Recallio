# Kolejka Recallio

Wybieraj pierwsze gotowe zadanie. Zależność jest spełniona, gdy wskazany wiersz ma status `DONE` i jego commit został opublikowany na gałęzi kolejki. `IN_PROGRESS` wskazuje bieżące zadanie w lokalnej kopii, a `BLOCKED` wymaga wpisu z warunkiem wznowienia. Po ukończeniu lub zablokowaniu zadania zaktualizuj wiersz w tym samym commicie. Plan techniczny opisuje architekturę i etapy, a ten plik przechowuje stan wykonania.

| ID | Stan | Zależy od | Zakres i odbiór |
| --- | --- | --- | --- |
| SETUP-01 | DONE | — | Przygotuj punkt startowy kolejki. Sprawdź uzgodnione porządki i skill, zweryfikuj dokumentację i testy, opublikuj wspólną bazę zmian na gałęzi roboczej. |
| SCHED-01 | TODO | SETUP-01 | Zaimplementuj deterministyczny adapter FSRS-6 i reset postępu według ADR. Sprawdź stany i projekcje na istniejących scenariuszach referencyjnych. |
| QUEUE-01 | TODO | SCHED-01 | Zaimplementuj kolejkę nowych, terminowych i dodatkowych fiszek oraz powroty sesyjne. Sprawdź limit wspólny dla kierunków, małe zestawy i dzień w strefie profilu. |
| DATA-01 | TODO | SETUP-01 | Przygotuj lokalne migracje, ograniczenia właściciela i rodzica, RLS oraz granty. Sprawdź pustą bazę, upgrade i izolację dwóch kont także przez REST/RPC. |
| PLATFORM-01 | TODO | SETUP-01 | Przygotuj build i smoke test w lokalnym runtime Workers. Sprawdź obsługę Route Handlers, cookies i zależności. Zapisz polecenia uruchomienia i wynik. |
| AUTH-01 | TODO | DATA-01 | Dodaj rejestrację, logowanie, reset, weryfikację sesji i zmianę konta. Sprawdź z lokalnym środowiskiem testowym wygasłą sesję, prywatne trasy i wylogowanie z niewysłanymi zmianami. |
| SYNC-01 | TODO | DATA-01, AUTH-01, SCHED-01 | Dodaj serwerowe push, pull i snapshot. Sprawdź atomowe potwierdzenia, ponowienie po utracie odpowiedzi, kursor konkurencyjnych zapisów, konflikty i odrzucenie dostępu do cudzych danych. |
| SYNC-02 | TODO | SYNC-01 | Połącz transport z lokalnym repozytorium. Sprawdź retry, częściową paczkę, atomowe zastosowanie strony i kursora, wznowienie po ponownym logowaniu oraz rebase snapshotu. |
| FLOW-01 | TODO | SYNC-02, QUEUE-01 | Dodaj minimalną ścieżkę jednej fiszki i możliwość odświeżenia jej bez sieci w lokalnym środowisku integracyjnym. Ocena przeżywa odświeżenie i trafia dokładnie raz na drugie urządzenie, a drugie konto pozostaje odizolowane. |
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
