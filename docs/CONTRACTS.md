# Kontrakty v1

[`src/contracts/index.ts`](../src/contracts/index.ts) zawiera współdzielone typy oraz walidatory push, pull i snapshotu.

## Wspólny język

- Direction: `a-b | b-a`; DirectionMode: `a-b | b-a | mixed`.
- Rating: `1 | 2 | 3 | 4` = nie pamiętam / trudno / dobrze / łatwo.
- UUID: identyfikatory; IsoInstant: UTC ISO8601; Revision/Cursor: string dziesiętny bigint.
- Card: id, deckId, sideA, sideB, exampleA?, exampleB?, contentRevision, deletedAt?.
- ProgressKey: cardId + direction; epoch oddziela jawne resety postępu.
- ReviewEvent: id, cardId, direction, rating, observedMode, occurredAt, deviceId, clientSeq, observedContentRevision, observedProgressRevision, epoch, algorithmVersion.
- Postęp: key, epoch, dueAt, lastEffectiveAt, schedulerState (wersjonowany), revision. Wartość z serwera jest autorytatywna; lokalna jest projekcją optymistyczną.

## Porty domeny (docelowe)

```ts
interface Scheduler {
  readonly version: string;
  review(input: {
    previous: Progress | null;
    event: ReviewEvent;
    effectiveAt: IsoInstant;
    mode: "introduction" | "due" | "practice";
  }): Progress;
}
interface QueuePolicy {
  next(input: {
    cards: readonly Card[];
    progress: readonly Progress[];
    now: IsoInstant;
    direction: DirectionMode;
    previousCardId: string | null;
    sessionReturns: readonly SessionReturn[];
    introducedCardIds: ReadonlySet<string>;
    remainingNew: number;
    random: () => number;
  }): Candidate | null;
}
interface LearningRepository {
  readProgressVersion(
    cardId: string,
    direction: Direction,
  ): Promise<{ progress: Progress | null; localVersion: string }>;
  // W jednej transakcji: event, projekcja, introduction i outbox.
  commitReview(command: PreparedReview): Promise<CommitReceipt>;
  snapshot(deckId: string): Promise<LearningSnapshot>;
}
```

PreparedReview zawiera lokalną wersję bazowej projekcji, oddzielną od rewizji serwerowej. Odczyt projekcji i wersji jest atomowy; commit porównuje wersję i zapisuje nową projekcję, zdarzenie, wprowadzenie i outbox we wspólnej transakcji. PreparedReview jest niezmienny na retry po błędzie lub utracie odpowiedzi. Po potwierdzonym konflikcie bez zapisu można przygotować nową komendę z nową wersją i projekcją, zachowując identyczne zdarzenie oraz operację. Snapshot trwającej karty nie zmienia się po pull. `null` z kolejki oznacza brak dostępnego materiału (np. pusty zestaw albo same nowe przy limicie 0), nie błąd transportu. UI oferuje zwiększenie limitu, kiedy ma to zastosowanie.

## API

Wszystkie poniższe endpointy są prywatne, zwracają JSON i mają `Cache-Control: private, no-store`. Serwer weryfikuje sesję Supabase Auth i używa wyłącznie identyfikatora z tej sesji. Pierwsze wprowadzenie korzysta ze strefy `Europe/Warsaw` także przed zapisaniem ustawień.

| Endpoint                             | Wejście                                 | Wynik                                                 |
| ------------------------------------ | --------------------------------------- | ----------------------------------------------------- |
| POST /api/v1/sync/push               | protocolVersion, deviceId, operations[] | results[] per operation, serverTime                   |
| GET /api/v1/sync/pull?cursor=&limit= | cursor domyślnie 0, limit max 500       | changes[], nextCursor, hasMore, serverTime            |
| GET /api/v1/sync/snapshot            | snapshotToken?, pageToken?              | snapshot generation, dane strony, nextPage, watermark |

Operacja: `{id, type, entityId, baseRevision?, payload}`. Typy: deck.create/update/delete, card.create/update/delete, review.record, progress.reset, settings.update. Import składa się z card.create/update z deterministycznymi ID operacji, nie osobnego sposobu mutacji tabel.

Push: max 100 operacji, max 1 MiB; każda operacja atomowa, batch może być częściowo zaakceptowany. Zależne operacje wysyłaj kolejno (deck.create przed card.create). Niezaakceptowane zależności zwracają retryable dependency_pending, bez efektu. Result: `{operationId, status: applied|duplicate|conflict|rejected, commitCursor?, entity?, revision?, error?}`. `commitCursor` jest wymagany dla applied/duplicate, niedozwolony dla conflict/rejected. Conflicts zawierają aktualną wersję i kod, nigdy cudze dane.

Błędy HTTP: 401 unauthorized, 413 payload_too_large, 422 invalid_envelope, 426 upgrade_required, 429 rate_limited, 503 retry_later. Błąd pojedynczej poprawnie opakowanej operacji w results: revision_conflict, entity_deleted, invalid_payload, id_reuse, dependency_pending. Konflikty encji zgłaszane są w `results` z kodem `revision_conflict`; HTTP 409 dotyczy konfliktu na poziomie żądania, nie pojedynczej operacji.

