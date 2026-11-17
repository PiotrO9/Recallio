# CORE-01 — do przeglądu integratora

Status przekazania: REVIEW; nie jest zintegrowane ani DONE. Baza `7b90fca6aa4dec0a1196a0bac680b6d42424fc78`, branch `agent-core-01`, worktree `D:/CODE/Recallio-core-01`.

Wykonano: wspólne typy domeny i porty, Zod 4, walidatory push, pull, snapshot, domeny i błędów HTTP, limit UTF-8 i bigint-string, wersjonowane schedulerState, przykłady dla wszystkich rodzajów operacji. Ścisłe operacje odrzucają nieznane pola, także userId. Proponowane ADR opisują sesje, retencję, reset, czas i konflikty. `pushEnvelopeSchema` oraz `operationSchema` umożliwiają oddzielną walidację operacji dla częściowego przyjęcia batcha; pakiet `pushSchema` jest ścisły dla klienta.

Weryfikacja do odtworzenia: `npm run typecheck`, `npm test`, `npm run build`; wynik w podsumowaniu zadania. Testy obejmują błędne UUID/rating/czas/wersję, limit paczki, bigint, serializację, wszystkie typy operacji, snapshot i częściowy batch. Brak testów Supabase/Workers: nie implementowano endpointów ani bazy. Test formatowania całego worktree wykazuje istniejące różnice formatowania plików po checkout Windows; nie zmieniano plików spoza zakresu, sprawdzono zmienione pliki osobno.

Do decyzji integratora: `docs/TECHNICAL-PLAN.md` nadal mówi o konflikcie edycji HTTP 409 w tabeli; kontrakt tej gałęzi wybiera wynik operacji `conflict`, 409 tylko dla całego żądania. Ta poprawka wykracza poza zakres plików CORE-01. Model `progress_resets` w planie należy rozszerzyć o direction, zgodnie z proponowanym resetem per kierunek. Zwrócić uwagę na definicję i uprawnienia change logu, walidację IANA timezone, szczegółowe typy poszczególnych payloadów zmian oraz statusów wyników w zadaniach DATA/SYNC. Schemat schedulerState.data ma być zawężony po LEARN-01.

Do decyzji produktu przed implementacją ustawień: domyślny limit nowych kart i definicja licznika sesji. Propozycja w planie: licznik zaakceptowanych odpowiedzi, domyślnie ukryty. Dobór liczby nowych nie został przesądzony. Proponowane reguły czasu wymagają oceny LEARN-01. Żadnych zmian w chmurze. `zod` dodany w CORE-01, jedynym właścicielem wspólnych kontraktów i zależności w tej fali.
