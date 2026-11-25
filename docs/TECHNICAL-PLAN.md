# Plan techniczny Recallio

Plan opisuje architekturę MVP. Bieżący stan funkcji i odbioru środowiska docelowego jest w [kolejce](TASKS.md), a wyniki testów w [weryfikacji](VERIFICATION.md).

## 1. Zakres pierwszego przyrostu

Wejście do aplikacji prowadzi do logowania albo do prywatnej biblioteki zestawów. Trening korzysta z FSRS-6 i historii ocen przechowywanej lokalnie w IndexedDB.

MVP obejmuje pełny zakres z briefu: konta, prywatne zestawy, CSV, dwa kierunki, planowanie, offline/PWA i synchronizację. Brak publicznego katalogu, multimediów, AI, płatności i aplikacji natywnych.

## 2. Decyzje techniczne

| ID  | Decyzja                                                              | Status / warunek                                                                 |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| D01 | Next.js App Router + React + TS strict + CSS, npm                    | Przyjęta; wersje w lockfile                                                      |
| D03 | idb jako cienka warstwa IndexedDB                                    | Używana przez repozytorium konta                                          |
| D04 | Zapisy przez Route Handlers i transakcje PostgreSQL                  | Auth używa SDK Supabase, synchronizacja ograniczonej roli bazy                   |
| D05 | Historia zdarzeń i materializowany postęp per kierunek               | Wdrożone w treningu i synchronizacji                                             |
| D06 | FSRS-6 z wersjonowanym profilem                                      | Wdrożony wg [decyzji o schedulerze](decisions/learning-scheduler.md)              |
| D07 | PWA przez jawnie wersjonowany service worker                         | Własny service worker w `public/study-sw.js`                                     |
| D08 | Workers przez OpenNext                                               | Weryfikacja lokalna w Wranglerze, odbiór wdrożenia w kolejce                      |
| D09 | Przykład po odsłonięciu, po stronie odpowiedzi                       | Dostępny w treningu                                                  |
| D10 | Limit nowych = unikalne cardId w lokalnym dniu, oba kierunki wspólne | Domyślnie 20 dziennie, zmieniane w ustawieniach                                  |
| D11 | Licznik sesji = zaakceptowane odpowiedzi, domyślnie ukryty w MVP     | Dostępny w ustawieniach treningu                              |
| D12 | Wylogowanie usuwa cache konta po sync lub świadomym odrzuceniu       | Robocza; szczegóły poniżej                                                       |

Zmianę decyzji zapisz w krótkim ADR w `docs/decisions/NNN-temat.md`. Uwzględnij kontekst, rozważone opcje, decyzję oraz wpływ na kontrakty, migracje i testy.

## 3. Warstwy i zależności

```text
app → features → domain
             ↘ porty repozytoriów ← storage (IndexedDB)
                                 ← sync → API → server → Supabase RPC/Postgres
                          contracts ↑       ↑
```

Domena nie importuje adapterów. UI nie wykonuje SQL ani requestów Supabase. Serwer nie przyjmuje wyliczonego przez klienta postępu jako zaufanego. Kontrakty nie importują komponentów. Auth jest osobnym adapterem, z weryfikacją tożsamości w każdym prywatnym handlerze. Prywatne odpowiedzi HTTP mają `Cache-Control: no-store`.

Docelowe moduły: `domain/learning`, `features/training`, `features/decks`, `features/import`, `features/auth`, `features/settings`, `storage`, `sync`, `contracts`, `server`, `components/ui`.

## 4. Model danych chmurowych

Identyfikatory UUID generowane na urządzeniu. Czas UTC (timestamptz), stała strefa nauki `Europe/Warsaw`. Wersje monotoniczne bigint. Typy DTO reprezentują bigint jako string, bez utraty precyzji JSON.