```json
{
  "protocolVersion": 1,
  "deviceId": "uuid",
  "operations": [
    {
      "id": "uuid",
      "type": "review.record",
      "entityId": "card-uuid",
      "payload": {
        "direction": "a-b",
        "rating": 3,
        "observedMode": "introduction",
        "occurredAt": "2026-11-17T12:00:00Z",
        "clientSeq": "42",
        "observedContentRevision": "1",
        "observedProgressRevision": "2",
        "epoch": "0",
        "algorithmVersion": "recallio-fsrs6-v1"
      }
    }
  ]
}
```

Idempotencja: hash kanonicznego payloadu + type/entityId; ten sam id i payload zwraca poprzedni wynik, inny payload = id_reuse. Autoryzacja sprawdzana również dla duplikatu. Operacje nie usuwają receipt przy usunięciu karty. Wynik `applied` i `duplicate` zawiera `commitCursor`, czyli dziesiętną pozycję commita operacji; duplikat zwraca tę samą pozycję, a `conflict`/`rejected` nie zawiera kursora. Snapshot może być aktywowany tylko przy watermarku nie mniejszym niż każdy utrwalony kursor potwierdzonej operacji. Nieznany wynik wymaga retry identycznej operacji i odzyskania receipt; do tego czasu snapshot nie jest aktywowany. Serwer zapewnia, że watermark reprezentuje kompletny, spójny prefiks zatwierdzonych operacji per konto, a receipt i pozycja commita zapisują się atomowo. Klient usuwa potwierdzony outbox atomowo ze spójnym zastosowaniem danych. Serwer i klient synchronizacji nie są jeszcze zaimplementowane; te gwarancje wymagają testów integracji bazy i synchronizacji.

Snapshot musi mieć stały watermark i spójny zbiór (materializowany snapshot lub transakcja/rejestr zmian z rewalidacją). Sam paging bieżących tabel nie wystarcza. Lokalne repozytorium zapisuje strony do nowej generacji, dopiero komplet przełącza aktywny snapshot. Pending outbox jest zachowany i ponownie nałożony. Serwer nie może wymagać długiej transakcji HTTP trzymanej między requestami.

Każda strona snapshotu zawiera tablicę `introductions` (także gdy jest pusta). Wprowadzenie ma `cardId`, `firstEffectiveAt` oraz `studyDay` w formacie YYYY-MM-DD; należy do tej samej generacji i watermarku co pozostałe dane. Pełny snapshot obejmuje wprowadzenia całego konta, niezależnie od stron zestawów. Lokalne repozytorium przełącza je atomowo wraz z generacją i uwzględnia pending outbox.

Pole `timezone` w operacji `settings.update` pozostaje częścią kontraktu v1. Serwer stosuje `Europe/Warsaw` również przy odbiorze starszych operacji z inną strefą. Pull i snapshot zwracają ustawienia z tą strefą. Zasady liczenia dnia opisuje [decyzja o danych lokalnych konta i czasie](decisions/002-local-account-and-time.md).

Ocena zawiera wymagane `observedMode` (`introduction`, `due`, `practice`), zamrożone razem ze zdarzeniem i zachowane przy retry. Jest to obserwacja klienta, nie autorytatywna klasyfikacja: stan lub zegar urządzenia mogą być nieaktualne. Regułę kanonicznej klasyfikacji na podstawie stanu serwera i `effectiveAt` opisuje [decyzja o schedulerze](decisions/learning-scheduler.md).

## CSV v1

Kanoniczne nagłówki eksportu: `side_a,side_b,example_a,example_b`. UTF-8, opcjonalny BOM, przecinek, CRLF, quote `"`, podwojony quote wewnątrz pola; pola wielowierszowe cytowane. Import akceptuje również nagłówki PL z briefu i separator średnik, wykryty wyłącznie w rekordzie nagłówka; podgląd pokazuje wykryty separator. A/B wymagane, przykłady opcjonalne (brakujące kolumny w wejściu dopuszczone); nieznane/powtórzone nagłówki to błąd. Puste wiersze poza cytowanym polem pomijane. Parser ma obsługiwać RFC4180, bez split po przecinku/newline.

Eksport zawsze zawiera cztery kolumny. roundtrip zachowuje surową treść, w tym whitespace; normalizacja służy tylko porównaniu duplikatów. Walidacja pustego A/B używa trim, ale nie mutuje źródła. Klasyfikacja: valid, exact_duplicate, answer_variant, example_conflict, invalid. Akcje: skip, create, update_examples (jawny cel i revision), replace_content (jawny cel; bez resetu), opcjonalnie reset jako oddzielna operacja. Nie ma automatycznego delete.

Parser w `src/domain/import/csv.ts` ogranicza wejście do 1 MiB UTF-8. Eksport rozróżnia brak przykładu (puste niecytowane pole) od pustego tekstu (cytowane puste pole). Normalizacja porównawcza używa NFC, ujednolica białe znaki i ignoruje wielkość liter. Pomijanie duplikatów jest jawną decyzją planu importu. Po zmianie decyzji lub docelowego zbioru należy ponownie przeliczyć klasyfikację i zweryfikować plan.

