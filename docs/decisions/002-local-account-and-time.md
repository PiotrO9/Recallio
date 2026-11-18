# ADR 002: konto, lokalne dane i czas

Status: projekt zasad sesji, danych lokalnych i czasu.

Wygaśnięcie sesji nie usuwa outbox. Ponowne uwierzytelnienie wznawia wysyłkę tylko dla tego samego userId. Świadome wylogowanie z pending oferuje synchronizację, anulowanie lub potwierdzone odrzucenie; po skutecznym wylogowaniu usuwa cache konta. Jeśli inne karty blokują usunięcie, aplikacja nie pokazuje danych następnemu kontu i zgłasza potrzebę zamknięcia kart.

Rejestrujemy surowy czas klienta i czas serwera. Propozycja effectiveAt = max(lastEffectiveAt, min(occurredAt, receivedAt)), porządek akceptacji serwera. Jest to kompromis zależny od kolejności dostarczenia; [decyzja o schedulerze](learning-scheduler.md) określa zachowanie algorytmu przy takiej kolejności. Reset zwiększa epoch, późny event poprzedniego epoch pozostaje w historii bez modyfikowania nowej projekcji.

Pierwsza konfiguracja nauki domyślnie ustawia 20 nowych fiszek dziennie. Użytkownik może zmienić limit w ustawieniach. Wartość 0 wyłącza wprowadzanie nowych fiszek w ramach dziennego limitu. Zapisane limity istniejących profili zachowują swoją wartość.

Serwer zapisuje nową strefę z chwilą wejścia w życie przy najbliższym resecie w dotychczasowej strefie. Do tego resetu dzień nauki i licznik zachowują dotychczasowe granice. Kolejne resety wypadają o północy w nowej strefie. Ustawienia pokazują oczekującą strefę i termin jej wejścia w życie. Przed resetem można zastąpić oczekującą zmianę albo ją anulować, wybierając obecną strefę.

Wprowadzenie zachowuje przypisany dzień historyczny. Licznik porównuje `firstEffectiveAt` z przedziałem aktualnego dnia nauki, ponieważ po przesunięciu na zachód ta sama data kalendarzowa może pojawić się po obu stronach resetu. Historia zmian strefy pozwala ustalić właściwy dzień również dla opóźnionych ocen. Zmiana oczekująca na synchronizację wchodzi do harmonogramu przy zatwierdzeniu przez serwer.
