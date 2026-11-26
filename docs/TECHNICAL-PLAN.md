# Plan techniczny Recallio

Plan opisuje architekturę MVP. Bieżący stan funkcji i odbioru środowiska docelowego jest w [kolejce](TASKS.md), a wyniki testów w [weryfikacji](VERIFICATION.md).

## 1. Zakres pierwszego przyrostu

Wejście do aplikacji prowadzi do logowania albo do prywatnej biblioteki zestawów. Trening korzysta z FSRS-6 i historii ocen przechowywanej lokalnie w IndexedDB.

MVP obejmuje pełny zakres z briefu: konta, prywatne zestawy, CSV, dwa kierunki, planowanie, offline/PWA i synchronizację. Brak publicznego katalogu, multimediów, AI, płatności i aplikacji natywnych.

## 2. Decyzje techniczne

| ID  | Decyzja                                                              | Status / warunek                                                     |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| D01 | Next.js App Router + React + TS strict + CSS, npm                    | Przyjęta; wersje w lockfile                                          |
| D03 | idb jako cienka warstwa IndexedDB                                    | Używana przez repozytorium konta                                     |
| D04 | Zapisy przez Route Handlers i transakcje PostgreSQL                  | Auth używa SDK Supabase, synchronizacja ograniczonej roli bazy       |
| D05 | Historia zdarzeń i materializowany postęp per kierunek               | Wdrożone w treningu i synchronizacji                                 |
| D06 | FSRS-6 z wersjonowanym profilem                                      | Wdrożony wg [decyzji o schedulerze](decisions/learning-scheduler.md) |
| D07 | PWA przez jawnie wersjonowany service worker                         | Własny service worker w `public/study-sw.js`                         |
| D08 | Workers przez OpenNext                                               | Weryfikacja lokalna w Wranglerze, odbiór wdrożenia w kolejce         |
| D09 | Przykład po odsłonięciu, po stronie odpowiedzi                       | Dostępny w treningu                                                  |
| D10 | Limit nowych = unikalne cardId w lokalnym dniu, oba kierunki wspólne | Domyślnie 20 dziennie, zmieniane w ustawieniach                      |
| D11 | Licznik sesji = zaakceptowane odpowiedzi, domyślnie ukryty w MVP     | Dostępny w ustawieniach treningu                                     |
| D12 | Wylogowanie usuwa cache konta po sync lub świadomym odrzuceniu       | Robocza; szczegóły poniżej                                           |

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

### Cel i punkt wyjścia

