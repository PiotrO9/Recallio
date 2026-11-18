# Plan aplikacji do nauki fiszek

Status: plan przed implementacją.

Dokument zbiera ustalenia produktowe i techniczne. Elementy oznaczone jako „Propozycja” wymagają jeszcze zatwierdzenia. Nie oznacza to rozpoczęcia implementacji.

## 1. Cel produktu

Osobna aplikacja do nauki fiszek, inspirowana prostotą i sposobem działania Rachmistrza.

Aplikacja jest przeznaczona dla wielu użytkowników. Główne zastosowanie to nauka języków, ale model fiszek pozwala również uczyć się dowolnych treści tekstowych.

Podstawowa obietnica produktu:

> Wybierasz zestaw i uczysz się tyle, ile masz czasu. Aplikacja zapisuje postęp i dobiera kolejne powtórki.

Aplikacja ma dobrze obsługiwać zarówno krótkie wejście na 2 minuty, jak i dłuższą naukę. Nie wymaga ukończenia sesji ani wykonania określonej liczby fiszek.

## 2. Projekty referencyjne

### Rachmistrz

Lokalizacja: `D:\CODE\rachmistrz`

Główna referencja dla:

- UI i stylu wizualnego.
- Typografii, kolorów, odstępów i przycisków.
- Responsywności.
- Interakcji i komunikatów.
- Prostoty ekranów.
- Płynnego, nieprzerwanego treningu.
- Organizacji logiki domenowej, zapisu i interfejsu tam, gdzie wzorce pasują do nowej aplikacji.

Przed projektowaniem ekranów należy przeanalizować Rachmistrza i wykorzystać jego sprawdzone wzorce, dostosowując je do fiszek, odsłaniania odpowiedzi, samooceny, zestawów i powtórek.

Nie przenosimy automatycznie zasad specyficznych dla zadań matematycznych.

### Next Frontend Starter

Repozytorium: https://github.com/PiotrO9/next-frontend-starter

Można wzorować się na nim w zakresie:

- Struktury projektu Next.js.
- Konfiguracji narzędzi.
- Organizacji kodu.
- Praktyk implementacyjnych.
- Skilli i instrukcji dla AI.

Nie kopiujemy automatycznie całego startera ani jego warstwy wizualnej.

Zawartość repozytorium wymaga jeszcze zweryfikowania. Publiczna próba odczytu zwróciła 404.

### Kolejność pierwszeństwa

1. Wymagania aplikacji do fiszek ustalone w tym planie.
2. Rachmistrz jako referencja wyglądu i zachowania.
3. Ustalony stack Next.js + Supabase + Cloudflare.
4. Wybrane rozwiązania techniczne i skille ze startera.

## 3. Zakres pierwszej wersji

Pierwsza wersja obejmuje:

- Konta użytkowników.
- Prywatne zestawy fiszek.
- Ręczne dodawanie, edytowanie i usuwanie treści.
- Masowy import CSV.
- Wykrywanie duplikatów i rozstrzyganie konfliktów importu.
- Eksport treści do CSV.
- Naukę w jednym lub obu kierunkach.
- Cztery stopnie samooceny.
- Planowanie powtórek.
- Stopniowe wprowadzanie nowych fiszek.
- Ciągły trening po wykonaniu powtórek na dziś.
- Działanie offline.
- Instalację jako PWA.
- Synchronizację między urządzeniami.

Poza zakresem pierwszej wersji:

- Publiczny katalog zestawów.
- Udostępnianie zestawów linkiem.
- Generowanie fiszek przez AI.
- Zdjęcia, nagrania i inne multimedia w fiszkach.
- Płatności i subskrypcje.
- Rozbudowane statystyki, rankingi i grywalizacja.
- Import z Anki, Quizlet lub plików XLSX.
- Eksport pełnej kopii postępów i ustawień.
- Osobne aplikacje natywne publikowane w sklepach.

## 4. Platformy i dostęp