| Tabela             | Klucz / pola                                                                                                                                          | Ograniczenia i indeksy                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| user_settings      | user_id, timezone, new_limit, show_due, show_session, revision                                                                                        | PK user_id, FK auth.users, limit >= 0                                                          |
| decks              | id, user_id, name, direction_mode, revision, deleted_at                                                                                               | unique(user_id,id), index(user_id,deleted_at), nazwa 1–120                                     |
| cards              | id, user_id, deck_id, side_a/b, example_a/b, revision, deleted_at                                                                                     | composite FK(user_id,deck_id), A/B 1–4000, przykłady <=8000, index(user_id,deck_id)            |
| review_events      | id, user_id, card_id, direction, rating, device_id, client_seq, occurred_at, received_at, effective_at, base_revision, algorithm_version, disposition | unique(user_id,id), unique(user_id,device_id,client_seq), rating 1–4, indeks historii kierunku |
| progress           | user_id, card_id, direction, epoch, state, due_at, last_effective_at, revision, algorithm_version                                                     | PK(user_id,card_id,direction), index(user_id,due_at), composite FK do cards                    |
| progress_resets    | id, user_id, card_id, direction, epoch, server_order                                                                                                  | jawne resetowanie bez usuwania historii                                                        |
| introductions      | user_id, card_id, first_effective_at, study_day                                                                                                       | unique(user_id,card_id); limit dotyczy obu kierunków                                           |
| operation_receipts | user_id, operation_id, payload_hash, result, created_at                                                                                               | unique(user_id,operation_id), identyczne ID + inny payload = konflikt                          |
| sync_heads         | user_id, last_sequence                                                                                                                                | blokada per użytkownik serializuje zapis i przydział kursora                                   |
| change_log         | user_id, sequence, entity, entity_id, revision, payload/tombstone                                                                                     | unique(user_id,sequence), index(user_id,sequence)                                              |
| import_batches     | id, user_id, deck_id, status, created_at                                                                                                              | stabilne identyfikatory zaakceptowanych wierszy                                                |

Tabela opisuje model roboczy. Przy tworzeniu migracji uwzględnij [kontrakty v1](CONTRACTS.md), w tym limity paczki i reset postępu per kierunek. Soft delete chroni przed odtworzeniem usuniętego materiału przez stare urządzenie. Historia pozostaje w zakresie konta; usunięcie konta usuwa również historię. Tombstone i receipts w pierwszej wersji bez automatycznego TTL; GC dopiero z protokołem pełnej resynchronizacji i polityką retencji.

RLS na wszystkich tabelach z danymi użytkownika. Własność `(select auth.uid()) = user_id`; UPDATE wymaga USING i WITH CHECK. Złożone FK uniemożliwiają podpięcie karty pod cudzy zestaw. Klient nie może arbitralnie zmienić projekcji postępu. Zapisy tylko kontrolowanym RPC; minimalne uprawnienia tabel, funkcje bez publicznego EXECUTE. Jeżeli wymagana SECURITY DEFINER, jawnie sprawdzić auth.uid, search_path, wszystkie FK i uprawnienia. Testować także dostęp bezpośrednim REST/RPC, z pominięciem Next.js. Klucz administracyjny nie jest potrzebny w ścieżce użytkownika.

## 5. IndexedDB i atomowość

Repozytorium konta używa osobnej bazy `recallio-user-{userId}`, numer schematu niezależny od wersji aplikacji. Stores: decks, cards, progress, reviewEvents, introductions, outbox, meta, conflicts. Klucze zawierają tożsamość lub baza stanowi twardą granicę konta.

Ocena: przygotuj niezmienne zdarzenie z ID → oblicz projekcję → jedna transakcja readwrite zapisuje event, progress, introduction i outbox → czekaj na tx.done → dopiero następna fiszka. Błąd dowolnego zapisu wycofuje wszystko. Retry nie zmienia rating, czasu ani ID. Przycisk blokowany synchronicznie, nie tylko stanem React.

Migracje muszą mieć fixture poprzedniej wersji i test przerwania. Nie usuwaj bazy na błędzie. `versionchange` zamyka stare połączenie; blokada aktualizacji pokazuje komunikat o innych kartach. Wiele kart przeglądarki: Web Locks/BroadcastChannel jako optymalizacja, transakcje i unikalne ID jako gwarancja. Outbox ma lease z expiry; po crashu inna karta może ponowić.