## Stany UI i lokalne

Training: loading → question → revealed → saving → question; saving → save_error → saving (ten sam command). Zakończenie podczas saving zablokowane; przy błędzie pozwól retry i nie porzucaj command bez decyzji użytkownika.

Sync: idle, syncing, offline, requires_auth, conflict, failed. Outbox: pending, leased, blocked, acknowledged (ostatni można usunąć w tej samej transakcji co apply). Demo nie ma outbox.

Offline readiness per zestaw: absent, preparing, ready, stale, error. Ready nie wynika wyłącznie z navigator.onLine ani z obecności nazwy zestawu.

## Szczegóły walidatora push

Payloady są ścisłe: nieznane pola, w tym `userId`, są odrzucane. Utworzenie karty ma `deckId`; aktualizacja wymaga pełnej treści i `baseRevision`. Przykłady są jawnie `null` albo tekstem. Pierwsza ocena ma `observedProgressRevision: null`. Numery bigint są dziesiętnymi stringami w zakresie nieujemnego bigint PostgreSQL. `parsePushBody` sprawdza 1 MiB UTF-8 przed parsowaniem JSON. Serwer niezależnie weryfikuje własność, integralność, daty oraz powiązania — walidacja struktury nie jest autoryzacją.

## Kontrakt odpowiedzi i walidacji paczek

Walidator `pushEnvelopeSchema` weryfikuje wyłącznie kopertę; każdą pozycję waliduj osobno przez `operationSchema`, aby niepoprawna operacja nie uniemożliwiła wykonania pozostałych. Aby odpowiedzieć per operacja, wadliwa pozycja musi zawierać poprawne ID; w przeciwnym razie odpowiedź to HTTP 422 dla koperty przed wykonaniem jakiejkolwiek operacji. `pushSchema` i `parsePushBody` walidują kompletną paczkę i nadają się do weryfikacji danych klienta; serwer musi sprawdzać limit bajtów przed dekodowaniem, a następnie korzystać z walidacji dwuetapowej.

Pull przyjmuje `cursor` (domyślnie 0) i `limit` (1–500, domyślnie 100); odpowiedź ma `changes`, `nextCursor`, `hasMore`, `serverTime`. Zmiana ma sequence, entity, entityId, revision, payload JSON i flagę deleted. Rodzaje i konkretne payloady zmian wymagają testów integracji bazy i synchronizacji; obecne DTO dopuszcza dowolną wartość JSON. Snapshot zwraca snapshotToken, watermark, zestawy, karty, postępy, wprowadzenia, ustawienia i nextPage; token strony wymaga tokenu snapshotu. Serwer gwarantuje spójny watermark i kontroluje wielkość strony.

Wynik błędu HTTP: `{error:{code,message,requestId}}`; kod i HTTP muszą być zgodne z tabelą kodów. Serwer weryfikuje właściciela, powiązania i zawartość każdego JSON niezależnie od typów klienta. Dla `progress.reset` epoch i rewizja dotyczą kierunku wskazanego w payload; model bazy musi mieć klucz cardId+direction+epoch. Zdarzenie oceny ze starszą rewizją postępu nie jest automatycznie odrzucane: serwer wylicza ją ponownie według bieżącego kanonicznego postępu; różny epoch lub usunięta karta nie zmienia projekcji. `schedulerState` to `{version,data}`, gdzie version równa się algorithmVersion; schemat `data` zależy od wersji silnika i należy go doprecyzować przy implementacji adaptera FSRS.

W `progress.reset` pole `epoch` jest proponowaną nową epoką i musi być dokładnie o jeden większe od bieżącej epoki kierunku. `baseRevision` odnosi się do bieżącej rewizji tego kierunku. Reset zachowuje historię, a starsze zdarzenia nie zmieniają nowej projekcji. Konkretny stan po resecie ustala wersjonowany silnik nauki; lokalny adapter wymaga jawnie wstrzykniętej polityki, a nie wymyśla stanu FSRS.

### Odczyt fiszek do poprawy

`GET /api/v1/study/repair-candidates` przyjmuje cookie sesji i nagłówek `X-Recallio-Account`. Odpowiedź `200` zawiera `{ asOf, items: [{ cardId, deckId, directions: [{ direction, epoch, failedDays, lastFailedDay }] }] }`. ID są UUID, epoka jest ciągiem dziesiętnym, `asOf` czasem UTC, a ostatni dzień datą ISO w Warszawie. Liczymy zastosowane oceny 1 z należnej powtórki bieżącej epoki kierunku, w co najmniej trzech różnych dniach spośród ostatnich 30, włącznie z dzisiaj. Usunięte zestawy i karty są pomijane. Brak sugestii daje pustą tablicę, brak sesji lub niezgodność konta daje 401, chwilowa niedostępność daje 503. Odpowiedzi mają `Cache-Control: private, no-store`.