- Aplikacja działa w przeglądarce na telefonie i komputerze.
- Można zainstalować ją jako PWA.
- Interfejs jest responsywny.
- Nauka działa offline po wcześniejszym przygotowaniu danych na urządzeniu.
- Pierwsze logowanie i pobranie danych wymagają internetu.
- Dokładne zasady przygotowania zestawów do pracy offline zostaną dopracowane w projekcie technicznym.

## 5. Konta

### Konto użytkownika

- Rejestracja i logowanie przez e-mail i hasło.
- Reset zapomnianego hasła.
- Prywatne zestawy i postępy.
- Synchronizacja między urządzeniami.
- Własne zestawy i import wymagają konta.

### Proponowane zasady sesji i wylogowania

- Wygaśnięcie sesji nie usuwa odpowiedzi oczekujących na wysłanie.
- Synchronizacja czeka na ponowne uwierzytelnienie.
- Przy wylogowaniu z niewysłanymi zmianami aplikacja pokazuje ich stan i pozwala najpierw wykonać synchronizację.
- Dane jednego konta nie mogą być widoczne na innym koncie.
- Dokładna polityka przechowywania danych lokalnych po wylogowaniu pozostaje do ustalenia.

## 6. Zestawy

- Płaska lista nazwanych zestawów.
- Wyszukiwanie zestawów.
- Dodawanie, edytowanie i usuwanie zestawu.
- Przeglądanie i edytowanie jego fiszek.
- Import do nowego lub istniejącego zestawu.
- Eksport treści zestawu.
- Wybór kierunku nauki osobno dla każdego zestawu.

Propozycja: usunięcie zestawu wymaga potwierdzenia i obejmuje jego fiszki oraz powiązane postępy.

## 7. Model fiszki

Fiszka zawiera:

| Pole | Wymagane | Przykład |
|---|---|---|
| Strona A | Tak | apple |
| Strona B | Tak | jabłko |
| Przykład A | Nie | I eat an apple. |
| Przykład B | Nie | Jem jabłko. |

Treść nie jest ograniczona do języków. Strony mogą zawierać dowolne pytanie i odpowiedź.

### Kierunki nauki

Dla zestawu wybieramy:

- A → B.
- B → A.
- Tryb mieszany.

Jedna fiszka ma jedną treść, ale może mieć dwa niezależne postępy nauki — osobno dla każdego kierunku.

### Proponowane zasady

- Przykład pojawia się po odsłonięciu odpowiedzi i odpowiada stronie odpowiedzi.
- Zmiana kierunku zestawu nie kasuje dotychczasowego postępu.
- Drobna korekta tekstu zachowuje postęp.
- Przy zmianie znaczenia fiszki użytkownik może zresetować jej naukę.

## 8. Import CSV

CSV jest podstawowym formatem masowego dodawania treści.

### Format

Cztery kolumny:

- Strona A.
- Strona B.
- Przykład A.
- Przykład B.

Przykłady są opcjonalne.

Dokładne nagłówki, kodowanie, separatory i zasady obsługi pustych wartości zostaną opisane w specyfikacji importu.

### Pomoc dla użytkownika

Aplikacja udostępnia:

- Instrukcję przygotowania pliku.
- Plik wzorcowy.
- Przykłady poprawnych danych.
- Informację o obsługiwanym formacie.
- Czytelne komunikaty o błędach.

### Przebieg

1. Wybór pliku.
2. Wybór istniejącego zestawu albo utworzenie nowego.
3. Odczyt i podgląd danych.
4. Weryfikacja błędów, duplikatów i konfliktów.
5. Rozstrzygnięcie problemów.
6. Podsumowanie i zatwierdzenie.
7. Zapis zaakceptowanych danych.

### Duplikaty i konflikty

Rozróżniamy:

- Identyczne wpisy.
- Takie samo pytanie z inną odpowiedzią.
- Różnice w przykładach.
- Niekompletne lub niepoprawne wiersze.
- Duplikaty w pliku oraz pomiędzy plikiem i zestawem.

Użytkownik ma możliwość zbiorczego pominięcia identycznych duplikatów.

Propozycja: akcję nazywamy „Pomiń duplikaty”, aby nie sugerować usuwania istniejących fiszek i ich postępów.

