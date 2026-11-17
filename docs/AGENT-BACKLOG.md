# Backlog do niezależnej pracy agentów

Stan początkowy: 2026-11-17. Wszystkie zadania poniżej TODO; wykonany bootstrap opisuje README. Nie uruchomiono w tym zadaniu kilku agentów. To plan do przyszłego podziału pracy.

## Protokół przydziału

Status pracy zapisuje wspólny rejestr we wspólnym katalogu Git. Instrukcje i komendy: `docs/COORDINATION.md`. Integrator odpowiada za przegląd, integrację i oznaczenie DONE; zależności sprawdza rejestr. Osobny worktree per zadanie po skonfigurowaniu Git. Przed konfiguracją Git osobne kopie robocze. Polecenia testowe mają działać z katalogu konkretnego worktree.

Gotowość do startu: wszystkie zależności DONE, zamrożony kontrakt, wskazane katalogi i fixture. Gotowość do integracji: kryteria odbioru zaliczone, brak ukrytych zmian kontraktu, migracje opisane, wynik przekazany według szablonu na końcu. Integrator rozwiązuje konflikty i uruchamia testy po scaleniu. Zmiana wspólnej zależności lub lockfile jest osobnym zadaniem integratora; agenci zgłaszają potrzebę, nie instalują równolegle.

## Graf zależności

```text
CORE-01 ─┬─ DATA-01 ── AUTH-01 ── SYNC-01 ─┐
         ├─ LOCAL-01 ───────────────────────┼─ SYNC-02 ── VERTICAL-01
         ├─ LEARN-01 ── LEARN-02 ──────────┘                 │
         ├─ CSV-01 ──────────────────────────────────────────┼─ IMPORT-01
         └─ PLATFORM-01 ─────────────────────────────────────┘
LOCAL-01 + SYNC-02 + AUTH-01 ── DECK-01 ── IMPORT-01
LEARN-02 + VERTICAL-01 + DECK-01 ── TRAIN-01
VERTICAL-01 + PLATFORM-01 ── PLATFORM-02
TRAIN-01 + IMPORT-01 + PLATFORM-02 ── UX-01 ── RELEASE-01
```

Przykładowe fale przy 4 agentach: najpierw integrator CORE-01; następnie A DATA-01, B LOCAL-01, C LEARN-01, D PLATFORM-01; po zwolnieniu slotu CSV-01. Nie jest wymagane uruchamianie wszystkich naraz. SYNC-01 wymaga już LEARN-02 do wyliczania kanonicznego postępu (może wcześniej rozwijać transport na mocku).

## CORE-01 — zamrożenie kontraktów