Repozytorium konta etapuje snapshot w osobnej generacji, do 32 MiB na generację. Transport i PWA muszą obsłużyć limit miejsca i sprzątanie. Rebase oczekujących operacji zatrzymuje się przy konflikcie rewizji, braku rodzica lub braku właściwej polityki schedulera/resetu. Klient synchronizacji i UI muszą pokazać zablokowaną operację i zachować ją do decyzji użytkownika.

## 6. Synchronizacja

1. Wyślij uporządkowany batch pending operations, z ID i baseRevision.
2. API weryfikuje sesję, schemat, rozmiar i własność. userId pochodzi z sesji.
3. Transakcja blokuje sync_heads konta; sprawdza receipt; waliduje operację; zapisuje treść/zdarzenie/projekcję, change_log i receipt wspólnie. Kolejność kursora jest kolejnością zatwierdzonych transakcji. Sam bigserial bez serializacji commitów nie gwarantuje braku utraty zmian przy pull.
4. API zwraca wynik dla każdej operacji. Nie uznawaj całego batcha za sukces po HTTP 200.
5. Klient atomowo stosuje odpowiedź i usuwa zaakceptowane pozycje outbox. Retry po utracie odpowiedzi odczytuje receipt.
6. Pull pobiera zmiany po kursorze z limitem i hasMore. Nowy kursor zapisuj razem z całą stroną zmian w IndexedDB. Nowe zmiany po utworzeniu strony są pobierane w następnym pull.
7. Rozpoczęta fiszka ma zamrożony snapshot; zmiany synchronizacji obowiązują od kolejnej.

Przy timeout, 5xx lub 429 zastosuj wykładniczy backoff z jitterem, limitem odstępu i obsługą Retry-After. HTTP 401 wstrzymuje wysyłkę do ponownego uwierzytelnienia, a 400/422 wymaga zachowania błędu do naprawy. HTTP 409 dotyczy konfliktu całego żądania. Konflikty encji klient odczytuje z wyników poszczególnych operacji. W trybie offline wstrzymaj transport. Synchronizację uruchamiaj po odzyskaniu sieci, po powrocie do aplikacji i po lokalnym zapisie. Background Sync może uzupełniać ten mechanizm.

### Macierz konfliktów

| Sytuacja                                   | Polityka                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dwie edycje tej samej treści               | Kontrola rewizji. Po `revision_conflict` klient pokazuje wersję serwera i kopię lokalną. Użytkownik wybiera wersję serwera albo zapisuje swoją jako nową operację. |
| Edycja i review                            | niezależne rewizje; review odnosi się do wersji oglądanej treści                                                                                                   |
| Dwa urządzenia ćwiczą kierunek             | zachowaj oba zdarzenia; serwer wylicza kanoniczną projekcję, klient uzgadnia swoją                                                                                 |
| Delete kontra stara edycja/review          | nie przywracaj karty; review zachowane jako ignored_deleted, nie zmienia progress                                                                                  |
| Reset kontra późna odpowiedź sprzed resetu | epoch powoduje zachowanie historii bez wpływu na nowy postęp                                                                                                       |
| Zły zegar                                  | occurredAt pozostaje dowodem klienta; effectiveAt ograniczony serwerem i monotoniczny dla kierunku                                                                 |
| Wygasła sesja                              | lokalne odpowiedzi pozostają, wysyłka czeka na to samo konto                                                                                                       |
| Podwójna wysyłka                           | receipt i hash zapewniają jeden efekt                                                                                                                              |

Proponowana polityka czasu v1: kanoniczny porządek odpowiedzi = kolejność akceptacji serwera (sequence), a effectiveAt = max(lastEffectiveAt, min(occurredAt, receivedAt)). Klient zachowuje raw occurredAt i informację o korekcie. Późne zdarzenia mogą więc mieć zerowy odstęp i muszą przejść przez regułę dodatkowego ćwiczenia. To świadomy kompromis: deterministyczny wynik dla nadanej sekwencji, bez nieograniczonego replay historii. [Decyzja o schedulerze](decisions/learning-scheduler.md) opisuje wpływ kolejności dostarczenia na projekcję.

## 7. Trening i planowanie

Dwa porty: Scheduler interpretuje pojedynczą ocenę i czas; QueuePolicy wybiera następny materiał. Żaden nie dotyka UI, sieci ani DB.