Inna odpowiedź na takie samo pytanie nie jest automatycznie uznawana za błąd. Może stanowić osobną, prawidłową fiszkę.

Import nie usuwa automatycznie wcześniejszych treści i nie resetuje istniejących postępów.

Ponowienie przerwanego importu nie może tworzyć kolejnych kopii tych samych zapisanych operacji.

## 9. Eksport CSV

- Eksport obejmuje treść fiszek i przykłady.
- Nie obejmuje postępów ani ustawień.
- Plik można przekazać innej osobie.
- Wyeksportowany plik powinien nadawać się do ponownego importu.
- Zachowane muszą zostać polskie znaki, znaki specjalne, przykłady i tekst wielowierszowy zgodnie z obsługiwanym formatem.

## 10. Przebieg treningu

1. Użytkownik wybiera zestaw.
2. Aplikacja dobiera fiszkę i kierunek.
3. Pokazuje pytanie.
4. Użytkownik przypomina sobie odpowiedź.
5. Odsłania drugą stronę.
6. Wybiera ocenę.
7. Aplikacja zapisuje odpowiedź lokalnie.
8. Pokazuje kolejną fiszkę.

Trening nie czeka na połączenie z serwerem przy każdej odpowiedzi.

Można zakończyć naukę w dowolnym momencie. Nie ma konieczności zatwierdzania całej sesji.

### Skala ocen

| Ocena | Znaczenie |
|---|---|
| Nie pamiętam | Brak odpowiedzi lub odpowiedź błędna |
| Trudno | Poprawna odpowiedź przypomniana z dużym wysiłkiem |
| Dobrze | Poprawna odpowiedź po zwykłym namyśle |
| Łatwo | Poprawna odpowiedź przypomniana od razu |

### Proponowane zabezpieczenia treningu

- Odwrotny kierunek tej samej fiszki nie pojawia się natychmiast po odsłonięciu odpowiedzi.
- Podwójne kliknięcie oceny nie zapisuje dwóch odpowiedzi.
- Błąd lokalnego zapisu zatrzymuje przejście i pozwala ponowić zapis.
- Synchronizacja w tle nie zmienia nagle rozpoczętej fiszki.
- Ponowienie zapisu nie oblicza niezależnie kolejnego wyniku dla tej samej odpowiedzi.

## 11. Mechanizm powtórek

Jeden mechanizm obsługuje zaplanowane powtórki i dalszą naukę.

Wewnętrznie rozróżniamy:

1. Pierwsze poznanie materiału.
2. Powtórkę po upływie zaplanowanego czasu.
3. Dodatkowe ćwiczenie przed kolejnym terminem.

### Wymagania

- Każdy kierunek fiszki ma własny postęp i termin.
- Ocena wpływa na dalszą naukę.
- Mechanizm uwzględnia czas od wcześniejszych odpowiedzi.
- Wielokrotne poprawne odpowiedzi w krótkim czasie nie mogą sztucznie odsuwać terminu daleko w przyszłość.
- Dodatkowe ćwiczenie nie jest traktowane jak kilka odległych w czasie powtórek.
- Algorytm kolejnego terminu i dobór kolejnej fiszki w sesji są osobnymi elementami.

### Nowe fiszki

- Wprowadzane stopniowo.
- Użytkownik ustawia dzienny limit.
- Może świadomie dobrać więcej.

Propozycje:

- Limit dotyczy liczby fiszek poznawanych pierwszy raz.
- Ponowne odpowiedzi nie zużywają kolejnych jednostek limitu.
- Dwa kierunki jednej fiszki nie zużywają dwóch jednostek limitu.
- Przekroczenie limitu nowych fiszek wymaga decyzji użytkownika.

### Po wykonaniu powtórek na dziś

- Pojawia się dyskretna informacja o wykonaniu bieżącego planu.
- Nauka nie jest przerywana.
- Aplikacja kontynuuje dobieranie materiału zgodnie z zasadami dodatkowego ćwiczenia i limitem nowych fiszek.

### Proponowane zachowanie po błędzie

