# CSV-01 — przekazanie do przeglądu

- Status: REVIEW po zgłoszeniu w rejestrze; właściciel `codex-csv-20261117`.
- Baza: `542c53c59c4476706986aeeddb9032d983fb28dc`; worktree `D:/CODE/Recallio-csv-01`, branch `codex/csv-01`.
- Zależność CORE-01: DONE, commit `8e018911a50616a261f99a24da1a9ec1d7632c0a`, zintegrowany w bazie. Kontrakt: `docs/CONTRACTS.md` w bazie.
- Zakres: `src/domain/import/csv.ts`, `tests/import/csv.test.ts`, `public/examples/fiszki.csv` i ten raport. Bez zmian kontraktów, konfiguracji, zależności, UI ani zapisu.

Parser obsługuje BOM, nagłówki kanoniczne i polskie, przecinek lub średnik wybrany na podstawie nagłówka, cytowanie, nowe linie w polach, numery linii, limit 1 MiB UTF-8 i walidację długości pól według kontraktu. Błędy struktury przerywają odczyt; błędy danych są przypisane do wierszy. Eksport zachowuje treść i rozróżnia null (puste niecytowane pole) od pustego tekstu (cytowane puste pole). Klasyfikacja porównuje aktywne karty i wcześniejsze poprawne wiersze, nie zmieniając danych wejściowych; priorytet to duplikat, konflikt przykładów, wariant odpowiedzi. Porównanie używa NFC, trim, znormalizowanych białych znaków i małych liter po polsku. `ImportPlan` opisuje jawne akcje i identyfikatory do utrwalenia przed retry, ale nie wykonuje zapisu ani nie nadaje ID.

## Weryfikacja

- `npm ci`: powodzenie, 0 podatności według npm.
- `npm run typecheck`: powodzenie.
- `npm test`: 14 testów istniejących, powodzenie. Obecny skrypt nie obejmuje `tests/import/`.
- `npx tsx --test tests/import/*.test.ts`: 4 testy CSV, powodzenie.
- `npm run build`: powodzenie, lokalny build Next.js.
- E2E nie uruchamiano: zmiana dotyczy czystej domeny, bez UI ani zapisu.

## Integracja i dalsza praca

1. Integrator powinien ocenić własny parser jako alternatywę dla biblioteki oraz limit 1 MiB; nowej zależności nie dodano. Kontrakt nie ustala limitu CSV ani sposobu rozróżnienia null i pustego tekstu.
2. Rozszerzyć wspólny skrypt `npm test` o `tests/import/*.test.ts`; zmiana package.json należy do integratora.
3. Przed użyciem w IMPORT-01 utrwalić plan i identyfikatory operacji, walidować wybory i aktualność revision oraz obsłużyć wznowienie. Reset jest odrębną operacją. W tym zadaniu nie ma UI, commitów importu ani synchronizacji.
4. Klasyfikacja zwraca wszystkie pasujące wcześniejsze wpisy; dla dużych zestawów lub wielu powtórzeń wymaga oceny kosztu czasu i pamięci przed produkcyjnym użyciem. Polityka normalizacji i priorytet klasyfikacji wymagają przeglądu produktowego.
5. Po przeglądzie i testach integrator scala commit zwykłym merge i oznacza DONE; dopiero wtedy zależności rejestru zostają odblokowane. IMPORT-01 wymaga również DECK-01, SYNC-02 i VERTICAL-01.
