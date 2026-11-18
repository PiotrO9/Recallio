---
name: recallio-queue
description: Prowadzi kolejkę zadań Recallio w jednym czacie Codexa. Użyj, gdy użytkownik zleca wykonanie lub wznowienie całej kolejki, z osobnym commitem i pushem po każdym zadaniu.
---

# Kolejka Recallio

Pracuj samodzielnie w bieżącym czacie. [TASKS.md](../../../docs/TASKS.md) przechowuje kolejność, zależności, kryteria odbioru i stan wznowienia. [AGENTS.md](../../../AGENTS.md) określa wymagania projektu i testy.

## Start lub wznowienie

1. Potwierdź zakres z polecenia użytkownika. Zlecenie serii z commitem i pushem obejmuje kolejne zadania i zapis ich blokad na wskazanym branchu. Domyślny cel to `origin/codex/recallio-queue`. Git push nie upoważnia do wdrożenia ani zmian w chmurze.
2. Sprawdź branch, upstream, status i diff, w tym staged i untracked. Sprawdź zdalną gałąź bez ujawniania danych uwierzytelnienia. Na pierwszym uruchomieniu utwórz wskazany branch od aktualnej bazy. Przy wznowieniu użyj istniejącego brancha i pliku kolejki. Przyjmij wyłącznie fast-forward, jeśli zdalny branch jest do przodu. Jeśli istnieją równoległe zmiany lub historia się rozeszła, zachowaj oba stany i ustal bezpieczny sposób kontynuacji przed kolejną publikacją.
3. Rozlicz zastane zmiany. `SETUP-01` obejmuje porządki w dokumentacji i uruchomienie procesu. Włącz takie zmiany tylko po sprawdzeniu ich zakresu oraz gdy polecenie obejmuje ten punkt startowy. Zachowaj inne zmiany użytkownika. Jeśli kolidują z wybranym zadaniem, wybierz niezależne.
4. Jeśli istnieje nieopublikowany commit poprzedniego zadania, sprawdź jego zawartość i opublikuj go przed rozpoczęciem następnego. Status w kolejce potwierdza zakres i testy. Wynik push potwierdza obecność commita na zdalnej gałęzi.

## Wybór i wykonanie

1. Wznów rozpoznane własne zadanie `IN_PROGRESS` po przerwaniu. W pozostałych przypadkach przeglądaj `TODO` w kolejności tabeli, pomijając pozycje z niespełnionymi zależnościami. Przy spełnionych zależnościach sprawdź wymagania wstępne. Gotowe zadanie oznacz lokalnie `IN_PROGRESS`. Zadanie `BLOCKED` wraca do wyboru, gdy zmienił się stan opisany w warunku wznowienia.
2. Brak wymaganego dostępu, decyzji lub środowiska odnotuj jako blokadę. Gdy część lokalna ma samodzielną wartość, wydziel małe zadanie z własnym kryterium odbioru i wykonaj je. Zaktualizuj zależności pozostałego zakresu. Zachowaj pierwotne kryteria odbioru zadania wymagającego zewnętrznego dostępu.
3. Dokończ wybrany zakres i wykonaj testy z `AGENTS.md` oraz testy kryteriów zadania. Przy niepowodzeniu ustal przyczynę, napraw ją w zakresie zadania i powtórz weryfikację. Zapisz `DONE` z krótkim wynikiem i dowodem odbioru. Sprawdź diff, dodaj do staged wyłącznie pliki zadania i kolejkę, po czym wykonaj osobny commit po angielsku w formacie Conventional Commits, np. `feat(learning): implement deterministic review scheduling`.
4. Wypchnij ten commit na wskazaną gałąź, np. `git push -u origin HEAD:refs/heads/codex/recallio-queue`. Po sukcesie od razu wróć do wyboru. Przy utracie odpowiedzi sprawdź, czy commit jest osiągalny ze zdalnej gałęzi. Przy przejściowym błędzie ponów po sprawdzeniu przyczyny. Przy trwałym błędzie publikacji zachowaj lokalny commit i podaj hash, błąd oraz warunek wznowienia. Nie używaj force-push ani nie obchodź zabezpieczeń brancha.

## Blokada zadania

Zapisz w tabeli `BLOCKED`, a pod jej spodem odnotuj ID, przyczynę z dowodem, wykonany zakres i dokładny warunek wznowienia. Gotową i zweryfikowaną część możesz dołączyć do commita tej blokady, o ile jest bezpieczna samodzielnie. Niedokończone zmiany, które łamią testy lub istniejące zachowanie, zachowaj lokalnie poza gałęzią do publikacji, np. w jasno nazwanym stashu wyłącznie z plikami zadania. Zapisz jego identyfikator. Przy braku gotowych zmian commit obejmuje tylko wpis blokady.

Wypchnij zapis blokady i przejdź do pierwszej niezależnej pozycji. Zadania zależne czekają na spełnienie swoich zależności. Brak dostępu do usługi zewnętrznej blokuje tylko prace, które jej potrzebują. Gdy trwała awaria dotyczy samej publikacji, dokończ dostępną diagnostykę i zachowaj postęp lokalnie do wznowienia cyklu commit–push.

## Koniec przebiegu

Kontynuuj po każdej udanej publikacji, dopóki istnieje gotowe zadanie. Zakończ przebieg, gdy wszystko jest ukończone albo każda pozostała pozycja ma udokumentowaną blokadę lub czeka na zablokowaną zależność. Trwałą awarię wspólnego warunku zgłoś z konkretnym stanem wznowienia. Podsumuj branch, opublikowane zadania i blokady. Przy wznowieniu zacznij od stanu Git i kolejki.