- Fiszka oceniona jako „Nie pamiętam” wraca w bieżącej nauce, w miarę możliwości po innych fiszkach.
- Błąd podczas dodatkowego ćwiczenia również wpływa na planowanie.
- Bardzo mały zestaw nadal można ćwiczyć, ale szybkie powtórzenia nie są traktowane jako dowód trwałego opanowania.

Konkretny algorytm i parametry wybieramy po porównaniu istniejących rozwiązań. Nie ustalamy przypadkowych mnożników ani odstępów.

## 12. Interfejs

### Domyślny trening

- Jedna fiszka na ekranie.
- Przycisk odsłonięcia odpowiedzi.
- Cztery oceny po odsłonięciu.
- Potrzebne komunikaty.
- Bez zegara.
- Bez punktacji.
- Bez rozbudowanych statystyk.

### Opcjonalne informacje

Użytkownik może osobno włączyć:

- Liczbę powtórek pozostałych na dziś.
- Liczbę fiszek przećwiczonych w bieżącej sesji.

Dokładna definicja licznika sesji — odpowiedzi czy unikalne fiszki — pozostaje do doprecyzowania.

### Planowane widoki

- Rejestracja i logowanie.
- Reset hasła.
- Lista zestawów.
- Zawartość zestawu.
- Edycja fiszki.
- Import i rozstrzyganie konfliktów.
- Trening.
- Ustawienia.

Propozycja: przy zestawach pokazujemy dyskretny stan synchronizacji i dostępność offline.

Interfejs powinien uwzględniać dostępność, obsługę klawiaturą, widoczny fokus i wygodne przyciski dotykowe.

## 13. Stack technologiczny

| Obszar | Technologia |
|---|---|
| Framework aplikacji | Next.js |
| Interfejs | React |
| Język | TypeScript |
| Style | CSS |
| Własne API | Next.js Route Handlers |
| Baza danych | PostgreSQL w Supabase |
| Uwierzytelnianie | Supabase Auth |
| Integracja z Supabase | supabase-js |
| Kontrola dostępu | Uprawnienia bazy i RLS |
| Operacje transakcyjne | Funkcje PostgreSQL |
| Dane lokalne | IndexedDB |
| Instalacja i offline | Manifest PWA i service worker |
| Hosting | Cloudflare |
| Planowane środowisko części serwerowej | Cloudflare Workers |

Next.js zastępuje wcześniejszy wybór Vite.

`vite-plugin-pwa` nie jest już elementem planowanego stacku. Narzędzia PWA należy dobrać do Next.js.

Nie planujemy osobnego serwera Express ani NestJS.

Konkretna integracja wdrożeniowa Cloudflare oraz zgodne wersje zależności wymagają sprawdzenia przed implementacją.

## 14. Podział odpowiedzialności

### Interfejs

Odpowiada za wyświetlanie danych, interakcje i komunikaty.

### Logika nauki

Odpowiada za interpretację oceny, dobór materiału, planowanie i przejścia treningu.

Powinna być niezależna od komponentów React oraz szczegółów transportu danych.

### Zapis lokalny

Odpowiada za:

- Fiszki dostępne na urządzeniu.
- Postępy.
- Historię odpowiedzi.
- Kolejkę oczekujących zmian.
- Wersjonowanie i migracje danych lokalnych.

### API Next.js

Odpowiada za:

- Weryfikację tożsamości.
- Walidację danych wejściowych.
- Operacje dotyczące danych aplikacji.
- Koordynowanie synchronizacji.
- Wywołanie odpowiednich operacji bazodanowych.

Propozycja: zapisy danych aplikacji przechodzą przez jedną warstwę API, zamiast równoległego utrzymywania zapisów bezpośrednich z przeglądarki i osobnej logiki w API.

### PostgreSQL i Supabase

Odpowiadają za:

- Trwałe dane w chmurze.
- Uwierzytelnianie przez Supabase Auth.
- Ograniczenia i relacje danych.
- RLS i uprawnienia.
- Transakcje wymagające wspólnego zapisu kilku elementów.

Klucze administracyjne nie trafiają do przeglądarki.

## 15. Model danych do zaprojektowania