Celem prac jest WCAG 2.2 na poziomie AA dla całych procesów Recallio, od wejścia na konto po zapis oceny i odzyskanie pracy offline. Obejmuje to wszystkie mające zastosowanie kryteria A i AA. Trening zachowuje jedną fiszkę na ekranie, samoocenę, własne tempo i możliwość ponowienia zapisu. Dla głównych akcji przyjmujemy projektowy cel dotykowy 44 × 44 piksele CSS. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Wymagania dotyczące zgodności](https://www.w3.org/TR/WCAG22/#conformance-reqs)

Wersja bazowa do porównania to `b05ad2d`. Aplikacja ma polski język dokumentu, odnośnik „Przejdź do treści”, widoczny fokus, natywne okna potwierdzeń i obsługę ograniczonego ruchu. Playwright sprawdza m.in. fokus po błędzie zapisu oceny i po powrocie z edytora. Pomocnik axe ma siedem wywołań w trzech plikach E2E. Testy nowych funkcji sprawdzają ich działanie, a zachowanie z rzeczywistymi czytnikami wymaga odbioru. [Dotychczasowa weryfikacja](VERIFICATION.md#dostępność)

### Kolejność realizacji

Każdy wiersz to osobne zadanie dla jednej osoby lub jednego agenta. Pierwszy krok daje punkt odniesienia. Dalej pierwszeństwo mają bariery uniemożliwiające wejście na konto, ocenę fiszki lub bezpieczny zapis. Wyniki ręczne można zbierać od pierwszego kroku.

| Kolejność                            | Zakres prac                                                                                                                                                                                                                                                                                                                                                                                       | Kryterium odbioru                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Pomiar bazowy                     | W sekcji dostępności w `VERIFICATION.md` utworzyć macierz: proces, stan, kryterium WCAG, metoda, wynik i dowód. Uzupełnić istniejące scenariusze Playwright o skany po ustabilizowaniu DOM dla formularza z błędem, odsłoniętej odpowiedzi, dialogu, konfliktu importu i listy „Do poprawy”. Zapisywać identyfikator reguły, selektor i stan również dla przypadków wymagających oceny człowieka. | Dla każdego procesu wiadomo, które stany sprawdzono i co pozostaje do sprawdzenia. Każda odtworzona bariera ma kroki, wpływ na użytkownika i test do powtórzenia po poprawce.                                                                                                                                                                                                                                            |
| 2. Nawigacja i formularze            | W `src/app/layout.tsx` jest jeden ogólny tytuł. Nadać trasom i istotnym widokom własne tytuły, np. „Odzyskaj hasło · Recallio” i „Dzisiejsze powtórki · Recallio”. W `ValidatedField` błąd zastępuje całe `aria-describedby`. Zachować powiązania ze stałymi wskazówkami po dodaniu i usunięciu błędu. Sprawdzić logowanie, rejestrację, reset hasła, edytor i ustawienia.                        | Użytkownik rozpoznaje widok po tytule karty. Po błędnym wysłaniu formularza znajduje pierwsze błędne pole, poznaje przyczynę, poprawia wartość i wysyła formularz. Logowanie i reset działają z wklejaniem i menedżerem haseł. Kryteria 2.4.2, 3.3.1–3.3.3, 3.3.8, 4.1.2.                                                                                                                                                |
| 3. Trening i zapis offline           | W `study-session.tsx` po odsłonięciu fokus trafia na grupę ocen, a odpowiedź pojawia się w regionie `aria-live`. Po zapisie fokus wraca na przycisk odsłonięcia albo pole tekstowe. Sprawdzić, czy użytkownik słyszy wzorzec i treść następnego pytania. W razie potrzeby powiązać kontrolkę z treścią pytania lub odpowiedzi i dopasować moment ogłoszenia.                                      | Samą klawiaturą i z czytnikiem można przejść dwie fiszki, także gdy wraca ta sama karta. Cyfry wpisane w odpowiedzi pozostają tekstem. Awaria zapisu daje zrozumiały komunikat i „Ponów zapis”, zachowuje wpis oraz po ponowieniu tworzy jedną ocenę. Powrót sieci nie przerywa odpowiedzi. Kryteria 2.1.1, 2.1.4, 2.4.3, 4.1.3.                                                                                         |
| 4. Biblioteka, import i „Do poprawy” | W bibliotece zakomunikować liczbę trafień lub brak wyników po zakończeniu pisania. W `ContentColumn` import wyróżnia różnice tłem i pogrubieniem. Oznaczyć zmienione pole również tekstem i rozróżnić źródło wklejone od pliku. Na liście „Do poprawy” dodać kontekst fiszki do nazw powtarzających się akcji „Edytuj fiszkę”.                                                                    | Fokus zostaje w wyszukiwarce podczas filtrowania. Po „Pokaż więcej” można dotrzeć do nowych wyników, a po edycji wrócić do właściwego miejsca. W imporcie użytkownik odnajduje nierozstrzygnięty wiersz na kolejnej stronie, rozpoznaje zmienioną stronę lub przykład i zatwierdza właściwą decyzję. Z listy linków czytnika potrafi wybrać konkretną fiszkę. Kryteria 1.3.1, 2.4.3, 2.4.4, 4.1.3.                       |
| 5. Potwierdzenia i czytelność        | Sprawdzić `ConfirmAction` oraz wylogowanie z niewysłanymi zmianami w `AccountPanel`. Zmierzyć kontrast tekstu, kontrolek i fokusu. Sprawdzić linki akcji, długie treści fiszek, otwartą klawiaturę telefonu oraz układ przy powiększeniu. Wspólne poprawki wprowadzać w komponentach i stylach używanych przez dotknięte ekrany.                                                                  | Po otwarciu dialogu użytkownik poznaje konsekwencje i ma fokus na bezpiecznej akcji. Escape wraca do wyzwalacza, a po usunięciu elementu fokus przechodzi na istniejący cel. Przy tekście 200% i osobno szerokości 320 pikseli CSS wszystkie podstawowe akcje pozostają osiągalne. Sprawdzić też odstępy tekstu, wymuszone kolory i ograniczony ruch. Kryteria 1.4.3, 1.4.4, 1.4.10–1.4.12, 2.4.7, 2.4.11, 2.5.8, 3.3.4. |
| 6. Odbiór i ochrona przed regresją   | Uruchomić testy projektu i pełne E2E. Powtórzyć krytyczne ścieżki z NVDA i Firefox na Windows oraz VoiceOver i Safari na iPhonie. Zapisać wersje, datę, commit, kroki i zaobserwowane zachowanie w `VERIFICATION.md`. Włączyć sprawdzone asercje do zwykłego przebiegu E2E.                                                                                                                       | Każde mające zastosowanie kryterium A i AA ma wynik i dowód dla przyjętego zakresu. Kryteria poza zakresem mają uzasadnienie. Brak urządzenia lub potwierdzona bariera pozostają jawnie otwarte przed oceną zgodności.                                                                                                                                                                                                   |

Przy pomiarze przyjąć co najmniej 4,5:1 dla zwykłego tekstu, 3:1 dla dużego tekstu i 3:1 dla informacji wizualnej potrzebnej do rozpoznania aktywnej kontrolki lub stanu względem sąsiedniego koloru. WCAG 2.2 AA określa minimum celu wskaźnika jako 24 × 24 piksele CSS z wyjątkami, m.in. dla odpowiedniego odstępu między celami. [Kontrast tekstu](https://www.w3.org/TR/WCAG22/#contrast-minimum) · [Kontrast elementów interfejsu](https://www.w3.org/TR/WCAG22/#non-text-contrast) · [Rozmiar celu](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Do ręcznego odbioru przygotować konto bez fiszek, konto z dwiema należnymi powtórkami, zestaw gotowy offline, wklejkę z konfliktem poza pierwszą stroną i konto z niewysłaną zmianą. Dla każdego sprawdzić drogę od wejścia do wyniku, w tym anulowanie i odzyskanie po błędzie. Zapisać, co zostało odczytane i gdzie znalazł się fokus. Wyniki axe są częścią tej oceny. [Metody oceny dostępności W3C WAI](https://www.w3.org/WAI/test-evaluate/)

### Specyfikacja techniczna do wdrożenia

Numery poniżej odpowiadają sześciu zadaniom z tabeli. Każde zadanie obejmuje poprawkę i test regresji w tym samym kroku. Za zachowanie fokusu i komunikaty odpowiada widok React wykonujący daną akcję. Dane do nich pochodzą z istniejącego stanu formularza, sesji lub importu. Zapis oceny, ponowienie i odczyt biblioteki zachowują kolejność określoną w [kontraktach danych](CONTRACTS.md).

#### 1. Jak wykonać pomiar bazowy

- Rozszerzyć `expectAccessible(page)` w `e2e/accessibility.ts` o identyfikację badanego stanu. Przed wywołaniem pomocnika scenariusz czeka na widoczny wynik czynności, np. otwarty dialog z fokusem na „Anuluj”. Sam pomocnik już czeka na fonty. Skanować całą stronę, łącznie z nagłówkiem, dialogiem i obszarem komunikatów. [Testy dostępności w Playwright](https://playwright.dev/docs/accessibility-testing)
- Do wyniku Playwright dołączyć nazwę scenariusza, profil, stan, identyfikator reguły axe, selektor i opis przyczyny. Wpisy `violations` dla sprawdzanych reguł mają powodować błąd testu. Wpisy `incomplete` kierować do ręcznego rozstrzygnięcia i odnotować wynik w [macierzy weryfikacji](VERIFICATION.md#dostępność). Osobno zapisać kryteria wymagające oceny człowieka, np. kolejność wypowiadania odpowiedzi i oceny.
- Wykorzystać istniejące dane testowe i wymuszanie błędów: `e2e/local-accounts.ts` dla dwóch kont, `e2e/hold-store.ts` do utrzymania widocznego stanu zapisu, `e2e/fail-workspace-read.ts` do awarii odczytu i `e2e/repair-fixture.ts` do sugestii. Każdy scenariusz odtwarza się samodzielnie na obu profilach. Skany dla zalogowanego konta wymagają włączonych testów z lokalną bazą.

#### 2. Tytuły, pola i błędy formularzy

- **Routing.** W `src/app/layout.tsx` ustawić domyślny tytuł i szablon `%s · Recallio`. Stronom o stałym celu nadać `metadata.title`. W `src/app/auth/[screen]/page.tsx` współdzielić mapowanie ekranu na tytuł z `generateMetadata`, uwzględniając ekran „Sprawdź pocztę”. W `src/app/study/page.tsx` rozróżnić trening zestawu, dzienną sesję i listę do poprawy zgodnie z regułami odczytu `deck`, `scope` i `repair`. Powłoce `/study/offline` nadać tytuł dostępny przed odczytem IndexedDB. Tytuł opisuje cel widoku i pozostaje stabilny podczas wpisywania oraz kolejnych ocen. [Dostępność nawigacji w Next.js](https://nextjs.org/docs/architecture/accessibility)
- **Nawigacja w tym samym dokumencie.** Biblioteka korzysta z `pushState`, `replaceState` i `popstate`. Zmianę tytułu listy, szczegółu i edytora powiązać z rozstrzygniętym stanem w `DeckManager`. Objąć także otwarcie „Do poprawy” z podsumowania. W E2E sprawdzić `toHaveTitle` i widoczny nagłówek po wejściu z adresu, kliknięciu, Wstecz, Dalej i odświeżeniu. Zachować istniejący cel `#main` dla odnośnika „Przejdź do treści”.
- **Kontrakt pola.** W `src/components/validated-field.tsx` nazwa dostępna ma pochodzić z widocznej etykiety. Oddzielić treść błędu od etykiety, nadać jej stabilne ID z `useId()` i powiązać z polem. Przy błędzie zestaw tokenów `aria-describedby` to dotychczasowe ID oraz ID błędu, każde tylko raz. Po poprawieniu wartości usunąć wyłącznie ID tego błędu i wyczyścić stan `aria-invalid`. Zachować natywne `required`, typ, zakres i mechanizm wskazania pierwszego nieprawidłowego pola. Błąd sieci należy do całego formularza.
- **Próba odbiorcza.** W `e2e/entry.spec.ts` wysłać niepełny formularz, sprawdzić fokus, nazwę i opis błędnego pola, poprawić e-mail i wysłać ponownie. Dla pola ze stałą wskazówką sprawdzić jej obecność w opisie przed błędem, podczas błędu i po korekcie. W `e2e/auth.spec.ts` objąć rejestrację, wygasły link i nowe hasło. Podczas oczekiwania drugie wysłanie formularza daje łącznie jedno żądanie. Ręcznie sprawdzić autouzupełnianie i wklejanie w obu polach hasła używanych przy logowaniu i ustawianiu nowego hasła.

#### 3. Fokus, odczyt i trwały zapis podczas treningu

W `src/features/study/study-session.tsx` wykorzystać istniejące `revealed`, `moveToCard`, `gradeGroup`, `retryButton` i `answerInput`. Dodać stabilne ID do pytania oraz wzorca. Dostępna nazwa przycisku pozostaje zgodna z jego widocznym napisem. Treść fiszki przekazywać jako opis. Poniższe reguły dotyczą również ponownego pokazania tej samej fiszki w tym samym kierunku.

| Przejście                          | Wymagane zachowanie                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nowe pytanie po ocenie             | Po lokalnym zapisie i odczytaniu następnego kandydata ustawić fokus na „Pokaż odpowiedź” lub polu „Twoja odpowiedź”. Powiązać tę kontrolkę z aktualnym pytaniem przez `aria-describedby`. Wzorzec pojawia się w drzewie dostępności dopiero po odsłonięciu.                                                                                        |
| Odsłonięcie                        | Skierować fokus na obecną grupę „Ocena odpowiedzi”. Jej opis ma udostępnić wzorzec i pytanie „Jak dobrze pamiętasz odpowiedź?”. Jeśli odczyt zapewnia zmiana fokusu, usunąć konkurujące ogłoszenie tej samej treści z `aria-live`. Wpis użytkownika i przykład pozostają dostępne do osobnego odczytu. Tab przechodzi na pierwszą z czterech ocen. |
| Pisanie i skróty                   | Obsługiwać cyfry 1–4 w obrębie grupy ocen po odsłonięciu. Pominąć zdarzenia z modyfikatorami, powtórzenia i trwającą kompozycję IME. Sprawdzić wpisanie cyfry w polu oraz wybór oceny klawiaturą i dotykiem.                                                                                                                                       |
| Błąd zapisu oceny                  | Zachować pytanie, wpisany tekst, odsłonięty wzorzec i przygotowane zdarzenie. Ogłosić błąd i przenieść fokus na „Ponów zapis”. Powtórzyć operację z tym samym ID. Pierwsze przesunięcie fokusu na następną kartę następuje po zatwierdzeniu lokalnego zapisu.                                                                                      |
| Błąd odczytu po udanym zapisie     | Udostępnić „Ponów odczyt” z informacją, że ocena została zapisana. Ponowienie pobiera następną kartę. Asercja sprawdza pojedynczą ocenę i pojedynczy wpis operacji o tym ID.                                                                                                                                                                       |
| Synchronizacja w tle i zakończenie | Ukończenie synchronizacji w tle pozostawia fokus na bieżącej czynności. Ogłaszać zmianę mającą skutek dla użytkownika, np. konieczność ponownego logowania. Po zakończeniu sesji fokus trafia na akcję powrotu z opisem podsumowania lub na jego nagłówek. Wejście na listę sugestii jest osobną akcją.                                            |

Dopisać asercje do `e2e/typed-study.spec.ts`, `e2e/study-flow.spec.ts` i `e2e/daily.spec.ts`. Wykorzystać rzeczywiste przerwanie transakcji, `setOffline(true)` i wznowienie połączenia. Sprawdzić `toBeFocused()`, nazwę i opis dostępny, zachowanie wpisanej odpowiedzi oraz identyfikator synchronizowanej oceny. W próbie z czytnikiem zapisać kolejność usłyszanych treści po odsłonięciu i po przejściu do następnego pytania.

Przykład asercji do dodania w istniejącym scenariuszu dla kierunku A → B, po przygotowaniu karty „cześć” / „hi” i włączeniu trybu pisemnego. Sprawdza opis dostępny dla czytnika oraz kolejność fokusu.

```ts
const input = page.getByRole("textbox", { name: "Twoja odpowiedź" });
await expect(input).toHaveAccessibleDescription(/cześć/i);
await input.fill("hello");
await page.getByRole("button", { name: "Pokaż odpowiedź" }).click();

const grades = page.getByRole("group", { name: "Ocena odpowiedzi" });
await expect(grades).toBeFocused();
await expect(grades).toHaveAccessibleDescription(/\bhi\b/i);
await page.keyboard.press("Tab");
await expect(page.getByRole("button", { name: "Nie pamiętam" })).toBeFocused();
```

#### 4. Wyniki wyszukiwania, import i edycja sugestii

- **Biblioteka.** W `DeckManager` filtrować od razu. Osobny, stale zamontowany `role="status"` z `aria-atomic="true"` aktualizować po krótkiej przerwie w pisaniu, początkowo 300 ms. Jest to parametr UX do sprawdzenia z czytnikiem. Anulować oczekujący komunikat po zmianie frazy, zakresu, konta i przy odmontowaniu. Ogłaszać np. „Znaleziono 63 fiszki. Wyświetlono 50”. Po „Pokaż więcej” skierować fokus na pierwszy nowo udostępniony wynik. Po edycji odtworzyć zakres, liczbę wyników, pozycję i fokus za pomocą istniejącego `libraryPosition`. Po utracie dopasowania fokus wraca do pola. Rozszerzyć `e2e/card-search.spec.ts` o szybką zmianę zapytania i przejście do wyniku numer 51.
- **Import.** W `ContentColumn` obok nazwy pola, którego wartość się różni, wyświetlić krótką informację „Zmieniona wartość”. Podpis źródła powinien odzwierciedlać wybór pliku lub wklejenia. Wykorzystać obecny mechanizm `focusRow`, który otwiera `details[data-row]` i ustawia fokus na właściwym `select`. Powiązać problem i podpowiedź z tym polem. W `e2e/paste.spec.ts` przygotować 21 wierszy danych i wymusić decyzję w ostatnim. Sprawdzić zmianę strony podglądu, otwarcie szczegółów, dostępny numer **fizycznego wiersza źródła** także z nagłówkiem, wybór celu i odblokowanie zapisu. Sprawdzić również wznowienie importu po częściowym zapisie.
- **Do poprawy.** W `repair-list.tsx` przy otwarciu znika aktywny przycisk. Po tej czynności ustawić fokus na nagłówku listy z `tabIndex={-1}`. Linki nazywać np. „Edytuj fiszkę: domani, zestaw Rozmówki”, zachowując widoczny napis w nazwie dostępnej. W `e2e/repair-list.spec.ts` przygotować dwie sugestie, wybrać drugą po nazwie i sprawdzić powrót do jej pozycji. Jeśli cel wygasł lub zniknął, wskazać nagłówek listy i zakomunikować przyczynę. Offline sprawdzić odczyt daty ostatniej aktualizacji oraz przejście do edycji po odzyskaniu sieci.

#### 5. Dialogi, powiększenie i odbiór wizualny

- **Potwierdzenia.** W `src/components/confirm-action.tsx` zachować natywny `<dialog>`, `showModal()` i domyślny fokus na anulowaniu. Krótki opis skutku powiązać przez `aria-describedby`. W otwartym dialogu Tab i Shift+Tab pozostają wewnątrz, Escape anuluje, a wyzwalacz odzyskuje fokus. Jeśli zatwierdzenie usuwa wyzwalacz, widok wybiera po zakończeniu akcji kolejny wiersz albo nagłówek pustej listy. `AccountPanel` ma potwierdzenie w obrębie strony. Przy anulowaniu wrócić na akcję odrzucania, przy błędzie zachować możliwość synchronizacji. W E2E sprawdzić, że anulowanie chroni niewysłaną zmianę. [Wzorzec dialogu modalnego W3C](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- **CSS i pomiary.** Zacząć od `src/app/globals.css` i stylów modułowych treningu oraz importu. Dla tekstu, obramowań potrzebnych do rozpoznania pól i wskaźnika fokusu zapisać rzeczywisty kolor pierwszoplanowy, tło, stan i obliczoną proporcję. Uwzględnić przezroczystość. Zmierzyć obszar aktywacji najczęstszych akcji treningu i linków w wynikach przy pomocy `getBoundingClientRect()`. Dla małych celów jawnie sprawdzić odstęp lub właściwy wyjątek z 2.5.8. Sprawdzić, czy fokus po przewinięciu pozostaje widoczny przy krawędzi karty i w dialogu.
- **Próby układu.** Osobno sprawdzić powiększenie tekstu do 200%, reflow przy szerokości 320 pikseli CSS i powiększenie przeglądarki do 400% przy początkowej szerokości treści 1280 pikseli CSS. Użyć długiej nazwy zestawu, wielowierszowej odpowiedzi i porównania w imporcie. W osobnej próbie narzucić jednocześnie interlinię 1,5, odstęp po akapicie 2 em, odstęp liter 0,12 em i słów 0,16 em. Oprócz szerokości dokumentu sprawdzić odczyt całej treści, osiągalność przycisków i widoczność rzeczywiście aktywnego elementu. [Odstępy tekstu według W3C](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- **Preferencje systemowe.** Przez `page.emulateMedia` objąć `forcedColors: "active"` i `reducedMotion: "reduce"`. Sprawdzić fokus, widoczność wyboru i błędu oraz tekst stanu ładowania po wyłączeniu animacji. Na telefonie otworzyć klawiaturę ekranową i odsłonić wzorzec bez utraty wpisu.

Punkty odniesienia policzone z kolorów źródłowych przy pełnym kryciu: biały tekst na tle przycisku `--brand` (`#584080`) ma kontrast 8,54:1, a obramowanie `--control-line` (`#90829b`) względem białego wnętrza pola ma 3,59:1. Podczas odbioru sprawdzić też kolor na zewnątrz pola i stany po nałożeniu stylów modułu. [Definicja współczynnika kontrastu](https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)

#### 6. Dowody i warunek zakończenia

W [sekcji dostępności weryfikacji](VERIFICATION.md#dostępność) zapisywać dla każdej próby commit, trasę i stan, kryterium WCAG, dane początkowe, czynność, oczekiwany i zaobserwowany wynik, wersje przeglądarki i technologii asystującej oraz dowód. Stosować wyniki „spełnia”, „naruszenie”, „do sprawdzenia” i „nie dotyczy” z uzasadnieniem. Przykładowy przypadek do uzupełnienia podczas realizacji:

> Trening zestawu, tryb pisemny, 4.1.3 i 2.4.3. Wpisać odpowiedź, odsłonić wzorzec, wybrać „Dobrze” i wymusić błąd lokalnego zapisu. Oczekiwane: użytkownik poznaje błąd, fokus jest na „Ponów zapis”, treść wpisu jest dostępna. Po ponowieniu słyszy następne pytanie. Dowody: asercje Playwright dla fokusu i trwałego zapisu oraz notatka z kolejności odczytu NVDA lub VoiceOver.

Każdą zmianę UI sprawdzić przez `npm run typecheck`, `npm test`, `npm run build` i `npm run test:e2e` zgodnie z [konfiguracją lokalną](VERIFICATION.md#testy-lokalne). Przy zmianie zapisu dołączyć `npm run test:storage:browser`. Sprawdzić w raporcie, czy scenariusze konta i synchronizacji rzeczywiście się wykonały. Profil mobilny Playwright uruchamia Chromium z emulacją iPhone’a. Dowód dla Safari i VoiceOver wymaga odrębnego przebiegu na urządzeniu. Odbiór WCAG obejmuje także ręczne wyniki dla pełnych procesów oraz przegląd wszystkich mających zastosowanie kryteriów A i AA. [Ocena dostępności W3C WAI](https://www.w3.org/WAI/test-evaluate/)

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

## 14. Plan rozwoju po MVP

Pierwszy przyrost ma skrócić drogę od własnych materiałów do pierwszej sesji oraz od ponownego otwarcia aplikacji do dzisiejszych powtórek. Obejmuje „Wklej fiszki” i „Powtórz na dziś”. Kolejne przyrosty to wyszukiwanie po treści, pomoc w poprawianiu trudnych fiszek oraz wpisywanie odpowiedzi. Identyfikatory poniżej odpowiadają zadaniom w [kolejce](TASKS.md). Każdy wiersz kolejki jest osobnym, testowalnym commitem.

### Przyrost 1. Od arkusza do codziennej powtórki

#### 1. Wklej fiszki

**PASTE-01 — odczyt danych z arkusza.** Na wejściu zwykły tekst z kolumnami rozdzielonymi tabulatorem. Pierwsza wersja przyjmuje dwie wymagane kolumny A i B oraz opcjonalne przykłady A i B w tej kolejności. Pierwszy wiersz domyślnie zawiera dane. Opcja „Pierwszy wiersz to nagłówki” pomija go wyłącznie na życzenie użytkownika. Puste wiersze pomijamy, a przy błędzie wskazujemy fizyczny numer wiersza we wklejonym tekście.

- W `src/domain/import/csv.ts` wykorzystać istniejący odczyt cytowanych rekordów z parametrem separatora i wspólną walidację treści. Dodać wejście dla tekstu z arkusza zwracające ten sam kształt wierszy co parser plików. Zachować kontrakt CSV, surową treść pól i limit 1 MiB liczony w UTF-8.
- Odbiór w testach domeny obejmuje polskie znaki, CRLF, przecinek w treści, cytowaną komórkę z tabulatorem lub nową linią, pustą stronę, nadmiarową kolumnę, przekroczenie limitu i oba ustawienia nagłówka. Ten sam materiał z pliku i arkusza ma dać takie same decyzje o duplikatach.

**PASTE-02 — podgląd, zapis i przejście do nauki.** W bibliotece i w otwartym zestawie udostępnić akcję „Wklej fiszki”. Otwiera istniejący widok importu z polem tekstowym i prawidłowo wybranym celem. Zostawić zwykłe wklejanie systemowe, także z menu dotykowego. Użytkownik może wrócić z podglądu, poprawić treść i przeliczyć wynik.

- W `src/features/import/csv-import.tsx` oba źródła korzystają z tej samej klasyfikacji, wyboru docelowej karty, sprawdzenia rewizji i trwałego planu zapisu. Zmiana treści zeruje decyzje dotyczące poprzednich wierszy. Spóźniony odczyt wcześniej wybranego pliku nie może zastąpić tekstu.
- „Dodaj i zacznij naukę” otwiera trening docelowego zestawu dopiero po pełnym zapisie lokalnym. Zwykły zapis pozwala zostać w bibliotece. Przy zapisie częściowym ekran pokazuje postęp i akcję wznowienia. Jeżeli wszystkie wiersze pominięto, użytkownik może wrócić do podglądu.
- W teście odbiorczym wkleić 20 par do nowego zestawu i rozpocząć trening na telefonie oraz komputerze. Osobny scenariusz obejmuje import do istniejącego zestawu z duplikatem, zmianę rewizji po podglądzie i przerwanie zapisu. Po wznowieniu każda zaakceptowana fiszka występuje dokładnie raz.

##### Kontrakt parsera i granica zapisu

Proponowany interfejs w `src/domain/import/csv.ts` korzysta z obecnego typu `Content`. `classifyRows` dostaje tablicę wierszy z obu źródeł. Typ separatora pliku pozostaje częścią publicznej sygnatury `parseCsv`.

```ts
type ParsedRow = { row: number; content: Content; errors: string[] };

declare function parseCsv(text: string): {
  delimiter: "," | ";";
  rows: ParsedRow[];
};
declare function parsePastedRows(
  text: string,
  options: { hasHeader: boolean },
): { delimiter: "\t"; rows: ParsedRow[] };
```

1. Wspólna funkcja mapuje `RecordRow` i listę kolumn na `ParsedRow`. Dla pliku listę wyznacza istniejące `headers()`, a dla wklejki kolejność to `sideA, sideB, exampleA, exampleB`. Użyć `records(text, "\t")` dla całego tekstu i dopiero potem pominąć puste rekordy oraz opcjonalny pierwszy niepusty rekord. Dzięki temu wielowierszowy nagłówek zachowuje numerację kolejnych linii. Sprawdzić obie długości z `src/domain/content-limits.ts` oraz limit bajtów przed tokenizacją. Błąd cytowania kończy odczyt. Błędy liczby kolumn i treści są przypisane do pojedynczego wiersza.
2. `src/app/import/page.tsx` przekazuje do `CsvImport` źródło określone przez `/import?source=paste` oraz opcjonalne `deck=<uuid>`. Obecne wejście `/import` otwiera plik. Zmiana tekstu, nagłówka lub źródła unieważnia numer odczytu w `fileVersion`, wynik parsowania, decyzje i numer strony podglądu. Zmiana docelowego zestawu zachowuje sparsowane wiersze, ale przelicza dopasowania. Brak lub usunięcie wcześniej wybranego celu wymaga jawnego wyboru przed zapisem.
3. Obie ścieżki wywołują kolejno `classifyRows → reviewImport → startImport → commitContent → finishImport`. Każdy krok używa zapisanego `ImportStep` z oczekiwaną wersją, ID operacji i encji. `startImport` sprawdza stan zestawu i zajmuje jeden aktywny plan konta. `commitContent` atomowo przesuwa `next` wraz z zapisem treści i outbox. Druga karta przeglądarki może odczytać istniejący plan. Po odświeżeniu `readImport()` przywraca go również wtedy, gdy powstał ze starszego pliku CSV.
4. Rozpoznać akcję końcową po przycisku wysyłającym formularz. Dla „Dodaj i zacznij naukę” nawigować do `/study?deck=<receipt.deckId>` raz, po `finishImport` z `next === total`. Po wznowieniu w nowej karcie pokazać jawny link do nauki na ekranie wyniku. Wspólnym identyfikatorem zapisu jest `StoredImport.id`. Nazwa źródła i tekst schowka nie są potrzebne w kolejce synchronizacji.
5. Traktować zwrócony `ImportReceipt` jako potwierdzenie zapisu także wtedy, gdy kolejny `readWorkspace()` się nie powiedzie. Przy tej awarii zachować podsumowanie i ponowić odczyt biblioteki. Zapobiega to ponownemu utworzeniu planu i nowych ID po ukończonym imporcie.

Przykład testowy parsera to `A\tB\r\n"kot\npies"\tcat\r\n\tbrak`. Przy `hasHeader: true` powstają rekordy z fizycznych linii 2 i 4. Pierwszy zachowuje znak nowej linii w pytaniu, drugi zwraca błąd pustej strony A. W teście wznowienia po pierwszym zapisanym wierszu porównać ID operacji przed i po ponowieniu oraz liczbę fiszek po synchronizacji.

#### 2. Powtórz na dziś

**TODAY-01 — dobór z wielu zestawów.** Obecnie `selectDeck` w `study-session.tsx` wybiera jeden zestaw, a `studyQueue.next` przyjmuje jeden tryb kierunku. W domenie nauki dodać jawny zakres sesji dziennej. Panel i trening mają korzystać z tej samej funkcji wyznaczającej kierunki gotowe do powtórki.

- Do sesji kwalifikuje się istniejący postęp z terminem do chwili startu włącznie. Uwzględnić zaległości, aktualny kierunek każdego zestawu oraz oba kierunki trybu mieszanego. Pominąć usunięte fiszki, usunięte zestawy i kierunki po resecie oczekujące na wprowadzenie. Fiszki z terminem wieczorem stają się dostępne po nadejściu terminu. Granice dnia i komunikaty o jutrze wyznacza `Europe/Warsaw`.
- Zacząć od najstarszego terminu, przy remisie zastosować stabilną kolejność. Nie pokazywać od razu odwrotnej strony tej samej karty, jeśli dostępna jest inna. Po „Nie pamiętam” stosować istniejące powroty sesyjne. Zweryfikować, że powrót nadal dotyczy aktualnej epoki. Przejście dalej następuje po lokalnym zapisie oceny.
- Sesja obejmuje początkową pulę i powroty wynikające z udzielonych ocen. Nowe fiszki wymagają osobnej akcji, więc ta sesja nie zużywa dziennego limitu nowych. Pula pomija pozycje już rozliczone lub usunięte na innym urządzeniu, a odsłonięta fiszka zachowuje treść do końca odpowiedzi. Po przeładowaniu wyznaczyć nową pulę z zapisanego postępu.
- Ustawić zegar testowy i przygotować trzy zestawy z różnymi kierunkami. Sprawdzić zaległość, termin dokładnie teraz, termin przyszły, reset, błąd i powrót. Przy braku należnych kierunków funkcja kończy sesję także wtedy, gdy biblioteka ma nowe fiszki.

**TODAY-02 — panel, sesja i tryb offline.** Przycisk „Powtórz na dziś” prowadzi do proponowanego adresu `/study?scope=today`. Trening pojedynczego zestawu nadal ma adres `/study?deck=…`. Na fiszce widać nazwę bieżącego zestawu. Jeśli użytkownik włączył licznik, pokazujemy liczbę pozostałych kierunków w całej sesji. Po ostatniej powtórce można zakończyć lub świadomie przejść do dalszego ćwiczenia.

- Obsłużyć zakres zarówno w `src/app/study/page.tsx`, jak i w wejściu offline używanym przez service worker. Bez sieci liczyć wyłącznie zestawy przygotowane na tym urządzeniu. Przy pustej puli odróżnić „Wszystkie dostępne powtórki zrobione” od „Przygotuj zestaw do nauki offline”.
- W E2E sprawdzić dwa zestawy w jednej sesji, wejście do pojedynczego zestawu, odświeżenie po ocenie offline i pojedynczą synchronizację po odzyskaniu sieci. Błąd lokalnego zapisu pozostawia bieżącą fiszkę i daje możliwość ponowienia.

**STUDY-CHECK — odbiór przyrostu.** Na desktopie i mobilnym Chromium przejść ścieżkę „wklej → sprawdź → ucz się”. W drugim scenariuszu przygotować konto z powtórkami należnymi z dwóch zestawów i przejść „otwórz panel → powtórz oba zestawy → zakończ”. Użyć kontrolowanego czasu lub przygotowanych danych. Sprawdzić również szerokość 320 px, fokus po błędzie i pełną obsługę klawiaturą. Przed szerszym wydaniem warto dać te dwa zadania osobie, która pierwszy raz widzi aplikację, i zapisać, gdzie potrzebowała podpowiedzi.

##### Tożsamość sesji i aktualizacja kolejki

Proponowane typy należą do domeny nauki. Zależności wejściowe są zwykłymi kolekcjami kontraktów. Widok przekazuje im wynik `readWorkspace()`, a w trybie offline także identyfikatory z `readOfflineDecks()`.

```ts
type StudyScope = { kind: "deck"; deckId?: string } | { kind: "today" };

type DueEntry = SessionReturn & {
  dueAt: string;
  progressRevision: string;
};
type DailyPool = {
  startedAt: string;
  pending: readonly DueEntry[];
  returns: readonly SessionReturn[];
};
declare function collectDue(
  data: {
    decks: readonly Deck[];
    cards: readonly Card[];
    progress: readonly Progress[];
  },
  startedAt: string,
  allowedDeckIds?: ReadonlySet<string>,
): DueEntry[];
```

- W `src/domain/learning/queue.ts` lub sąsiednim module zbudować mapy aktywnych zestawów i fiszek po ID. Przejść po postępach, stosując kierunek zestawu oraz `fsrsScheduler.classify(progress, startedAt) === "due"`. Brak `allowedDeckIds` dopuszcza wszystkie aktywne zestawy. Pusty zbiór oznacza brak przygotowanych zestawów. Posortować wynik według znacznika czasu `dueAt`, następnie `cardId` i `direction`. Praca obejmuje jeden przebieg po zestawach, fiszkach i postępach oraz sortowanie wyłącznie należnych kierunków.
- Zapamiętać `startedAt` raz dla sesji. Na nowym urządzeniu pierwszy pusty odczyt IndexedDB może poprzedzać pobranie danych. Zbudować początkową pulę po potwierdzonym odczycie danych konta, w razie potrzeby po pierwszej synchronizacji. Podczas błędu pierwszego pobrania pokazać ponowienie. Panel może obliczać aktualną liczbę niezależnie, przekazując bieżący czas do tej samej funkcji.
- Przed pokazaniem kolejnego pytania sprawdzić jego `cardId + direction + epoch` względem aktualnego stanu. Przy zmianie rewizji ponownie ocenić kwalifikację dla czasu startu i pominąć rozliczony termin. Ewentualny kolejny termin tego kierunku stanowi osobną powtórkę. Zmiana samej treści odświeża przyszłego kandydata. Z aktywnym pytaniem pracuje dotychczasowe `active.current`. Wyboru dokonać z prawidłowych powrotów i początkowej puli, stosując pierwszeństwo powrotu po innej fiszce. Licznik jest liczbą unikalnych jeszcze oczekujących trójek, więc przy jednej pozostałej fiszce ponowny błąd nadal oznacza jedną do przećwiczenia.
- W `rate()` po uzyskaniu potwierdzenia `commitReview` usunąć zaliczony wpis z `pending` oraz wykonać istniejące `recordSessionAnswer` dla powrotów. Przy konflikcie lokalnej wersji `reprojectReview` przelicza projekcję tego samego zdarzenia. Błąd odczytu kolejnej karty po już zatwierdzonym zapisie ponawia wyłącznie odczyt. Pusta pula wraz z pustą listą powrotów przechodzi do podsumowania. Dalsze ćwiczenie otwiera zwykłą ścieżkę zestawu.
- `src/app/study/page.tsx` i powłoka offline interpretują parametry tak samo. Jawny poprawny `deck` ma pierwszeństwo w niejednoznacznym adresie, a `scope=today` bez zestawu uruchamia sesję dzienną. Wejście `/study` zachowuje dotychczasowy wybór zestawu. Dodać zakres do klucza `StudyBoard`, by zmiana trybu rozpoczęła nową sesję. Service worker już przechwytuje nawigacje do ścieżki `/study`; zakres odczytać z adresu w przeglądarce po załadowaniu wspólnej powłoki.
- `src/app/dashboard.tsx` korzysta z `collectDue` w rekomendacji dla należnych powtórek. W `study-session.tsx` istniejący `countDueToday` liczy także terminy późniejsze tego samego dnia. Licznik dziennej sesji należy wyprowadzić z jej puli. Zachować zachowanie obu dotychczasowych preferencji wyświetlania liczników.

**Próba odbiorcza STUDY-CHECK.** W lokalnym środowisku użyć dwóch niezależnych kontekstów Playwright tego samego konta oraz osobnego konta do kontroli izolacji. Przygotować terminy przed startem, dokładnie na granicy i po starcie przez dane testowe z ustalonym zegarem. Przy wyłączonej sieci ocenić fiszkę i odświeżyć stronę. Po synchronizacji sprawdzić ID zdarzenia, postęp właściwego kierunku i brak dodatkowej operacji na drugim urządzeniu. Nie uzależniać asercji od aktualnej godziny uruchomienia testu.

### Przyrost 2. Odnalezienie i poprawienie fiszki

#### 3. Szukanie po obu stronach fiszki

**SEARCH-01.** W bibliotece dodać zakres wyszukiwania „Fiszki” obok obecnego wyszukiwania zestawów. Jedno pole przeszukuje strony A i B we wszystkich aktywnych zestawach zalogowanej osoby. Wynik zawiera obie strony i nazwę zestawu. Pełne dopasowanie ma pierwszeństwo przed początkiem tekstu i dopasowaniem wewnątrz. Do porównania ujednolicić wielkość liter, zapis Unicode i odstępy. Wynik pokazuje oryginalną treść.

- Na początek filtrować lokalne dane z `readWorkspace()`. Zapytanie pozostaje na urządzeniu. Ograniczyć liczbę jednocześnie renderowanych wyników i zapewnić „Pokaż więcej”. Pusty tekst pokazuje zwykłą bibliotekę. Dla braku trafień pokazać wpisaną frazę i możliwość jej wyczyszczenia.
- Otwierać istniejący edytor po ID zestawu i fiszki. Powrót przywraca frazę, zakres i fokus na wynik. Jeśli fiszka zniknęła w trakcie synchronizacji, wrócić do wyników z komunikatem. Ten sam sposób otwierania edytora posłuży liście „Do poprawy”.
- W testach sprawdzić trafienie po tłumaczeniu w innym zestawie, identyczną treść w dwóch zestawach, usunięty rekord, powrót po edycji i izolację po zmianie konta. Zmierzyć opóźnienie między wpisaniem znaku a wyświetleniem wyników i liczbę renderowanych pozycji na próbce 10 tys. fiszek przed decyzją o dodatkowym indeksie.

##### Wyszukiwanie i nawigacja do istniejącej fiszki

- Wydzielić czysty selektor wyszukiwania. Na zmianę danych biblioteki przygotować rekordy `{ cardId, deckId, sideAKey, sideBKey }` tylko dla aktywnych kart i ich aktywnych zestawów. Wyodrębnić istniejącą normalizację NFC, białych znaków i wielkości liter z `normalizeCsvText` do wspólnej funkcji, zachowując jej dotychczasowe wyniki dla importu. Wyświetlane strony odczytywać z oryginalnej karty. Tekst zapytania jest normalizowany raz na zmianę.
- Dla każdej strony sprawdzić kolejno pełną zgodność, początek i fragment. Jedna fiszka trafia do najwyższej pasującej kategorii nawet przy trafieniu po obu stronach. Przygotować stabilną kolejność bazową według nazwy zestawu i ID karty. Dzięki temu każde wyszukanie wymaga jednego przejścia po wpisach bez sortowania całej listy po każdym znaku. Proponowana pierwsza porcja to 50 wyników. W teście 10 tys. kart raportować medianę i p95 czasu od wpisania do wyrenderowania po rozgrzaniu, na tej samej konfiguracji i dla tego samego zestawu zapytań.
- Rozszerzyć `LibraryEntry` i `useLibraryNavigation` o ID edytowanej fiszki. Obsłużyć `/decks?deck=<uuid>&card=<uuid>` obok istniejącego `card=new`. Przy bezpośrednim wejściu i po `popstate` rozwiązać ID dopiero po wczytaniu biblioteki. Przed otwarciem formularza sprawdzić zgodność `card.deckId`, oba pola `deletedAt` i aktualne konto. Brak wpisu w trakcie pobierania i potwierdzony brak fiszki to dwa osobne stany.
- Rozszerzyć `history.state.libraryPosition` o zakres, liczbę odsłoniętych wyników i ID elementu do odzyskania fokusu. Starszy wpis bez zakresu oznacza listę zestawów. Na powrocie najpierw odtworzyć wyniki, potem przewinięcie i fokus. Gdy edycja usunęła dopasowanie, ustawić fokus na polu wyszukiwania. Przy przejściu z listy trudnych fiszek zapamiętać ten ekran jako źródło powrotu. Na głębokim linku bez historii przycisk powrotu otwiera zestaw. Fraza pozostaje w stanie historii danego konta i nie trafia do URL.

#### 4. Do poprawy

**REPAIR-01 — wiarygodne dane na dwóch urządzeniach.** Proponowany próg początkowy to ocena „Nie pamiętam” na zaplanowanej powtórce tego samego kierunku w co najmniej trzech różnych dniach nauki spośród ostatnich 30. Wiele prób tego samego dnia liczy się raz. Liczyć tylko zastosowane zdarzenia bieżącej epoki, według kanonicznego trybu i czasu skutecznego. Oba problematyczne kierunki pokazać w jednym wpisie fiszki.

- Obecny snapshot zawiera postęp i wprowadzenia. Pełna historia sprzed jego pobrania nie trafia na nowe urządzenie. Proponowany pierwszy wariant to uwierzytelniony odczyt zbiorczy z historii konta na serwerze. Zwraca ID fiszki, kierunek, liczbę dni i datę ostatniej trudności. Ustalić kontrakt w `CONTRACTS.md` i sprawdzić koszt zapytania na przykładowej historii przed dodaniem indeksu.
- Odświeżyć listę po udanej synchronizacji. Offline pokazać ostatni wynik z czasem aktualizacji, zapisany osobno dla konta i czyszczony przy wylogowaniu. Nowe oceny offline wpłyną na listę po potwierdzeniu synchronizacji. Przy pierwszym użyciu bez zapisanej listy pokazać stan oczekiwania na połączenie.
- Sprawdzić wynik po dwóch i trzech dniach, zmianę daty o północy w Warszawie, oceny z dwóch urządzeń tego samego dnia, ponowione zdarzenie, starą epokę, usuniętą fiszkę i izolację kont. Świeżo zalogowane urządzenie ma otrzymać ten sam wynik co urządzenie z dłuższą historią.

**REPAIR-02 — przejście od sugestii do edycji.** Po zakończeniu sesji pokazać dyskretny odnośnik „Do poprawy”, gdy są sugestie. Lista podaje konkretny powód, np. „Trudność w 3 różnych dniach”, oraz otwiera istniejący edytor. Użytkownik może poprawić pytanie lub dopisać przykład. Po zwykłej edycji zachowujemy postęp i wskazujemy, że wskazanie opiera się na wcześniejszych ocenach. Sugestia wygasa po wyjściu zdarzeń z okna czasu albo po ręcznym resecie danego kierunku.

##### Kontrakt odczytu i agregacja historii

Proponowany `GET /api/v1/study/repair-candidates` zwraca agregat dla zalogowanego konta. Klient przekazuje `X-Recallio-Account` jak w obecnym transporcie. Handler używa `serveSync`, a usługa wykonuje jedno parametryzowane zapytanie przez `withDatabase` i `accountTransaction`. Serwer ustala `asOf` raz, przekazuje je jako `$1::timestamptz` i wykorzystuje tę samą wartość w odpowiedzi. Uwzględnić dzień bieżący i 29 poprzednich dat w Warszawie.

```ts
type RepairDirection = {
  direction: Direction;
  epoch: string;
  failedDays: number;
  lastFailedDay: string;
};
type RepairResponse = {
  asOf: string;
  items: Array<{
    cardId: string;
    deckId: string;
    directions: RepairDirection[];
  }>;
};
```

Dodać schemat Zod dla odpowiedzi w `src/contracts`. Sprawdzić UUID, ISO instant, datę kalendarzową, rewizję jako ciąg dziesiętny i liczbę różnych dni od 3 do 30. Grupować rekordy SQL po `cardId` i zachować dane dla każdego kierunku osobno. Brak sugestii zwraca `200` z `items: []`. Błąd sesji zwraca `401`, błąd czasowej dostępności `503`. Odpowiedzi korzystają z istniejącego nagłówka `Cache-Control: private, no-store`.

```sql
WITH failures AS (
  SELECT e.card_id, c.deck_id, e.direction, e.epoch,
         (e.effective_at AT TIME ZONE 'Europe/Warsaw')::date AS failed_day
  FROM public.review_events AS e
  JOIN public.progress AS p
    ON (p.user_id, p.card_id, p.direction, p.epoch) =
       (e.user_id, e.card_id, e.direction, e.epoch)
  JOIN public.cards AS c ON (c.user_id, c.id) = (e.user_id, e.card_id)
  JOIN public.decks AS d ON (d.user_id, d.id) = (c.user_id, c.deck_id)
  WHERE e.user_id = recallio_private.account_id()
    AND c.deleted_at IS NULL AND d.deleted_at IS NULL
    AND e.disposition = 'applied' AND e.canonical_mode = 'due' AND e.rating = 1
    AND e.effective_at >= (
      ((($1::timestamptz AT TIME ZONE 'Europe/Warsaw')::date - 29)::timestamp)
      AT TIME ZONE 'Europe/Warsaw'
    )
    AND e.effective_at <= $1::timestamptz
)
SELECT card_id, deck_id, direction, epoch::text,
       count(DISTINCT failed_day)::int AS failed_days,
       max(failed_day)::text AS last_failed_day
FROM failures
GROUP BY card_id, deck_id, direction, epoch
HAVING count(DISTINCT failed_day) >= 3
ORDER BY card_id, direction;
```

Przypadek referencyjny dla PostgreSQL 17 przy `asOf = 2026-11-23T12:00:00Z`: początek okna to `2026-10-24T22:00:00Z`. Termin o sekundę wcześniejszy wypada z okna. Oceny z 25 października o `00:30Z` i `01:30Z` przypadają na tę samą lokalną datę mimo cofnięcia zegara. Po dodaniu ocen z 26 października i 23 listopada oczekiwany wynik to `failedDays = 3` oraz `lastFailedDay = "2026-11-23"`. Drugie konto z identycznymi ID fiszki i zestawu oraz oceną tylko z jednego dnia otrzymuje pustą listę.

- Czas w filtrze zakresu porównuje surowe `effective_at` z granicami. Obliczenie lokalnej daty służy do policzenia odrębnych dni. Istniejący indeks to `review_events_card_direction_idx (user_id, card_id, direction, effective_at, id)`. W zadaniu zmierzyć `EXPLAIN (ANALYZE, BUFFERS)` na reprezentatywnej historii konta. Jeśli dominuje skan niekwalifikujących się ocen, porównać indeks częściowy na `(user_id, effective_at)` z predykatem dla trzech warunków oceny. Decyzję o migracji oprzeć na odczytanych blokach i czasie zapytania.
- Pierwsza wersja zwraca pełną listę zagregowanych kierunków. W teście dużego konta zmierzyć także rozmiar odpowiedzi. UI sortuje fiszki według najnowszego dnia trudności, potem ID. Powód przy fiszce ma wskazywać konkretny kierunek i jego liczbę dni. Sumowanie liczników z obu stron mogłoby policzyć ten sam dzień podwójnie.
- Walidowany wynik zapisać pod wersjonowanym kluczem `repairCandidates:v1` w istniejącym magazynie IndexedDB `meta` dla konta. Jeden `put` zastępuje całą odpowiedź. Pusty wynik zastępuje wcześniejszą listę. Błąd HTTP lub niedokończony zapis pozostawia ostatni poprawny wynik. Brak klucza oznacza „jeszcze nie pobrano”. Istniejący `clearForLogout` czyści także `meta`.
- Po zakończeniu sesji i po wejściu do listy pokazać dostępny wynik lokalny, a po udanym `sync.flush()` lub `sync.run()` odświeżyć go. Przy rozpoczęciu odczytu zapisać jego ID pod kluczem `repairCandidates:request` w `meta`. Przed zapisem odpowiedzi odczytać ten klucz w tej samej transakcji zapisu i zaakceptować tylko aktualne ID. Nowe żądanie zastępuje ID, a wylogowanie je usuwa. W efekcie nawet spóźniona odpowiedź w innej karcie nie odtworzy wyczyszczonych danych. Anulować żądanie przy zmianie konta. Po `401` stosować istniejący stan ponownego logowania, a po błędzie transportu podać czas ostatnich danych.
- W `REPAIR-02` listę otwierać wewnątrz podsumowania `StudyBoard`, tak aby działała także z przygotowanej powłoki offline. Łączyć identyfikatory z bieżącym `readWorkspace()` oraz pomijać lokalnie usunięte cele i nieaktualne epoki. W powłoce offline udostępnić listę dla przygotowanych zestawów. Przejście do edycji po odzyskaniu połączenia korzysta z adresu fiszki z `SEARCH-01`. Obecny service worker obsługuje nawigację offline do `/study`.
- Wprowadzić endpoint przed klientem. Jeżeli starszy serwer zwraca `404`, klient pomija sugestię w podsumowaniu i pozostawia dostęp do treningu. `push`, `pull`, `snapshot` i schemat operacji ocen zachowują zgodność ze starszymi urządzeniami. Wdrożenie planu będzie momentem wpisania zatwierdzonego kontraktu do [kontraktów v1](CONTRACTS.md).

### Przyrost 3. Wpisywanie odpowiedzi

**TYPE-01.** Dodać opcję „Wpisuj odpowiedź” przy rozpoczęciu treningu zestawu. Na pierwszy przyrost proponujemy wybór na czas danej sesji. Otwiera to możliwość przetestowania trybu bez migracji preferencji konta. Wpisany tekst należy do aktualnego pytania i pozostaje w pamięci widoku.

- Przed odsłonięciem użytkownik może wpisać odpowiedź lub zostawić pole puste. Następnie widzi swoją odpowiedź i treść wzorcową dla aktualnego kierunku. Ocenę wybiera sam, także przy synonimach, literówkach i parafrazach. Używamy obecnych czterech ocen i tej samej ścieżki zapisu.
- Po błędzie zapisu zachować tekst i odsłonięty wzorzec. Wyczyścić tekst po przejściu do następnej fiszki, zakończeniu sesji lub zmianie konta. Podczas pisania skróty ocen są nieaktywne. Przycisk odsłonięcia musi działać również przy otwartej klawiaturze telefonu.
- Przetestować oba kierunki, pusty wpis, znaki diakrytyczne, samoocenę odmiennego poprawnego sformułowania, ponowienie zapisu i kolejne pytanie z pustym polem. Sprawdzić, że wpisana odpowiedź nie pojawia się w operacji synchronizacji.

##### Stan formularza odpowiedzi

W `src/features/study/study-session.tsx` dodać przełącznik dla sesji zestawu oraz kontrolowane pole `draftAnswer: string`. Zmiana trybu przed rozpoczęciem odpowiadania nie tworzy operacji domenowej. `revealed`, `savingRating`, `saveError` i `prepared.current` nadal sterują odsłanianiem oraz oceną. Odpowiedź wzorcowa pochodzi z zamrożonego `Candidate.card` i aktualnego `direction`.

| Przejście                           | Stan tekstu i działanie                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pokazanie kolejnego pytania         | Wyczyścić pole przy przejściu po zapisie, również wtedy, gdy w jednoelementowym zestawie wraca to samo `cardId` i ten sam kierunek.                                                                            |
| Pisanie i odsłonięcie               | W trybie pisemnym po przejściu do pytania fokus trafia do pola. Wpisywanie cyfr i zatwierdzanie znaków przez IME należy do edytora. Po odsłonięciu zamrozić tekst i przekazać fokus do istniejącej grupy ocen. |
| Błąd zapisu i ponowienie            | Zachować pytanie, wpis i ocenę. Wywołać obecną ścieżkę `rate` z przygotowanym zdarzeniem. Zmiana statusu synchronizacji lub `refresh(false)` nie powinna wyczyścić tekstu.                                     |
| Zapis, zakończenie lub zmiana konta | Po potwierdzeniu lokalnego zapisu wyczyścić tekst wraz z przejściem do kolejnej karty. Wyczyścić go także w `endSession` i przy zmianie konta. Odświeżenie strony rozpoczyna nową sesję z domyślnym trybem.    |

W scenariuszu E2E wpisać unikatowy tekst inny niż obie strony fiszki, wywołać kontrolowany błąd zapisu i ponowić ocenę. Przechwycić rzeczywisty `review.record` wysłany po synchronizacji. Sprawdzić pojedyncze ID zdarzenia i zgodność zestawu kluczy z kontraktem oraz brak wpisanej wartości w żądaniu. Powtórzyć przejście dla obu kierunków, w tym z klawiatury telefonu.

### Mapa testów dla dziewięciu zadań

| Zadanie     | Miejsce w projekcie                                              | Rozstrzygająca asercja                                                                                                                        |
| ----------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PASTE-01    | `tests/import/csv.test.ts`, `tests/import/review.test.ts`        | Wklejka i równoważny CSV zwracają równą treść i decyzje. Numer błędnej linii pochodzi ze źródła.                                              |
| PASTE-02    | `tests/storage/content-repository.test.ts`, E2E importu          | Po awarii i wznowieniu zbiór ID operacji dla wierszy jest identyczny. Nawigacja do nauki następuje po ostatnim zapisie.                       |
| TODAY-01    | `tests/learning-queue.test.ts`                                   | Dla ustalonego czasu, danych i zdarzeń kolejność trójek oraz licznik są powtarzalne. Przyszły termin i nieaktywna epoka wypadają z puli.      |
| TODAY-02    | `tests/prepare-review.test.ts`, E2E treningu                     | Powrót po błędzie działa między zestawami, a odświeżenie offline odtwarza zakres i pomija zestawy nieprzygotowane na urządzeniu.              |
| STUDY-CHECK | Osobne scenariusze w `e2e/` z fixture `local-accounts.ts`        | Desktop i mobile przechodzą oba przepływy. Drugie urządzenie widzi jeden efekt każdej zsynchronizowanej oceny.                                |
| SEARCH-01   | Test selektora w `tests/`, `e2e/library-sync.spec.ts`            | Trafienie po obu stronach daje jeden wynik. Powrót z edytora zachowuje zapytanie, odsłoniętą porcję i właściwy fokus.                         |
| REPAIR-01   | Test odczytu z lokalnego PostgreSQL i scenariusz API dwóch kont  | Trzy dni to sugestia, dwie daty z wieloma ocenami to brak sugestii. Sprawdzić granicę 30 dni wokół zmiany czasu, reset oraz konto bez danych. |
| REPAIR-02   | Test repozytorium IndexedDB i E2E edytora                        | Poprawny pusty raport czyści stary wynik, przerwany odczyt go zachowuje. Wylogowanie przed końcem żądania nie przywraca cache konta.          |
| TYPE-01     | E2E treningu, `tests/prepare-review.test.ts` dla kontraktu oceny | Próba ponowienia zachowuje wpis do momentu zatwierdzenia. W następnej prezentacji tej samej fiszki pole jest puste.                           |

### Kolejność pracy i wydania

Realizować zadania pojedynczo w kolejności podanej w [kolejce](TASKS.md). Najpierw dostarczyć i odebrać przyrost 1. Wyszukiwanie udostępnia edytor dla sugestii, a wpisywanie odpowiedzi można podjąć wcześniej, jeśli prace nad historią będą zablokowane. Po każdej zmianie uruchomić sprawdzenie typów, testy i build, a po zmianie UI lub zapisu także headless E2E. Zmiany repozytorium lokalnego sprawdzić dodatkowo w rzeczywistym IndexedDB.

Odbiór lokalny przyrostu i decyzja o publikacji to osobne kroki. Przed publicznym wydaniem obowiązują istniejące zadania `FLOW-02` i `RELEASE-01` z testem logowania, offline, synchronizacji dwóch urządzeń i odtworzenia kopii na środowisku docelowym. Operacje chmurowe wymagają osobnego zlecenia. [Procedury weryfikacji](VERIFICATION.md)
