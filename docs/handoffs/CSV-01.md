# CSV-01 — przekazanie do przeglądu

- Status: REVIEW po zgłoszeniu w rejestrze; właściciel `codex-csv-20261117`.
- Baza: `542c53c59c4476706986aeeddb9032d983fb28dc`; worktree `D:/CODE/Recallio-csv-01`, branch `codex/csv-01`.
- Zależność CORE-01: DONE, commit `8e018911a50616a261f99a24da1a9ec1d7632c0a`, zintegrowany w bazie. Kontrakt: `docs/CONTRACTS.md` w bazie.
- Zakres: `src/domain/import/csv.ts`, `tests/import/csv.test.ts`, `public/examples/fiszki.csv` i ten raport. Bez zmian kontraktów, konfiguracji, zależności, UI ani zapisu.
- Uwaga po review: rejestr nadal wskazuje pierwotny commit `58ac554fa54f4e233a4e68aa344390e808137330`; poprawki są w kolejnym commicie na HEAD brancha. Mechanizm nie obsługuje ponownego zgłoszenia ze stanu REVIEW. Nie integrować samego pierwotnego commita; integrator musi rozwiązać aktualizację zgłoszenia zgodnie z protokołem koordynacji.

Parser obsługuje BOM, nagłówki kanoniczne i polskie, przecinek lub średnik wybrany na podstawie nagłówka, cytowanie, nowe linie w polach, numery linii, limit 1 MiB UTF-8 i walidację długości pól według kontraktu. Błędy struktury przerywają odczyt; błędy danych są przypisane do wierszy. Eksport zachowuje treść i rozróżnia null (puste niecytowane pole) od pustego tekstu (cytowane puste pole). Klasyfikacja porównuje aktywne karty i wcześniejsze wiersze, nie zmieniając danych wejściowych; priorytet to duplikat, konflikt przykładów, wariant odpowiedzi. Porównanie używa NFC, trim, znormalizowanych białych znaków i małych liter po polsku. `ImportPlan` opisuje jawne akcje i identyfikatory do utrwalenia przed retry, ale nie wykonuje zapisu ani nie nadaje ID.

Po review klasyfikacja używa indeksów i zwraca maksymalnie 20 przykładów dopasowań wybranej kategorii, łączną liczbę i flagę ucięcia. Nie ujawnia w tym wyniku innych kategorii ani dalszych celów: IMPORT-01 musi zapewnić ich wyszukiwanie, jeśli umożliwia wybór celu. Dla zbiorowego pomijania trzeba wywołać `classifyRows` z `skipExactDuplicates: true` i stosować `automaticallySkipped`; do `skippedRows` przekazać wszystkie wiersze, które nie utworzą swojej treści (także aktualizacje i ręcznie pominięte). Po zmianie decyzji przeliczyć wynik i ponownie zweryfikować plan przed zapisem. Sama etykieta `exact_duplicate` nie jest decyzją pominięcia. Jeśli wcześniejsza aktualizacja lub inna operacja zmieni docelowy zbiór, IMPORT-01 musi uwzględnić nowy stan i revision przed commit.

## Weryfikacja

- `npm ci`: powodzenie, 0 podatności według npm.
- `npm run typecheck`: powodzenie.
- `npm test`: 14 testów istniejących, powodzenie. Obecny skrypt nie obejmuje `tests/import/`.
- `npx tsx --test tests/import/*.test.ts`: 7 testów CSV, powodzenie po poprawkach review.
- `npm run build`: powodzenie, lokalny build Next.js.
- Lokalny pomiar po poprawkach: 10 000 różnych wierszy sklasyfikowano w około 44 ms; to pomiar jednorazowy, nie gwarancja czasu na innych urządzeniach.
- E2E nie uruchamiano: zmiana dotyczy czystej domeny, bez UI ani zapisu.

## Integracja i dalsza praca

1. Integrator powinien ocenić własny parser jako alternatywę dla biblioteki oraz limit 1 MiB; nowej zależności nie dodano. Kontrakt nie ustala limitu CSV ani sposobu rozróżnienia null i pustego tekstu.
2. Rozszerzyć wspólny skrypt `npm test` o `tests/import/*.test.ts`; zmiana package.json należy do integratora.
3. Przed użyciem w IMPORT-01 utrwalić plan i identyfikatory operacji, walidować wybory i aktualność revision oraz obsłużyć wznowienie. Reset jest odrębną operacją. W tym zadaniu nie ma UI, commitów importu ani synchronizacji.
4. Polityka normalizacji i priorytet klasyfikacji wymagają przeglądu produktowego; ograniczenie dopasowań wymaga odpowiedniej obsługi w IMPORT-01.
5. Po przeglądzie i testach integrator scala commit zwykłym merge i oznacza DONE; dopiero wtedy zależności rejestru zostają odblokowane. IMPORT-01 wymaga również DECK-01, SYNC-02 i VERTICAL-01.