Należy rozdzielić:

- Konto i ustawienia użytkownika.
- Zestawy.
- Treść fiszek.
- Postęp nauki dla każdego kierunku.
- Historię odpowiedzi.
- Operacje oczekujące na synchronizację.
- Informacje potrzebne do synchronizacji zmian i usunięć.

Historia odpowiedzi nie powinna być zastępowana wyłącznie aktualnym terminem powtórki.

Szczegółowy schemat tabel, indeksów, ograniczeń i wersjonowania powstaje w projekcie technicznym.

## 16. Offline i synchronizacja

Synchronizację projektujemy przed budowaniem pełnego treningu.

Podstawowy przepływ:

> Trening → zapis lokalny w IndexedDB → kolejka zmian → API → PostgreSQL.

### Zasady

- Nie wysyłamy całego stanu urządzenia jako bezwarunkowego nadpisania chmury.
- Każda operacja ma jednoznaczny identyfikator.
- Ponowienie nie dubluje jej efektu.
- Zapis oceny, historii i wynikającego postępu musi być spójny.
- Starsze urządzenie nie nadpisuje bezwarunkowo nowszych danych.
- Usunięte fiszki nie wracają po synchronizacji.
- Edycja treści i zmiana postępu mają osobne reguły konfliktów.
- Odpowiedzi z kilku urządzeń są zachowane.
- Sposób wyliczenia wspólnego postępu jest jednoznaczny.
- Zmiany schematu lokalnego i chmurowego wymagają migracji.
- Uzgodnienie danych z serwerem nie przerywa rozpoczętej fiszki.

### Scenariusze wymagające projektu

- Edycja tej samej fiszki na dwóch urządzeniach.
- Nauka tego samego kierunku offline na dwóch urządzeniach.
- Usunięcie fiszki na jednym urządzeniu i odpowiedź na drugim.
- Wygaśnięcie sesji przed synchronizacją.
- Wylogowanie z niewysłanymi zmianami.
- Błędny zegar urządzenia i różne strefy czasowe.
- Wznowienie przerwanej synchronizacji.
- Aktualizacja aplikacji przy istniejących danych lokalnych.

## 17. Skille i instrukcje dla AI

Przed implementacją należy:

1. Uzyskać dostęp do repozytorium:
   https://github.com/PiotrO9/next-frontend-starter
2. Przejrzeć dostępne skille i instrukcje.
3. Wybrać pasujące do:
   - Next.js.
   - Reacta i TypeScriptu.
   - Supabase i PostgreSQL.
   - Testów.
   - Dostępności.
   - Cloudflare.
4. Usunąć sprzeczności i dublujące się zasady.
5. Dopisać wymagania specyficzne dla fiszek, offline i synchronizacji.
6. Przygotować projektowe `AGENTS.md`.
7. Wskazać jednoznacznie Rachmistrza jako referencję UI i zachowania.

Nie zakładamy przejęcia wszystkich skilli ani całej konfiguracji startera.

## 18. Kolejność realizacji

### Etap 1 — przygotowanie

- Przegląd Rachmistrza.
- Przegląd startera.
- Wybór skilli.
- Instrukcje projektu.
- Potwierdzenie zakresu pierwszej wersji.

### Etap 2 — projekt mechanizmów

- Model danych.
- Kontrakt API.
- Algorytm powtórek.
- Zasady kolejki treningu.
- Specyfikacja CSV i konfliktów.
- Protokół synchronizacji.
- Reguły danych offline i kont.
- Szkice ekranów zgodne z Rachmistrzem.

### Etap 3 — próba techniczna całego przepływu

- Next.js uruchomiony na Cloudflare.
- Logowanie przez Supabase Auth.
- Jedna przykładowa fiszka.
- Zapis odpowiedzi lokalnie.
- Nauka offline.
- Synchronizacja z bazą.
- Odczyt postępu na drugim urządzeniu.
- Sprawdzenie dostępu do danych użytkowników.

Celem jest wczesna weryfikacja połączenia Next.js, Cloudflare, Supabase i offline.

### Etap 4 — pełna obsługa treści

