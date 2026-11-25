# Recallio — kierunek wizualny i brief do makiet

25 listopada 2026 · Podstawa analizy: wersja `f6f525e` · Archiwalny brief do pierwszej serii makiet

W aplikacji widoki W01–W18 korzystają z motywu „Kolorowy notes”. Galeria poniżej zachowuje wcześniejszą oprawę i opis przejść. Aktualny wygląd określają [wspólne style](../src/app/globals.css) i [komponent kartki z zakładką](../src/components/notebook.tsx).

## 1. Decyzja projektowa

[Otwórz galerię makiet W01–W18](makiety/index.html) · [Instrukcja przekazania do implementacji](makiety/README.md)

**Rozwijamy Recallio jako prywatny zeszyt do nauki z biblioteką własnych fiszek.** Po zalogowaniu użytkownik powinien rozpoznać swoje materiały, zobaczyć sensowny następny krok i móc wykonać go jednym przyciskiem. W czasie powtórki pierwszeństwo mają treść i przypomnienie sobie odpowiedzi. Można skończyć po jednej fiszce albo ćwiczyć dłużej.

Zachowujemy kremowe tło, ciemną zieleń, szeryfowe nagłówki, tekstowe przyciski i drzeworyt na ekranach wejściowych. Największa zmiana dotyczy **hierarchii informacji**. Panel ma odpowiadać na pytanie „czego mogę się teraz uczyć?”, biblioteka na „gdzie jest mój materiał?”, trening na „co pamiętam?”. Każdy z tych ekranów wymaga innej gęstości, nawet jeśli używają wspólnej typografii.

**Pierwszy prototyp** powinien pozwolić założyć pusty zestaw, wpisać pierwszą fiszkę i ocenić odpowiedź. Drugi przebieg zaczyna się na koncie z kilkoma zestawami, z których tylko jeden ma zaległą powtórkę. Te dwa przypadki ujawnią, czy nowy układ poprawia użyteczność. Ostatni etap obejmuje formularze konta, import i sytuacje wyjątkowe.

Poniższe ustalenia o działaniu aplikacji pochodzą z kodu i dokumentacji. Kierunek wizualny, sposób wyboru zestawu, rozmieszczenie akcji i kryteria prototypu są **propozycją do sprawdzenia na makietach**. Analiza ma charakter ekspercki. Nie obejmowała badań z użytkownikami ani pomiarów czasu realizacji zadań.

## 2. Co wynika z analizy

| Obserwacja                                                                                                                                                           | Konsekwencja dla projektu                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nowe i aktywne konto widzą na panelu ten sam przycisk. Przy pustej bibliotece można przejść do nauki i dopiero tam dowiedzieć się o braku fiszek.                    | Treść panelu zależy od danych konta. Projektujemy osobno pierwszy pobyt i powrót. [Obecny panel](../src/app/page.tsx)                                                                                                                        |
| Wejście do treningu bez identyfikatora zestawu wybiera pierwszy dostępny zestaw z fiszkami. Kolejka nadaje priorytet powtórkom dopiero w obrębie wybranego zestawu.  | Kiedy panel poleca powtórkę, musi znać jej zestaw i przekazać go do treningu. Sama zmiana napisu na przycisku dałaby mylącą obietnicę. [Wybór zestawu](../src/features/study/study-session.tsx) · [Kolejka](../src/domain/learning/queue.ts) |
| W szczegółach zestawu nauka, edycja, usuwanie, eksport i dodawanie fiszki są umieszczone obok siebie. Na telefonie tworzą kilka rzędów przycisków.                   | Wyeksponować naukę i dodanie materiału. Rzadsze działania udostępnić w rozwijanej sekcji „Zarządzaj zestawem”. [Zestawy](../src/features/decks/deck-manager.tsx)                                                                             |
| Przed pytaniem mogą pojawić się informacje o zapisie, gotowości offline i licznikach. Odsłanianie oraz cztery oceny mają już obsługę klawiatury i ponowienia zapisu. | Zachować rytm odpowiedzi i skróty. Ustawić pytanie wyżej, a stan zapisu pokazywać w miejscu, którego dotyczy. [Trening](../src/features/study/study-session.tsx)                                                                             |
| Import potrafi odróżnić duplikat, wariant odpowiedzi i konflikt przykładu, a po przerwaniu wznowić zapis.                                                            | Pokazać konkretną różnicę między dwiema fiszkami i skutek decyzji. Zaprojektować też częściowo ukończony import. [Import CSV](../src/features/import/csv-import.tsx)                                                                         |

### Wzorce z innych produktów

