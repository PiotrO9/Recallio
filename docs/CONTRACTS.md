# Kontrakty v1 — projekt do zamrożenia w CORE-01

Status: specyfikacja, nie zaimplementowane endpointy. Obecne typy `src/domain/cards.ts` dotyczą wyłącznie demonstracji i nie są jeszcze produkcyjnym DTO. CORE-01 tworzy `src/contracts` z walidacją runtime (kandydat: Zod), przykładami i testami zgodności. Nie tworzyć równoległych typów w modułach.

## Wspólny język

- Direction: `a-b | b-a`; DirectionMode: `a-b | b-a | mixed`.
- Rating: `1 | 2 | 3 | 4` = nie pamiętam / trudno / dobrze / łatwo.
- UUID: identyfikatory; IsoInstant: UTC ISO8601; Revision/Cursor: string dziesiętny bigint.
- Card: id, deckId, sideA, sideB, exampleA?, exampleB?, contentRevision, deletedAt?.
- ProgressKey: cardId + direction; epoch oddziela jawne resety postępu.
- ReviewEvent: id, cardId, direction, rating, occurredAt, deviceId, clientSeq, observedContentRevision, observedProgressRevision, epoch, algorithmVersion.
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
    recentCardIds: readonly string[];
    remainingNew: number;
    random: () => number;
  }): Candidate | null;
}
interface LearningRepository {
  // W jednej transakcji: event, projekcja, introduction i outbox.
  commitReview(command: PreparedReview): Promise<CommitReceipt>;
  snapshot(deckId: string): Promise<LearningSnapshot>;
}
```

PreparedReview jest niezmienny na retry. Snapshot trwającej karty nie zmienia się po pull. `null` z kolejki oznacza brak dostępnego materiału (np. pusty zestaw albo same nowe przy limicie 0), nie błąd transportu. UI oferuje zwiększenie limitu, kiedy ma to zastosowanie.

## API

Wszystkie poniższe endpointy prywatne, JSON, no-store. Supabase Auth realizuje operacje tożsamości. Brak zaufania do userId w body.

| Endpoint                             | Wejście                                 | Wynik                                                 |
| ------------------------------------ | --------------------------------------- | ----------------------------------------------------- |
| POST /api/v1/sync/push               | protocolVersion, deviceId, operations[] | results[] per operation, serverTime                   |
| GET /api/v1/sync/pull?cursor=&limit= | cursor domyślnie 0, limit max 500       | changes[], nextCursor, hasMore, serverTime            |
| GET /api/v1/sync/snapshot            | snapshotToken?, pageToken?              | snapshot generation, dane strony, nextPage, watermark |

Operacja: `{id, type, entityId, baseRevision?, payload}`. Typy: deck.create/update/delete, card.create/update/delete, review.record, progress.reset, settings.update. Import składa się z card.create/update z deterministycznymi ID operacji, nie osobnego sposobu mutacji tabel.

Push: max 100 operacji, max 1 MiB; każda operacja atomowa, batch może być częściowo zaakceptowany. Zależne operacje wysyłaj kolejno (deck.create przed card.create). Niezaakceptowane zależności zwracają retryable dependency_pending, bez efektu. Result: `{operationId, status: applied|duplicate|conflict|rejected, entity?, revision?, error?}`. Conflicts zawierają aktualną wersję i kod, nigdy cudze dane.

Błędy HTTP: 401 unauthorized, 413 payload_too_large, 422 invalid_envelope, 426 upgrade_required, 429 rate_limited, 503 retry_later. Błąd pojedynczej poprawnie opakowanej operacji w results: revision_conflict, entity_deleted, invalid_payload, id_reuse, dependency_pending. 409 dla żądania niezgodnego z protokołem; konflikty encji zwykle w results. Ustalić jeden format w CORE-01, nie mieszać semantyki w klientach.

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
        "occurredAt": "2026-11-17T12:00:00Z",
        "clientSeq": "42",
        "observedContentRevision": "1",
        "observedProgressRevision": "2",
        "epoch": "0",
        "algorithmVersion": "TBD-LEARN-01"
      }
    }
  ]
}
```

Idempotencja: hash kanonicznego payloadu + type/entityId; ten sam id i payload zwraca poprzedni wynik, inny payload = id_reuse. Autoryzacja sprawdzana również dla duplikatu. Operacje nie usuwają receipt przy usunięciu karty.

Snapshot musi mieć stały watermark i spójny zbiór (materializowany snapshot lub transakcja/rejestr zmian z rewalidacją). Sam paging bieżących tabel nie wystarcza. LOCAL-01 zapisuje strony do nowej generacji, dopiero komplet przełącza aktywny snapshot. Pending outbox jest zachowany i ponownie nałożony. Serwer nie może wymagać długiej transakcji HTTP trzymanej między requestami.

## CSV v1

Kanoniczne nagłówki eksportu: `side_a,side_b,example_a,example_b`. UTF-8, opcjonalny BOM, przecinek, CRLF, quote `"`, podwojony quote wewnątrz pola; pola wielowierszowe cytowane. Import akceptuje również nagłówki PL z briefu i separator średnik, wykryty wyłącznie w rekordzie nagłówka; podgląd pokazuje wykryty separator. A/B wymagane, przykłady opcjonalne (brakujące kolumny w wejściu dopuszczone); nieznane/powtórzone nagłówki to błąd. Puste wiersze poza cytowanym polem pomijane. Parser ma obsługiwać RFC4180, bez split po przecinku/newline.

Eksport zawsze zawiera cztery kolumny. roundtrip zachowuje surową treść, w tym whitespace; normalizacja służy tylko porównaniu duplikatów. Walidacja pustego A/B używa trim, ale nie mutuje źródła. Klasyfikacja: valid, exact_duplicate, answer_variant, example_conflict, invalid. Akcje: skip, create, update_examples (jawny cel i revision), replace_content (jawny cel; bez resetu), opcjonalnie reset jako oddzielna operacja. Nie ma automatycznego delete.

## Stany UI i lokalne

Training: loading → question → revealed → saving → question; saving → save_error → saving (ten sam command). Zakończenie podczas saving zablokowane; przy błędzie pozwól retry i nie porzucaj command bez decyzji użytkownika.

Sync: idle, syncing, offline, requires_auth, conflict, failed. Outbox: pending, leased, blocked, acknowledged (ostatni można usunąć w tej samej transakcji co apply). Demo nie ma outbox.

Offline readiness per zestaw: absent, preparing, ready, stale, error. Ready nie wynika wyłącznie z navigator.onLine ani z obecności nazwy zestawu.