- Właściciel: integrator/architekt. Zależności: brak. Priorytet P0.
- Pliki: src/contracts/**, docs/CONTRACTS.md, docs/decisions/**, package.json/lock.
- Wykonaj: typy DTO i runtime schema; format błędów, envelope sync, wersje, limity; porty domeny/storage; przykłady poprawne i błędne; ADR sesji, retencji, czasu i resetu. Rozstrzygnij domyślny limit nowych i licznik z właścicielem produktu przed implementacją ustawień.
- Odbiór: walidatory odrzucają cudzy userId, złe UUID/rating/time/version/rozmiary; JSON roundtrip bigint-string; wszystkie moduły mają jedno źródło typów; testy fixtures API.
- Odblokowuje: DATA-01, LOCAL-01, LEARN-01, CSV-01, PLATFORM-01.

## DATA-01 — baza i bezpieczeństwo

- Właściciel: agent danych. Zależności: CORE-01. P0.
- Pliki: supabase/**, tests/database/**; bez zmian UI i lokalnej bazy.
- Wykonaj: migracje tabel, composite FK, indeksy, polityki i granty; bazowy RPC transakcyjny/receipt; seed dwóch kont. Przygotuj kontrakt wywołania RPC dla serwera i blokadę sync_heads.
- Odbiór: migracja od pustej bazy i upgrade; konto A nie odczytuje/edytuje B przez REST ani RPC; nie można przenieść ownera ani podpiąć karty pod cudzy deck; rollback po błędzie; jeden receipt przy retry; cursor nie pomija commitów konkurencyjnych transakcji.
- Wynik: migracje + testy SQL/integracyjne + instrukcja lokalnego Supabase, bez sekretów.

## LOCAL-01 — produkcyjny zapis lokalny

- Właściciel: agent storage. Zależności: CORE-01. P0.
- Pliki: src/storage/** z wyłączeniem zmian zachowania demo bez potrzeby, tests/storage/**.
- Wykonaj: schemat, migracje, repozytoria, atomowy commitReview, outbox leasing, snapshot generation, account namespace, blocked/versionchange.
- Odbiór: awaria każdej części tx nie zapisuje połowy stanu; retry i konkurencja dwóch kart nie dublują odpowiedzi; migracja nie usuwa outbox; wznowienie po crashu; konta izolowane; brak wycieku otwartych połączeń.
- Wynik: implementacja portów i fixture do sync, bez HTTP i UI.

## LEARN-01 — wybór schedulera

- Właściciel: agent domeny. Zależności: CORE-01. P0.
- Pliki: docs/decisions/learning-*.md, tests/fixtures/learning/**; nowa zależność przez integratora.
- Wykonaj: porównanie FSRS/SM-2 na scenariuszach briefu, sprawdzenie aktualnych pierwotnych źródeł, licencji i wersji. Reguły practice, niepamiętania, błędnego zegara, obu kierunków i resetu; liczby/parametry uzasadnione.
- Odbiór: tabela oczekiwanych wyników dla 1 karty, 2 kierunków, 20 szybkich ocen, dni przerwy, błędu w practice, spóźnionego eventu. ADR zatwierdzony przez integratora. Bez tego LEARN-02 nie rozpoczyna kodowania algorytmu.

## LEARN-02 — silnik i kolejka

- Właściciel: agent domeny. Zależności: LEARN-01. P0.
- Pliki: src/domain/learning/**, tests/learning/**.
- Wykonaj: Scheduler, QueuePolicy, nowe/terminowe/dodatkowe, limit unikalnych cardId, anti-repeat, epoch reset, deterministyczne projekcje.
- Odbiór: golden fixtures LEARN-01; injection czasu/losowości; brak importów React/DB/HTTP; niezależność kierunków; DST; zero materiału; dodatkowe ćwiczenie nie zawyża terminu; same inputy dają identyczny wynik w Node i browser bundle.

## PLATFORM-01 — próba Workers

- Właściciel: agent platformy. Zależności: CORE-01. P0.
- Pliki: config wdrożenia, scripts/platform/**, docs/DEPLOYMENT.md; zmiany package/lock tylko integrator.
- Wykonaj: porównaj aktualny OpenNext i rekomendowaną przez Cloudflare ścieżkę vinext; zachowaj Next.js jako wymaganie. Wybierz na podstawie zgodności z Route Handlers, cookies/Auth, bibliotekami i SW. Udokumentuj przypięte wersje i środowiska preview/prod.
- Odbiór lokalny: build i smoke test w runtime Workers, nie tylko next start. Odbiór chmurowy: preview URL, health endpoint, callback Auth po AUTH-01. Jeśli brak dostępu, zgłoś konkretny brak; nie oznaczaj wdrożenia DONE.
- Nie publikuje bez zlecenia i konfiguracji użytkownika. Nie zmienia runtime wyłącznie dlatego, że dokumentacja rekomenduje alternatywę.

## CSV-01 — parser, klasyfikacja i eksport

- Właściciel: agent importu. Zależności: CORE-01. P1.
- Pliki: src/domain/import/**, tests/import/**, public/examples/**.
- Wykonaj: parser z limitem, normalizacja porównawcza, błędy z numerami, warianty, konflikty przykładów, eksport 4 pól, wzór CSV i port ImportPlan. Bibliotekę parsera wybiera z integratorem.
- Odbiór: BOM, przecinek/średnik, polskie znaki, cytaty, CRLF, multiline, puste i nadmiarowe kolumny, limit rozmiaru; roundtrip surowej treści; powtórka w pliku i bazie; brak mutacji przed commit.

## AUTH-01 — konto i granica danych

- Właściciel: agent kont. Zależności: DATA-01, LOCAL-01. P0.
- Pliki: src/features/auth/**, src/server/auth/**, src/app/(auth)/**, tests/auth/**.
- Wykonaj: signup/login/reset/redirect, weryfikacja na serwerze, zmiana konta, wylogowanie pending, odtworzenie sesji. Konfiguracja SMTP opisana, bez własnego systemu haseł.
- Odbiór: invalid token, wygasła sesja z outbox, login do tego samego i innego konta, wylogowanie z odrzuceniem i bez, nieautoryzowany callback, brak prywatnych danych w cache SSR.

## SYNC-01 — serwer operacji

- Właściciel: agent backendu. Zależności: DATA-01, AUTH-01, LEARN-02. P0.
- Pliki: src/server/sync/**, src/app/api/v1/sync/**, tests/server/**. Zmiany RPC przekazuje właścicielowi migracji.
- Wykonaj: push/pull/snapshot, walidacja, receipt/hash, kanoniczna projekcja, usunięcia, epoch, stabilny cursor, kontrola paginacji i limits.
- Odbiór: utrata odpowiedzi po commit i retry; inny payload z tym samym ID; concurrent edit 409; delete+review; 2 urządzenia; błędny zegar; snapshot podczas edycji; próba przekroczenia właściciela; rate limit.

## SYNC-02 — klient synchronizacji

- Właściciel: agent sync. Zależności: LOCAL-01, SYNC-01. P0.
- Pliki: src/sync/**, tests/sync/**; nie zmienia komponentu treningu.
- Wykonaj: drain/lease, retry/backoff, transport, pull pages, atomic apply+cursor, konflikt treści, auth pause, reset snapshot z rebase outbox.
- Odbiór: disconnect przed/po commit, crash w apply, 401 bez utraty danych, częściowy batch, expiry lease, dwa taby, tombstone, brak rewind aktywnej karty.

## VERTICAL-01 — pionowy scenariusz

- Właściciel: integrator. Zależności: PLATFORM-01, AUTH-01, SYNC-02, LEARN-02. P0.
- Pliki: e2e/vertical/**, minimalna kompozycja src/app, docs/VERIFICATION.md.
- Wykonaj: konto A i jedna karta → pobranie → odłączenie sieci → ocena → reload → online sync → drugie urządzenie; równolegle konto B.
- Odbiór: odpowiedź przeżywa reload, jest tylko raz w historii i na drugim urządzeniu; B nie widzi A; faktyczny Workers i Supabase. To bramka pełnej implementacji produktu, nie makieta.

## DECK-01 — zarządzanie treścią

- Właściciel: agent zestawów. Zależności: LOCAL-01, AUTH-01, SYNC-02. P1.
- Pliki: src/features/decks/**, src/app/decks/**, tests/decks/**.
- Wykonaj: lista/wyszukiwanie/CRUD zestawu i karty, kierunek, reset jawny, potwierdzenie delete, stany synchronizacji i offline.
- Odbiór: własne zestawy tylko z kontem; walidacja i cancel bez mutacji; drobna edycja zachowuje postęp; konflikty bez cichej utraty; delete nie odtwarza się po sync starego urządzenia.

## IMPORT-01 — pełny import/eksport

- Właściciel: agent importu. Zależności: CSV-01, DECK-01, SYNC-02, VERTICAL-01. P1.
- Pliki: src/features/import/**, src/app/decks/[id]/import/**, e2e/import/**.
- Wykonaj: wybór pliku/celu, preview, rozstrzygnięcia, podsumowanie, commit/resume, eksport. Zachowaj plan do ponowienia.
- Odbiór: „Pomiń duplikaty” nie usuwa istniejących kart; crash/retry bez kopii; anulowanie; zmiana wersji po preview; eksport-import zachowuje treść i nie resetuje postępu.

## TRAIN-01 — trening produkcyjny

- Właściciel: agent treningu. Zależności: LEARN-02, VERTICAL-01, DECK-01. P1.
- Pliki: src/features/training/**, src/app/study/**, e2e/training/**.
- Wykonaj: kontroler stanów, snapshot fiszki, local commit/retry, oceny, mixed mode, limit, więcej nowych, subtelne ukończenie planu, zakończenie w dowolnej chwili; demo podpina wspólny silnik z osobnym adapterem.
- Odbiór: brak double click, natychmiastowego rewersu i przeskoku po nieudanym zapisie; działanie na małym zestawie; koniec planu nie zatrzymuje nauki; błędy storage/sync i skróty klawiaturowe.

## PLATFORM-02 — PWA i cykl aktualizacji

- Właściciel: agent platformy. Zależności: VERTICAL-01, PLATFORM-01. P1.
- Pliki: public/icons/**, src/app/manifest.ts, src/pwa/**, e2e/offline/**; konfiguracja przez integratora.
- Wykonaj: manifest, SW, przygotowanie zestawu, quota, aktualizacja, migration handshake.
- Odbiór: produkcyjny reload offline; brak cache cudzych danych; przerwany download nie daje ready; update z pending outbox; stare karty i wersja DB; instalacja na docelowych urządzeniach.

## UX-01 — spójność i dostępność

- Właściciel: agent UI. Zależności: TRAIN-01, IMPORT-01, PLATFORM-02. P1.
- Pliki: src/components/ui/**, src/app/globals.css (wyłączna własność na czas zadania), e2e/accessibility/**, docs/UX.md.
- Wykonaj: zestaw tokenów Rachmistrza, ustawienia liczników, focus/error/loading/empty, język PL, małe ekrany, zoom, reduced motion.
- Odbiór: klawiatura przez wszystkie ścieżki, 320px bez poziomego scrolla, kontrast, etykiety, touch targets, testy axe plus manualny przegląd fokusu.

## RELEASE-01 — odbiór MVP

- Właściciel: integrator/QA. Zależności: UX-01 i wszystkie funkcje MVP. P0 przed wydaniem.
- Pliki: e2e/release/**, docs/RELEASE-CHECKLIST.md, CI workflow.
- Wykonaj: powiąż każdy punkt sekcji 20 briefu z dowodem; testy dwóch urządzeń/kont, awarie, migracje, limity CSV, produkcyjny Workers, instrukcja kopii i przywrócenia bazy.
- Odbiór: zero krytycznych defektów danych/izolacji; powtarzalny pipeline npm ci → typy → testy → build → E2E → Workers smoke; opublikowany changelog i znane ograniczenia. Wydanie dopiero po faktycznej walidacji hostingu i zleceniu publikacji.

## Szablon przekazania zadania agentowi

```text
Zadanie: <ID z tego dokumentu>
Baza: <commit / kopia>
Katalog roboczy: <bezwzględna ścieżka>
Zależności DONE: <ID i dowody>
Kontrakt: docs/CONTRACTS.md <wersja/commit>
Możesz zmieniać: <wyliczone katalogi>
Nie zmieniaj wspólnych plików bez koordynacji.
Wykonaj zakres i testy odbioru. Oddaj kod, wyniki i ograniczenia.
Nie publikuj, nie pushuj, nie modyfikuj cudzej pracy.
```

## Szablon wyniku

```text
ID / status / właściciel / bazowy commit:
Zmiana zachowania:
Pliki:
Kontrakty/migracje:
Wykonane komendy + wyniki:
Scenariusze niezweryfikowane:
Ryzyka i dalsze prace:
Odblokowane zadania:
```