[Decyzja o schedulerze](decisions/learning-scheduler.md) opisuje wersjonowany profil FSRS-6, projekcję czasu i reguły dodatkowych ćwiczeń. Implementację należy sprawdzić na referencyjnych scenariuszach w Node, przeglądarce i docelowym runtime Workers.

Kolejka: zaległe/dzisiejsze → zależnie od interleaving nowe w limicie → dodatkowe ćwiczenie znanych. Unikaj poprzedniego cardId, nie tylko kierunku, o ile istnieje alternatywa. Niepamiętana karta wraca po innych. Gdy zestaw ma jedną kartę, dopuszczaj kolejne ćwiczenie, ale bez traktowania jako odległej powtórki. Osobna akcja „Dodaj więcej nowych” rozszerza dzisiejszy limit świadomie. Koniec planu daje dyskretny komunikat, nie koniec sesji.

Nowe fiszki: raz poznany cardId nie zużywa kolejnego limitu przy innym kierunku. Dzień nauki wyznaczają kolejne północe w `Europe/Warsaw`. Testy obejmują obie zmiany czasu. Offline wiele urządzeń może łącznie przekroczyć limit — synchronizacja scala unikalne wprowadzenia i nie odrzuca ocen; ścisły globalny limit offline nie jest obiecywany.

## 8. Konta, offline i PWA

Auth: e-mail/hasło, weryfikacja adresu, reset z dozwolonym redirect URL, odtworzenie sesji przez adapter zgodny z Next.js. Wygaśnięcie sesji zatrzymuje sync, nie zapis lokalny. Po reautoryzacji sprawdź zgodność userId przed wznowieniem.

Wylogowanie: jeżeli są pending operations, pokaż liczbę i opcje „Synchronizuj i wyloguj”, „Anuluj”, „Odrzuć lokalne zmiany i wyloguj” z potwierdzeniem. Ostatnia opcja jawnie niszczy niewysłane dane. Bez pending: zamknij DB, usuń cache tego konta, wyloguj, wyczyść pamięć UI. Zmiana konta remountuje providery. Jeśli usunięcie bazy jest zablokowane przez inną kartę, nie pokazuj danych innego konta; komunikat wymaga zamknięcia pozostałych kart. Wygasła sesja to inna sytuacja niż świadome wylogowanie.

Przygotowanie offline: jawne „Dostępny offline” dopiero po pobraniu pełnego snapshotu zestawu, postępu i zasobów aplikacji. Częściowy download oznacza preparing, nie ready. Duże zestawy pobierane stronami, aktywowane atomowo przez snapshot generation. Offline zapis działa po przygotowaniu; pierwsze logowanie wymaga sieci.

SW cache: statyczne zasoby wersjonowane i bezpieczny app shell; brak cache prywatnych HTTP odpowiedzi, tokenów i ekranów resetowania hasła. Dane kont tylko IndexedDB. Instalacja PWA wymaga manifestu, ikon i HTTPS. Aktualizację proponuj po lokalnym commit, nie wymuszaj reload podczas odsłoniętej fiszki lub zapisu. Stary schemat/klient otrzymuje kontrolowane upgrade_required bez skasowania outbox.

## 9. CSV