| Referencja | Obserwowany wzorzec                                                                 | Zastosowanie w Recallio                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anki       | Wybrany zestaw ma własny kontekst nauki. Po odsłonięciu pojawiają się cztery oceny. | Zestaw ma być rozpoznawalny także wewnątrz sesji. Układ ocen pozostaje stały po każdym odsłonięciu. [Anki Manual](https://docs.ankiweb.net/manual/studying)                                                |
| RemNote    | Strona główna fiszek pozwala od razu rozpocząć należne powtórki.                    | Powiązać główną akcję z materiałem czekającym teraz. Wystarcza nazwa zestawu. Licznik zależy od preferencji użytkownika. [Flashcard Home](https://help.remnote.com/en/articles/7925835-the-flashcard-home) |
| Quizlet    | Tytuł zestawu, pojęcie i definicja należą do jednego przebiegu tworzenia materiału. | Po zapisaniu pierwszego zestawu od razu ustawić fokus na stronie A pierwszej fiszki. [Tworzenie zestawów](https://help.quizlet.com/hc/en-us/articles/360029780752-Creating-flashcard-sets)                 |
| Mochi      | Kolejkę kart do powtórki można otworzyć także dla konkretnego zestawu.              | Panel wskazuje jeden zestaw do rozpoczęcia. Biblioteka daje swobodny wybór innego. [Due today](https://www.mochi.cards/docs/reviewing/due-today/)                                                          |

Rachmistrz dostarcza sprawdzonych w tym projekcie punktów odniesienia dla koloru papieru, czytelności formularzy i widocznego fokusu. Od Standard Ebooks bierzemy relację między tytułem a ilustracją, a od Letterform Archive sposób eksponowania reprodukcji i dyskretnego podpisu. W Recallio te odniesienia są najbardziej przydatne na wejściu. Podczas przypominania sobie słowa wzrok powinien zatrzymać się na pytaniu. [Referencje projektu](TECHNICAL-PLAN.md#rachmistrz) · [Standard Ebooks](https://standardebooks.org/about/what-makes-standard-ebooks-different) · [Letterform Archive](https://letterformarchive.org/online-archive/)

## 3. Język wizualny

### Kolor i materiały

Poniższe wartości pochodzą z aktualnego motywu. W pliku projektowym warto nadać im nazwy odpowiadające ich roli, tak aby zmiana koloru tekstu pomocniczego objęła wszystkie ekrany. [Style globalne](../src/app/globals.css)

| Rola                   | Wartość               | Przykład użycia                                                                     |
| ---------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| Papier                 | `#F6F5EF`             | Tło całej strony, również w treningu                                                |
| Powierzchnia do pracy  | `#FFFEFA`             | Fiszka, pole tekstowe, blok edycji aktywnego wiersza                                |
| Atrament               | `#293C33`             | Pytanie, tytuł, główny przycisk z jasnym tekstem                                    |
| Tekst pomocniczy       | `#596359`             | Kierunek nauki, podpis ilustracji, podpowiedź przy polu                             |
| Rdza                   | `#91492F`             | Kursywa w tytule panelu, odsłonięta odpowiedź, tekst alertu z wyraźnym opisem błędu |
| Separator / obrys pola | `#DEDFD5` / `#858D80` | Delikatna linia między rekordami / wyraźna granica edytowalnej kontrolki            |
| Fokus / akcent marki   | `#507A40` / `#D9EF8B` | Obrys fokusu 3 px z odsunięciem 4 px / litera w sygnecie                            |

Większość ekranu zajmuje papier. Jedna ciemna powierzchnia przyciąga wzrok do głównej czynności. Jasne powierzchnie wyznaczają miejsca do pisania lub czytania fiszki. Poziome linie organizują bibliotekę, formularze i podgląd CSV. Podwójną linię 3 px rezerwujemy dla początku głównej sekcji. Przyciski i pola mają małe zaokrąglenie 3–4 px. Wszystkie działania użytkownika otrzymują **etykiety tekstowe, bez ikon i strzałek**. Sygnet pozostaje elementem marki.

### Typografia i rytm

| Styl do zdefiniowania w makietach         | Telefon                  | Duży ekran      | Zastosowanie                                                                     |
| ----------------------------------------- | ------------------------ | --------------- | -------------------------------------------------------------------------------- |
| Tytuł panelu, Instrument Serif 400        | 56–68 px                 | 80–112 px       | Krótki, najwyżej dwa wiersze. Jeden wyraz może być kursywą                       |
| Tytuł roboczy, Instrument Serif 400       | 40–52 px                 | 52–76 px        | Nazwa ekranu, np. „Moje zestawy”. Długa nazwa zestawu korzysta z dolnego zakresu |
| Pytanie i odpowiedź, Instrument Serif 400 | 30–40 px                 | 40–56 px        | Pytanie w kolorze atramentu. Odpowiedź odróżniona też pozycją i separatorem      |
| Nagłówek sekcji                           | 25–32 px                 | 28–36 px        | „Biblioteka”, „Podgląd importu”, nazwa zestawu w wyróżnionym wierszu             |
| Tekst, Manrope 400–500                    | 16 px                    | 16–18 px        | Objaśnienia, treść pól, dłuższe przykłady. Interlinia 1,5–1,7                    |
| Akcja / etykieta / podpis, Manrope        | 15–16 / 14–16 / 12–14 px | Te same zakresy | Akcja 650, etykieta 500–600. Mały stopień dla podpisu reprodukcji                |

Wartości są punktem wyjścia do makiet. Przy długich zdaniach zmniejszamy stopień w granicach danego stylu i pozwalamy treści rosnąć pionowo. Na fiszce zachowujemy pełny tekst obu stron i osobne przykłady. W bibliotece nazwa może zająć kilka wierszy. W szczegółach zestawu zawsze widać ją w całości. Do oceny składu używamy polskich znaków, znaków innych alfabetów i tekstu dłuższego niż nagłówek „Nauka”.

Odstępy robocze: 4 px między blisko powiązanymi elementami, 8 px między etykietą a polem, 12–16 px między polami lub akcjami, 24–32 px między grupami, 48–72 px między głównymi sekcjami na komputerze. Na telefonie odstęp między dużymi sekcjami zwykle mieści się w 24–32 px.

### Ilustracja

Używamy lokalnego drzeworytu _Ejiri w prowincji Suruga_. Pokazujemy pełne proporcje, krótki podpis autora i tekstowy odsyłacz do muzeum. Na nowym koncie reprodukcja może towarzyszyć wejściu. Na aktywnym koncie pierwszeństwo ma polecany zestaw. Na telefonie przycisk i wejście do biblioteki poprzedzają dużą ilustrację. W treningu, edycji i konflikcie CSV całą szerokość przeznaczamy na materiał użytkownika. [Plik ilustracji](../public/ejiri.webp) · [Reprodukcja w The Met](https://www.metmuseum.org/art/collection/search/55735)

## 4. Układy i nawigacja

Podstawowe ramki do projektowania: **390 × 844** i **1440 × 900**. Każdy główny układ sprawdzamy też przy 320 px oraz na pośredniej szerokości 768 px. Wysokość ramki wyznacza pierwszy widoczny obszar. Listy, długie pytania i formularze przewijają się naturalnie.

| Układ                | Komputer                                                                                                                                                         | Telefon                                                                                                                                                      | Widoki                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Wejście z ilustracją | Kontener do 1152 px. Lewa część około 42%, prawa 58%. Formularz do 432 px. Rycina z podpisem po prawej                                                           | Jedna kolumna, marginesy 16–20 px. Nagłówek, pola i akcja poprzedzają obraz                                                                                  | Logowanie, rejestracja, odzyskiwanie hasła, 404 |
| Panel                | Nagłówek serwisu, propozycja nauki z nazwą zestawu, obok ilustracja. Niżej biblioteka oddzielona linią                                                           | Akcja główna i alternatywa mieszczą się wysoko. Ilustrację można ograniczyć do wariantu wejściowego                                                          | Panel pusty i aktywny                           |
| Katalog              | Na szerokim ekranie lista zestawów i szczegóły wybranego zestawu mogą być obok siebie. Wiersz zawiera nazwę, opcjonalną informację o powtórce i tekstowe wejście | Lista na całej szerokości. Dotknięcie otwiera szczegóły z linkiem „Wróć do zestawów”. Powrót zachowuje wyszukiwanie i wybrany wiersz                         | Biblioteka, szczegóły zestawu                   |
| Formularz i podgląd  | Tytuł w węższej kolumnie, formularz w szerszej. Szerokość tekstu pomocniczego ok. 55–70 znaków. Podgląd CSV może wykorzystać pełną szerokość pod tytułem         | Najpierw tytuł, potem pola. Dwie strony fiszki i porównanie CSV układają się pionowo z jawnymi etykietami                                                    | Edytory, konto, import                          |
| Skupienie na fiszce  | Nad pojedynczą płaszczyzną o szerokości ok. 640–760 px znajduje się nazwa zestawu. Pytanie rozpoczyna się wysoko. Akcje sesji są niżej                           | Fiszka wykorzystuje dostępną szerokość. Po odsłonięciu stała kolejność ocen w układzie 2 × 2. Długa odpowiedź może przesunąć akcje poniżej pierwszego ekranu | Trening online i offline                        |

**Nawigacja.** Po zalogowaniu znak Recallio prowadzi do panelu, a „Moje konto” do danych konta. W formularzach uwierzytelniania zachowujemy ustalone osobne adresy i pomijamy znak oraz link do strony głównej nad formularzem. W treningu powrót do zestawu nosi jego nazwę albo etykietę „Wróć do zestawu”. Na telefonie rozmieszczenie i kolejność fokusu mają odpowiadać kolejności czytania.

## 5. Inwentarz makiet

**18 widoków bazowych.** Numer identyfikuje projektowany widok. Kilka widoków może korzystać z jednej trasy i jednego komponentu. Stan pusty, błąd, komunikat oraz potwierdzenie destrukcyjnej czynności otrzymują wariant wskazanego widoku. Poniższa tabela jest listą produkcyjną do późniejszego przygotowania ramek.

| ID · widok                        | Obecny adres lub miejsce                 | Treść i główne działanie                                                                           | Warianty do rozrysowania                                                                                          |
| --------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| W01 · Panel nauki                 | `/`                                      | Nazwa zestawu i jedno działanie wynikające z danych. Niżej wejścia do biblioteki i importu         | Ładowanie, nowe konto, pusty zestaw, należna powtórka, nowe fiszki, dalsze ćwiczenie, osiągnięty limit            |
| W02 · Biblioteka                  | `/decks`                                 | Wyszukiwanie, lista zestawów, „Dodaj zestaw”. Import jako link                                     | Pusta lista, kilka zestawów, brak wyników wyszukiwania, długa nazwa                                               |
| W03 · Formularz zestawu           | W obrębie `/decks`                       | Nazwa, kierunek A→B, B→A lub mieszany. „Zapisz zestaw”                                             | Tworzenie, edycja, walidacja, anulowanie                                                                          |
| W04 · Szczegóły zestawu           | Wybrany zestaw w `/decks`                | Nazwa, „Ucz się z tego zestawu”, „Dodaj fiszkę”, lista materiału. Rozwinięcie „Zarządzaj zestawem” | Pusty, z treścią, gotowy offline, brak miejsca, edycja i usunięcie z potwierdzeniem, eksport CSV                  |
| W05 · Edytor fiszki               | Formularz w szczegółach zestawu          | Strony A i B, opcjonalny przykład każdej strony. „Zapisz fiszkę”                                   | Pierwsza fiszka, kolejna, edycja, długie teksty, błąd, usunięcie lub reset wskazanego kierunku z potwierdzeniem   |
| W06 · Trening — pytanie           | `/study?deck=…`, także w powłoce offline | Nazwa zestawu, treść jednej strony, „Pokaż odpowiedź”                                              | A→B, B→A, brak materiału, trening dodatkowy, dane jeszcze się wczytują, brak przygotowanego zestawu offline       |
| W07 · Trening — odpowiedź i ocena | Ta sama sesja                            | Pytanie zostaje na miejscu. Pojawia się odpowiedź, przykład oraz cztery oceny                      | Z przykładem i bez, długa odpowiedź, trwa zapis, błąd i ponowienie, brak sieci po lokalnym zapisie                |
| W08 · Koniec sesji                | Stan w `/study`                          | „Sesja zakończona”, „Rozpocznij nową sesję”, powrót do zestawu                                     | Po decyzji użytkownika, z licznikiem odpowiedzi na życzenie. Bieżący plan wykonany w trakcie sesji to wariant W06 |
| W09 · Ustawienia nauki            | Rozwijana sekcja treningu                | Limit nowych fiszek, dwa niezależne liczniki, strefa tylko do odczytu. „Zapisz ustawienia”         | Domyślne 20, limit 0, zapis, walidacja, błąd                                                                      |
| W10 · Wybór pliku CSV             | `/import` lub `/import?deck=…`           | Wybór nowego lub istniejącego zestawu, plik, link do wzoru                                         | Bez pliku, plik wybrany, zły nagłówek, kodowanie lub rozmiar                                                      |
| W11 · Podgląd i decyzje CSV       | Stan w `/import`                         | Numer wiersza, obie strony, klasyfikacja i decyzja. Zatwierdzenie planu                            | Gotowe, duplikat, inna odpowiedź, inny przykład, błędny wiersz, wiele stron wyników                               |
| W12 · Wynik importu               | Stan w `/import`                         | Postęp zapisu, potem potwierdzenie i przejście do zestawu                                          | Zapis w toku, częściowy, wznowiony, zakończony przez użytkownika, zakończony pomyślnie                            |
| W13 · Konto                       | `/account`                               | E-mail bieżącego konta, wylogowanie, powrót do nauki                                               | Brak oczekujących zmian, zmiany przed wylogowaniem, synchronizacja nieudana, anulowanie                           |
| W14 · Logowanie                   | `/auth/login`                            | E-mail, hasło, „Zaloguj się”, linki do rejestracji i odzyskiwania                                  | Błędne dane, wygasła sesja, nieprawidłowy lub wygasły link                                                        |
| W15 · Rejestracja                 | `/auth/signup`                           | E-mail, hasło, „Utwórz konto”                                                                      | Błąd pól, oczekiwanie na potwierdzenie e-mail, powrót po potwierdzeniu                                            |
| W16 · Odzyskiwanie hasła          | `/auth/forgot-password`                  | E-mail i „Wyślij link”                                                                             | Walidacja, potwierdzenie wysyłki o neutralnej treści                                                              |
| W17 · Nowe hasło                  | `/auth/new-password`                     | Nowe hasło i „Zapisz hasło”                                                                        | Nieprawidłowe hasło, wygasła sesja, sukces prowadzący do konta                                                    |
| W18 · Nieznany adres              | Widok 404                                | „Nie znaleziono strony” i „Strona główna”                                                          | Komputer i telefon. Jedno działanie prowadzi do odpowiedniego wejścia                                             |

Powłoka `/study/offline` odtwarza W06–W09 na przygotowanym urządzeniu. Przekierowanie ze starego `/auth?mode=…`, wysłanie formularza i obsługa linku potwierdzającego prowadzą do stanów W01 lub W14–W17. W makiecie łączymy te miejsca przejściami.

## 6. Zachowanie kluczowych ekranów

### Panel — co użytkownik widzi po zalogowaniu

W01 ma ustalić propozycję po odczytaniu danych właściwego konta. W trakcie wczytywania zarezerwować miejsce na nazwę i działanie. Pokazanie pustej biblioteki przed zakończeniem odczytu wyglądałoby jak utrata materiałów. Poniższa kolejność jest rekomendacją dla przyszłej logiki panelu.

| Dane                                                           | Treść i działanie główne                                                                                                 | Co dzieje się po kliknięciu                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Konto bez zestawów                                             | „Twoje zestawy”, **Utwórz pierwszy zestaw**. Obok „Importuj CSV”                                                         | W03. Zapis nazwy otwiera W05 z fokusem na stronie A                                                                     |
| Są zestawy, wszystkie puste                                    | Nazwa zestawu, **Dodaj pierwszą fiszkę**                                                                                 | W05 z przypisanym zestawem. Gdy pustych zestawów jest kilka, dostępny jest wybór w W02                                  |
| Są kierunki z terminem, który już minął                        | Nazwa zestawu, **Powtórz teraz**. Przy włączonym liczniku można pokazać liczbę i jej zakres                              | W06 dla zestawu z najwcześniejszym należnym terminem. Jawny wybór innego zestawu w bibliotece ma pierwszeństwo          |
| Brak należnych powtórek, są dostępne nowe fiszki i wolny limit | Nazwa zestawu, **Poznaj nowe fiszki**                                                                                    | W06 dla zestawu zawierającego dostępny materiał                                                                         |
| Są poznane fiszki, plan na tę chwilę wykonany                  | „Możesz ćwiczyć dalej”, **Ćwicz dalej**                                                                                  | Dodatkowe ćwiczenie w nazwanym zestawie, z istniejącymi zasadami ocen                                                   |
| Zostały tylko nowe fiszki, limit wynosi 0 lub się wyczerpał    | „Dzisiejszy limit nowych fiszek został wykorzystany” albo „Wprowadzanie nowych fiszek jest wyłączone”. **Otwórz zestaw** | W04. Świadoma akcja „Dodaj jeszcze jedną nową fiszkę” powinna wskazywać skutek. Samo wejście do zestawu zachowuje limit |

W makiecie podajemy nazwę proponowanego zestawu jeszcze przed kliknięciem. Przy kilku zestawach o takim samym terminie proponujemy stabilną kolejność według nazwy, potem identyfikatora. Jeśli w jednym zestawie oczekuje powtórka, a drugi jest pusty, akcja prowadzi do powtórki. Dla braku sieci uwzględniamy jedynie przygotowany lokalnie materiał. Widok rozróżnia „możesz powtórzyć teraz” od liczby powtórek przypadających do końca dnia. To ostatnie pojęcie może obejmować także późniejszą godzinę.

### Biblioteka — od nazwy zestawu do pierwszej oceny

Na pustym koncie pole wyszukiwania ma małą wartość. Najwięcej miejsca dostaje akcja utworzenia zestawu, a pod nią import własnego CSV. Po zapisaniu nazwy aplikacja pokazuje ją nad edytorem pierwszej fiszki. **Strona A** i **Strona B** są widoczne jednocześnie na komputerze. Na telefonie znajdują się jedna pod drugą w kolejności wprowadzania. Opcjonalne przykłady można rozwinąć pod odpowiednią stroną. Po zapisie proponujemy „Ucz się z tego zestawu” i „Dodaj kolejną fiszkę”. Nazwa wcześniej zapisanego zestawu i treść poprawnie wypełnionych pól przeżywają błąd kolejnego kroku.

W bibliotece z materiałem wiersz jest jednym celem nawigacji. Użytkownik wybiera zestaw po nazwie. Szczegóły pokazują kierunek nauki, główną akcję i fiszki w porządku czytania A, B, przykłady. Eksport, edycja nazwy i usunięcie zestawu należą do „Zarządzaj zestawem”. Reset postępu dotyczy wskazanej fiszki i kierunku. Okno potwierdzenia wymienia nazwę obiektu, kierunek i rzeczywisty skutek. Po jego zamknięciu fokus wraca do akcji, która je otworzyła.

### Trening — co ma zostać na ekranie

| Moment            | Układ, fokus i przejście                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pytanie           | Nad fiszką nazwa zestawu. Na niej pytanie i „Pokaż odpowiedź”. Fokus można przenieść na przycisk klawiaturą. Przykład powiązany z odpowiedzią pojawia się po odsłonięciu                                  |
| Odsłonięcie       | Pytanie zachowuje położenie. Pod separatorem pojawia się odpowiedź, opcjonalnie przykład, potem **Nie pamiętam / Trudno / Dobrze / Łatwo**. Na telefonie czytamy od lewej do prawej, następnie drugi rząd |
| Ocena             | Jedna aktywacja rozpoczyna zapis. Kolejna fiszka pojawia się po lokalnym zatwierdzeniu oceny. Zmiany przychodzące z synchronizacji nie podmieniają właśnie odsłoniętej karty                              |
| Zapis nieudany    | Odpowiedź pozostaje widoczna. Przy niej „Nie udało się zapisać oceny” i główne „Ponów zapis”. Fokus przechodzi do ponowienia. Retry dotyczy tego samego zdarzenia                                         |
| Praca offline     | Krótkie „Offline” obok kontekstu zestawu. Po poprawnym zapisie lokalnym można od razu kontynuować. Brak przygotowanych danych otrzymuje własny komunikat i drogę powrotu po odzyskaniu połączenia         |
| Wykonane powtórki | Dyskretne zdanie przy przejściu do dalszego ćwiczenia. „Zakończ sesję” pozostaje dostępne w trakcie nauki. Wyłącznie świadome zakończenie otwiera W08                                                     |

Limit wynosi domyślnie **20 nowych fiszek dziennie na konto**. Drugi kierunek znanej fiszki nie pobiera drugiej jednostki limitu. Dzień zmienia się o północy według **Europe/Warsaw**. To informacja tylko do odczytu. Licznik powtórek i licznik odpowiedzi w sesji mają osobne ustawienia. W makiecie z wyłączonymi licznikami wystarczą nazwa zestawu i właściwa akcja. Preferencję respektujemy również na panelu. [Zasady czasu](decisions/002-local-account-and-time.md) · [Kontrakt zapisu](CONTRACTS.md)

### Import, synchronizacja i dostęp do konta

**Podgląd CSV.** Na komputerze porównujemy „W pliku” i „W zestawie” obok siebie. Na telefonie obie wartości sąsiadują w pionie pod numerem wiersza. Tekst „Inna odpowiedź” lub „Inny przykład” określa powód decyzji. Użytkownik widzi tylko działania dostępne dla danego wiersza, np. pominięcie, utworzenie fiszki, aktualizację przykładów lub świadome zastąpienie treści. Przy kilku dopasowaniach wskazuje fiszkę docelową. W dużym pliku utrzymujemy decyzje przy przejściu do następnej strony. Obecny podgląd ma 20 wierszy na stronę. [Reguły CSV](CONTRACTS.md#csv-v1)

**Wynik zapisu.** Po przerwaniu planu przykład komunikatu brzmi „Zapisano 2 z 5 kroków”. „Wznów import” kontynuuje od zapisanego miejsca. Przy „Zakończ import” potwierdzenie informuje, że zapisane fiszki zostaną w zestawie. Sukces importu dotyczy zapisu na urządzeniu. Stan wysłania danych opisujemy osobno tylko wtedy, gdy wymaga uwagi.

**Konto i sesja.** Przy rejestracji oraz odzyskiwaniu hasła potwierdzenie wysłania wiadomości zachowuje prywatność adresu. Wygasły link wraca do logowania z czytelną drogą do ponownego odzyskania dostępu. Gdy konto ma niewysłane zmiany, okno wylogowania oferuje „Synchronizuj i wyloguj się”, „Anuluj” i oddzielone działanie „Odrzuć zmiany i wyloguj się”. Wygaśnięcie sesji zachowuje lokalne zmiany do ponownego zalogowania na to samo konto. [Obsługa konta](../src/features/auth/account-panel.tsx)

## 7. Komponenty i dostępność

| Element do biblioteki komponentów | Warianty i zachowanie                                                                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nagłówek serwisu                  | Prywatny z marką i kontem, publiczny formularz bez górnej nawigacji, kompaktowy układ 320 px. Długi e-mail zawija się                                                                              |
| Przycisk i link                   | Akcja główna ciemna, drugorzędna z obrysem, nawigacja podkreślona, działanie destrukcyjne o jednoznacznej etykiecie. Stany domyślny, hover, fokus, wciśnięty, zajęty i wyłączony                   |
| Pole formularza                   | Etykieta stale widoczna, wartość, opis opcjonalny, błąd przy polu. W edycji tekstu zachowujemy wpisaną wartość po walidacji                                                                        |
| Wiersz katalogu                   | Zestaw, fiszka lub wynik wyszukiwania. Wybrany zestaw ma oznaczenie czytelne również bez koloru. Treść użytkownika w pełnej postaci na ekranie szczegółowym                                        |
| Fiszka i grupa ocen               | Pytanie, odpowiedź, przykład, zapisywanie i ponowienie. Po odsłonięciu fokus trafia do pierwszej oceny, po właściwym zapisie do akcji kolejnej karty. Wskazówki skrótów dostępne dla klawiatury    |
| Komunikat i potwierdzenie         | Wiadomość obok właściwej akcji. Błąd otrzymuje opis skutku i możliwy następny krok. Przy błędzie zapisu treść pozostaje dostępna. Przy zniszczeniu danych proponowany początkowy fokus na „Anuluj” |
| Wiersz importu                    | Podstawowe pola i porównanie treści w konflikcie. Opis statusu tekstem. Wybór działania i ewentualnego celu powiązany z numerem wiersza                                                            |

Jako cel odbioru przyjmujemy WCAG 2.2 AA. Na makietach oznaczamy kolejność tabulatora, miejsce fokusu po zmianie stanu oraz komunikaty do odczytania przez czytnik. Tekst zwykły powinien osiągać kontrast co najmniej 4,5:1, duży 3:1. Granice kontrolek niezbędne do ich rozpoznania sprawdzamy przy 3:1. Cel projektowy dla dotyku to 44–48 px, również w grupie ocen. Przy 320 px unikamy poziomego przewijania całej strony. Sprawdzamy powiększenie tekstu do 200%, długie etykiety, błędy oraz kolejność czytania. Użytkownik z ograniczonym ruchem otrzymuje natychmiastowe odsłonięcie treści. Potwierdzenie semantyki i działania z czytnikiem nastąpi na działającej implementacji. [W3C — WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## 8. Dane i instrukcje do generowania makiet

Używaj tego samego materiału w całym prototypie. Przykłady poniżej to dane do projektu wizualnego. Puste konto produkcyjne zaczyna z własną, pustą biblioteką.

| Scenariusz                | Dane do makiety                                                                                                                                      | Co scenariusz rozstrzyga                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Pierwsza wizyta           | Konto `ola@example.test`, 0 zestawów, limit 20, liczniki wyłączone                                                                                   | Droga do pierwszej własnej fiszki                                              |
| Powrót                    | „Angielski w podróży”, 12 fiszek, brak należnych teraz. „Włoski w kawiarni”, 8 fiszek, 2 kierunki do powtórki teraz. „Słowa z lektury”, zestaw pusty | Panel poleca „Włoski w kawiarni”, mimo że na liście jest inny pierwszy zestaw  |
| Jedna fiszka              | A: „un conto”, B: „rachunek”, przykład A: „Il conto, per favore.”, przykład B: „Poproszę rachunek.”                                                  | Dwa kierunki nauki, odpowiedź z przykładem, poprawne przypisanie języka strony |
| Materiał trudny do składu | Nazwa „Słownictwo z rozdziału o historii włoskiej architektury”, odpowiedź na kilka wierszy, przykład z polskimi znakami, skalowanie tekstu          | Zachowanie przycisków, pól, nagłówka i kompletnej treści                       |
| Konflikt importu          | W zestawie „un conto / rachunek”. W pliku „un conto / konto”. W innym wierszu zgodna para z nowym przykładem                                         | Użytkownik rozumie, czy zmienia znaczenie, przykład, czy dodaje osobną fiszkę  |
| Przerwanie sieci          | Jeden przygotowany zestaw, ocena zapisana lokalnie, jedna zmiana czeka na wysłanie                                                                   | Odróżnienie możliwości dalszej nauki od problemu z zapisem na urządzeniu       |

### Szablon polecenia dla generatora

> Przygotuj makietę Recallio dla **[ID i stan z tabeli]**, w rozmiarze **[390 × 844 lub 1440 × 900]**. Osoba otwiera ten widok po **[zdarzenie]** i chce **[jedno zadanie]**. Użyj danych **[scenariusz]**. Rozmieść w kolejności **[kontekst, treść, główna akcja, akcja drugorzędna]**. Zastosuj role kolorów i typografię z sekcji 3 oraz układ z sekcji 4. Napis na przycisku ma brzmieć dokładnie **[etykieta]**. Użyj polskiego interfejsu i tekstowych akcji. Pokaż konkretny stan. W adnotacji poza interfejsem opisz źródło danych, skutek kliknięcia i docelowy fokus.

**Przykład W01, aktywne konto.** Na telefonie pokaż nagłówek serwisu, tytuł „Panel nauki”, nazwę „Włoski w kawiarni”, „Powtórz teraz” i wejście „Moje zestawy”. Użytkownik ma wyłączone liczniki. Kliknięcie otwiera pytanie z tego zestawu. W odpowiedniku desktopowym dane i przycisk pozostają po lewej, reprodukcja z podpisem po prawej. Obie ramki pokazują ten sam moment tej samej osoby.

**Przykład W07, błąd lokalnego zapisu.** Przedstaw „un conto” i odsłonięte „rachunek” wraz z przykładem. Bezpośrednio pod odpowiedzią umieść „Nie udało się zapisać oceny” oraz „Ponów zapis” z widocznym fokusem. Kolejne kliknięcie dotyczy tej samej odpowiedzi. To oddzielny wariant od poprawnego zapisu offline, po którym można już oglądać kolejną fiszkę.

Plik makiet warto podzielić na strony: podstawy i komponenty, główny przebieg nauki, zarządzanie materiałem, konto i sytuacje wyjątkowe. Nazwa ramki zawiera identyfikator, stan i szerokość, np. **W07 — błąd zapisu — 390**. Adnotacje techniczne umieszczamy poza obszarem interfejsu. Wersja do generatora powinna zawierać konkretny przypadek z tabeli, zamiast prośby o wymyślenie zawartości panelu.

## 9. Kolejność prac i odbiór

| Etap                              | Co przygotować                                                                                                | Warunek przejścia dalej                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Przebieg bez oprawy graficznej | W01–W07 w niskiej szczegółowości. Puste konto, konto powracające, jedno odsłonięcie i ocena. Najpierw telefon | Osoba od panelu dochodzi do oceny pierwszej własnej fiszki. Na powracającym koncie jednym wyborem otwiera powtórkę z właściwego zestawu |
| 2. Styl na rzeczywistym materiale | Style i komponenty, szczegółowe W01, W02, W06, W07, W14. Te same dane na obu szerokościach                    | Treść i główna akcja zachowują hierarchię; przy 320 px i długiej odpowiedzi wszystkie akcje pozostają osiągalne                         |
| 3. Materiał i ciągłość pracy      | Dopracowanie W03–W05, W08–W13, w tym CSV, offline, limit 0 i wylogowanie z niewysłanymi zmianami              | Każdy konflikt i błąd ma nazwany skutek oraz przynajmniej jedno wykonalne wyjście                                                       |
| 4. Komplet i przekazanie          | W15–W18, warianty formularzy, połączenia prototypu, przegląd klawiaturowy i lista zależności wdrożeniowych    | Wszystkie 18 widoków ma ramkę bazową, wariant responsywny i opis przejścia. Stany krytyczne mają własne ramki albo warianty komponentów |

Do pierwszej sesji z użytkownikiem wystarczą trzy zadania: „Dodaj słowo i przećwicz je”, „Wróć jutro do zaplanowanej powtórki” i „Zaimportuj plik, zachowując swoją dotychczasową odpowiedź”. Obserwuj, gdzie osoba szuka wejścia, czy potrafi przewidzieć wynik kliknięcia i czy wie, kiedy jej odpowiedź została zapisana. Zapisz liczbę nieudanych prób, cofnięć i potrzebnych podpowiedzi. Wnioski z tego przebiegu powinny decydować o kolejnej iteracji układu.

**Przekazanie do implementacji.** Dla każdego widoku przekazujemy źródło danych, pokazany stan, docelową akcję, zachowanie po sukcesie i błędzie, fokus oraz układ przy małej szerokości. W pierwszej kolejności do oszacowania są wybór zestawu z należną powtórką na panelu, otwarcie edytora pierwszej fiszki po zapisie zestawu oraz przeniesienie przygotowania offline do szczegółów zestawu. Te trzy zmiany dotyczą zachowania aplikacji. Sam arkusz stylów ich nie zapewni. Punkty odniesienia dla odbioru pozostają w [briefie produktu](PRODUCT-BRIEF.md), [kontraktach synchronizacji](CONTRACTS.md) i [scenariuszach weryfikacji](VERIFICATION.md).