- Zestawy.
- Edytor fiszek.
- Import CSV.
- Duplikaty i konflikty.
- Eksport CSV.

### Etap 5 — pełny trening

- Kierunki nauki.
- Cztery oceny.
- Terminy powtórek.
- Limity nowych fiszek.
- Dodatkowe ćwiczenie.
- Nieprzerwany trening.
- Obsługa błędów zapisu.

### Etap 6 — dopracowanie produktu

- Ustawienia.
- Opcjonalne liczniki.
- Responsywność i dostępność.
- Komunikaty synchronizacji.
- Instalacja PWA.
- Obsługa aktualizacji aplikacji.

### Etap 7 — weryfikacja i wydanie

- Testy jednostkowe, integracyjne i przeglądarkowe odpowiednie do ryzyka.
- Testy wielourządzeniowe.
- Testy offline na produkcyjnym buildzie.
- Kontrola prywatności danych.
- Weryfikacja wdrożenia Cloudflare.
- Dokumentacja uruchomienia i wdrożenia.

## 19. Zasady weryfikacji

- W logice nauki wstrzykujemy datę, źródło losowości i repozytorium.
- Testy lokalnej bazy mają odseparowane dane.
- Testujemy rzeczywiste scenariusze awarii i ponowień.
- Testy przeglądarkowe wykonujemy bez automatycznego otwierania widocznych okien i przejmowania fokusu.
- Offline sprawdzamy na buildzie produkcyjnym.
- Narzędzia i komendy testowe dobieramy do nowego projektu Next.js.
- Nie kopiujemy bez sprawdzenia komend weryfikacyjnych z Rachmistrza.

## 20. Kryteria gotowości pierwszej wersji

Pierwsza wersja jest gotowa, gdy:

- Użytkownik potrafi samodzielnie założyć konto i zresetować hasło.
- Strona startowa prowadzi do logowania lub prywatnych zestawów.
- Można utworzyć zestaw ręcznie i zaimportować CSV.
- Niepoprawny import daje czytelne informacje.
- Duplikaty można zbiorczo pominąć.
- Import nie usuwa niejawnie istniejących treści i postępów.
- Eksport i ponowny import zachowują treść.
- Oba kierunki mają niezależne postępy.
- Krótka i długa sesja zapisują każdą ocenę.
- Wykonanie dzisiejszego planu nie zatrzymuje treningu.
- Szybkie powtarzanie nie zawyża sztucznie opanowania.
- Odświeżenie i zamknięcie aplikacji nie gubią zapisanych odpowiedzi.
- Nauka działa bez internetu na przygotowanym urządzeniu.
- Ponowienie synchronizacji nie dubluje danych.
- Praca na dwóch urządzeniach obejmuje poprawną obsługę nauki, edycji i usunięć.
- Użytkownik nie ma dostępu do cudzych danych.
- PWA i offline działają na wdrożeniu produkcyjnym.
- UI zachowuje styl i prostotę Rachmistrza.

## 21. Pozostałe decyzje

### Produktowe

- Moment wyświetlania przykładów.
- Zasady resetowania postępu po zmianie treści.
- Dokładna interpretacja limitu nowych fiszek.
- Definicja licznika fiszek w sesji.
- Zachowanie lokalnych danych po wylogowaniu.
- Szczegóły konfliktów importu.
- Nazwa aplikacji, domena i ewentualne różnice wizualne względem Rachmistrza.

### Techniczne

- Algorytm powtórek i jego parametry.
- Domyślna liczba nowych fiszek.
- Reguły kolejki po wykonaniu dzisiejszych powtórek.
- Schemat bazy i migracji.
- Szczegółowy protokół synchronizacji.
- Zasady rozstrzygania konfliktów wielourządzeniowych.
- Biblioteki do IndexedDB, CSV i PWA.
- Narzędzia testowe.
- Integracja wdrożeniowa Next.js z Cloudflare.
- Konkretne skille ze startera.

Zakres produktu i główny stack są ustalone. Otwarte szczegóły należy domknąć w projekcie technicznym przed implementacją zależnych od nich mechanizmów.