Format, limit parsera i reguły klasyfikacji opisuje [kontrakt CSV v1](CONTRACTS.md#csv-v1). Parser jest oddzielony od UI i zapisu. Po parsowaniu, walidacji i klasyfikacji użytkownik zatwierdza plan, a aplikacja zapisuje go idempotentnie. Podgląd przechowuje numer fizycznego wiersza i identyfikator logicznego rekordu. Przy integracji sprawdź czas parsowania na telefonie i rozważ Web Worker dla dużych plików.

Import zatwierdza wszystkie wybory przed zapisem. Wiersz ma stabilne operationId i docelowe cardId. Przerwanie batcha pozwala wznowić bez kopii. Zmiana zestawu od czasu preview powoduje rewalidację rewizji. Eksport dokładnej treści z cytowaniem CSV; nie otwieraj automatycznie w arkuszu. Opcjonalny bezpieczny eksport arkuszowy z ochroną formuł musi być odrębnym trybem, ponieważ modyfikuje treść.

## 10. Dostępność i UX

Jedna fiszka, brak timera i punktów. Semantyczne nagłówki, label dla kontrolek, widoczny fokus, komunikaty aria-live. Ocena dopiero po reveal; fokus trafia na pierwszą ocenę, po zapisie wraca na reveal. Dotyk >=44px. Kontrast WCAG AA, 200% zoom, 320px szerokości, reduced-motion. Skróty klawiszowe tylko poza input/select i bez event.repeat. Własny zestaw wymaga konta. Błędy zapisu nie znikają razem z fiszką.

## 11. Etapy i kryteria przejścia

[Kolejka wykonawcza](TASKS.md) rozpisuje etapy na zadania i przechowuje ich aktualny stan.

1. Przygotować migracje Supabase, ograniczenia własności i RLS, transakcyjny zapis z potwierdzeniami operacji oraz konfigurację Auth. Zweryfikować zgodność Next.js z runtime Cloudflare Workers, w tym Route Handlers, cookies, callback Auth i docelowy service worker.
2. Zaimplementować Scheduler i QueuePolicy zgodnie z decyzją o FSRS. Ustalić kontrakt kolejki powrotów, stan po resecie i schemat wersjonowanego stanu schedulera.
3. Podłączyć Auth, zapis lokalny oraz push, pull i snapshot. Lokalnie sprawdzić pobranie jednej fiszki, ocenę bez sieci, przeładowanie, synchronizację i odczyt na drugim urządzeniu oraz izolację dwóch kont. Weryfikacja tej ścieżki na Supabase i Workers jest warunkiem odbioru wydania.
4. Rozbudować zarządzanie zestawami i kartami, trening obu kierunków oraz import i eksport CSV. Import wymaga podglądu, jawnych rozstrzygnięć oraz trwałego planu i ID operacji do wznowienia po błędzie. Przed zapisem ponownie zweryfikować cel i rewizję. Klasyfikator zwraca do 20 dopasowań danej kategorii, więc podgląd powinien obsłużyć ucięte wyniki.
5. Dodać PWA, przygotowanie zestawów offline, aktualizację aplikacji z zachowaniem outbox, ustawienia i dostępność.
6. Zweryfikować kryteria odbioru z [briefu](PRODUCT-BRIEF.md), instrukcję kopii i przywracania bazy oraz smoke test w docelowym środowisku.

Do weryfikacji chmurowej potrzebne są projekt Supabase, konfiguracja SMTP i przekierowań oraz konto Cloudflare.

## 12. Weryfikacja i obserwowalność

Testy jednostkowe: scheduler, kolejka, normalizacja CSV, runtime schema. Integracyjne: IndexedDB atomiczność/retry/migracje; Postgres RPC/RLS; utrata odpowiedzi HTTP po commit. E2E na produkcyjnym buildzie: Chrome desktop/mobile, potem WebKit/iOS i Firefox, offline po reload, 2 konta/2 urządzenia, aktualizacja SW z outbox. Tylko headless.

Logi: requestId, operationId, typ błędu i czas; bez haseł, tokenów i treści fiszek. Metryki: pending count, wiek najstarszej operacji, konflikty, odrzucone schematy, błędy lokalnego zapisu. Użytkownik widzi stan, nie techniczny log. Krytyczne awarie blokują release: utrata oceny, zdublowany efekt, wyciek konta, odtworzenie usuniętej fiszki.

## 13. Referencje

### Rachmistrz

Źródła w `D:/CODE/rachmistrz` to `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/training.css` i `src/training/controller.ts`. Wspólne wzorce to Manrope Variable, kremowe tło, zielony akcent, czytelny trening, widoczny fokus i obsługa reduced motion.

### Next Frontend Starter

Wzorce zastosowane w Recallio obejmują App Router, małe komponenty klienckie, odczyt lokalnych danych po hydratacji i testy E2E na buildzie produkcyjnym. [Repozytorium startera](https://github.com/PiotrO9/next-frontend-starter)

### Dokumentacja zewnętrzna

- [Instalacja Next.js](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js na Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [OpenNext](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase changelog](https://supabase.com/changelog.md)
