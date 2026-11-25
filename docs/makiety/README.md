# Makiety Recallio

[Otwórz galerię projektu](index.html). Wybierz widok W01–W18, stan i urządzenie. Adres w pasku przeglądarki zapamiętuje wybór. Pod ramką są wskazówki do wdrożenia. „Otwórz sam widok” pozwala sprawdzić tekst w naturalnej wielkości lub zmienić szerokość okna. Galeria pokazuje telefon 390 × 844 i komputer 1440 × 900. Dłuższe widoki przewijają się w ramce. Eksport PNG obejmuje ich pełną wysokość.

## Trzy przebiegi do przejścia

| Zacznij tutaj                                    | Co zrobić                                                                                                                     | Co powinno być widoczne                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Pierwsza wizyta](index.html#W01/first/mobile)   | Utwórz zestaw, nadaj mu nazwę, zapisz. Wpisz obie strony pierwszej fiszki. Po zapisie zacznij naukę, odsłoń i oceń odpowiedź. | Wpisana nazwa i obie strony towarzyszą użytkownikowi aż do treningu.                            |
| [Powrót do nauki](index.html#W01/due/desktop)    | Wybierz „Powtórz teraz”, odsłoń odpowiedź, naciśnij 3 lub „Dobrze”, a następnie zakończ sesję.                                | Panel otwiera włoski zestaw. Po ocenie pojawia się kolejna fiszka, po zakończeniu podsumowanie. |
| [Konflikt w CSV](index.html#W11/conflict/mobile) | Porównaj „konto” z „rachunek”, pozostaw „Pomiń wiersz”, zastosuj decyzję i zatwierdź plan.                                    | Decyzja jest widoczna przy właściwym wierszu. Wynik importu dotyczy zapisu na urządzeniu.       |

Przy przeglądzie wyjątków porównaj [błąd lokalnego zapisu](index.html#W07/error/mobile) z [udaną oceną offline](index.html#W07/offline/mobile) oraz [przerwany import](index.html#W12/paused/desktop) z [potwierdzeniem zakończenia](index.html#W12/stop/desktop). Stan błędu zachowuje kontekst i daje konkretne wyjście.

## Przekazanie do implementacji

- **Dane panelu.** Przed rekomendacją odczytaj bibliotekę, harmonogram, limit i ustawienia bieżącego konta. Przekaż identyfikator wskazanego zestawu do treningu. Dla konta z wyłączonymi licznikami wystarczy nazwa i działanie.
- **Formularze.** Jedna kolumna na telefonie. Etykiety nad kontrolkami, komunikat przy właściwym polu. Zapis nowego zestawu otwiera edycję pierwszej fiszki. Anulowanie edycji wraca do poprzedniego kontekstu. Stan po błędzie powinien zachować wprowadzone dane.
- **Trening.** Po odsłonięciu pytanie zachowuje położenie. Pierwsza ocena otrzymuje fokus. Zapisz odpowiedź lokalnie przed następną kartą. Przy ponowieniu użyj tego samego identyfikatora. Oba kierunki jednej fiszki współdzielą jednostkę dziennego limitu. Domyślny limit to 20, strefa jest ustalona na Europe/Warsaw.
- **Import.** Na komputerze porównuj wartości obok siebie, na telefonie jedna pod drugą. Przy kilku trafieniach wskaż konkretny rekord. Zachowuj wybory pomiędzy stronami. Po częściowym zapisie kontynuuj od pierwszego niezapisanego kroku.
- **Konto.** Osobny adres dla każdego działania. Neutralne potwierdzenia wysyłki wiadomości. Przed wylogowaniem pokaż niewysłane zmiany i skutek ich odrzucenia.
- **Odbiór.** Sprawdź porządek tabulatora, widoczny fokus, czytnik ekranu, 200% powiększenia i powrót z błędu w działającej aplikacji. Pytanie i odpowiedź mogą rosnąć w pionie. Długi tytuł zestawu zawija się obok etykiety „Otwórz”.

Prototyp działa na przykładowych danych w pamięci ramki. Wysyłka e-maili, trwały zapis, synchronizacja, import i odkładanie powtórek są przedstawione jako stany interfejsu. Można je otworzyć selektorem także bez przechodzenia całego scenariusza. Odświeżenie samodzielnego widoku przywraca dane przykładowe. Źródło zachowania produktu i adresy produkcyjne opisuje [brief](../BRIEF-MAKIET.md).

## Pliki i eksport

Do otwarcia wersji źródłowej z pełną typografią potrzebne są zależności projektu (`npm ci`). Przenośny plik `Recallio.html` ma osadzone skrypty, style, fonty i reprodukcję. Można go otworzyć dwuklikiem bez serwera i bez połączenia z siecią.

Z katalogu projektu uruchom `node docs/makiety/export.mjs <katalog-wynikowy>`. Eksport korzysta z Chromium zainstalowanego dla Playwright. Zapisuje galerię, pliki `mobile/Wxx/stan.png` i `desktop/Wxx/stan.png` oraz `indeks.csv` z nazwami stanów po polsku. Przy eksporcie sprawdza szerokości 320, 390, 768 i 1440 px.

Kolory, typografia i układ znajdują się w `design.css`. Katalog widoków i stanów jest w `catalog.js`. Źródła ilustracji i typografii są wspólne z aplikacją. [Drzeworyt Hokusai w The Met](https://www.metmuseum.org/art/collection/search/55735)
