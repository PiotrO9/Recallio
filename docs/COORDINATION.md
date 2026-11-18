# Koordynacja niezależnych czatów

Rejestr działa dla worktree tego samego lokalnego repozytorium, poprzez katalog `.git/recallio-coordination`. Nie jest synchronizowany przez Git ani między komputerami/klonami. Wszyscy agenci muszą korzystać z tej samej wersji skryptu i jednego katalogu wspólnego Git. Jest to mechanizm współpracy, nie granica bezpieczeństwa przed złośliwym procesem lokalnym. Użyj unikalnej nazwy właściciela. Nie commituj rejestru, tokenów ani .env.

## Praca agenta

Z głównego checkoutu na zintegrowanym branchu:

```powershell
node scripts/coordinate.mjs status
node scripts/coordinate.mjs claim --owner agent-nazwa
```

Można wskazać `--id CORE-01`, a bez ID skrypt wybierze pierwsze gotowe zadanie. Wynik zawiera ID, `base` i token. Kopiuj token do własnego kontekstu, nie do commitów. Przy blokadzie rejestru ponów; `claim` nie wybiera zadań z niespełnionymi zależnościami. W danym momencie właściciel może mieć tylko jedno aktywne zadanie.

Utwórz osobny branch/worktree od `base` i zarejestruj go:

```powershell
git worktree add -b agent-NAZWA D:/CODE/Recallio-NAZWA <base>
node scripts/coordinate.mjs attach --id <ID> --owner agent-nazwa --token <token> --branch agent-NAZWA --worktree D:/CODE/Recallio-NAZWA
```

W nowym worktree wykonuj wyłącznie zakres z backlogu. Jest to osobna kopia; `.env` i `node_modules` nie są automatycznie współdzielone. Jeśli task potrzebuje pakietów, `npm ci`. Nie kopiuj sekretów do repo. Po wykonaniu testów zapisz raport, np. `docs/handoffs/<ID>.md` (ID unikalne). Uwzględnij zakres, wynik komend, ograniczenia, bazowy commit i skutki dla integracji. Wykonaj lokalny commit i zgłoś jego **pełny hash**:

```powershell
node scripts/coordinate.mjs review --id <ID> --owner agent-nazwa --token <token> --commit <pelny-hash> --report docs/handoffs/<ID>.md
```

Skrypt nie sprawdza istnienia worktree, raportu ani zgodności zakresu; odpowiada za to agent i integrator. Oznaczenie REVIEW nie oznacza integracji ani zaliczenia testów.

Zablokowanie i wznowienie: `block --id <ID> --owner <nazwa> --token <token> --reason <powod>` oraz `resume` z tymi samymi ID, owner i token. Gdy agent świadomie rezygnuje przed REVIEW, `release` z tymi parametrami zwalnia zadanie; istniejący worktree i pliki nie są usuwane.

Jeśli przegląd wykazał potrzebę poprawek, właściciel wraca do pracy przez `rework --id <ID> --owner <nazwa> --token <token> --commit <pełny-hash-aktualnego-review>`. Polecenie atomowo sprawdza właściciela, token i zgłoszony commit, zachowuje poprzednie przekazanie oraz usuwa bieżący commit i raport z aktywnego zgłoszenia. Po poprawkach właściciel wykonuje nowy commit i ponownie zgłasza go przez `review`. Nie stosuj tego przejścia po integracji lub statusie DONE.

## Integrator

Integrator przegląda raport i commit, uruchamia testy i integruje commit zwykłym merge (bez squash/cherry-pick, aby zachować tożsamość commita). Po sprawdzeniu na docelowym branchu:

```powershell
node scripts/coordinate.mjs done --id <ID> --commit <pelny-hash-commita-agenta>
```

`done` sprawdza REVIEW i czy wskazany commit jest przodkiem bieżącego HEAD. To kontrola techniczna, nie zastępuje przeglądu ani testów. Agent nie wykonuje `done` samodzielnie. `CORE-01` musi zostać zintegrowane przed startem pozostałych zadań. Jedna osoba/agent zarządza wspólnymi zmianami i zdalną bazą.

## Awaria

Skrypt używa atomowego utworzenia katalogu blokady i wymiany pliku rejestru. Nie stosuje automatycznego timeoutu. Jeżeli proces został przerwany podczas operacji, katalog `registry.lock` może pozostać. Tylko integrator po upewnieniu się, że żaden proces koordynatora nie działa, może ręcznie usunąć wyłącznie ten katalog z `.git/recallio-coordination`. Najpierw zachowaj kopię rejestru i sprawdź jego stan. Nie usuwaj `registry.json` i nie zwalniaj cudzej rezerwacji na podstawie czasu. Uszkodzony rejestr zatrzymuje skrypt zamiast go nadpisać.

Rezerwacja trwa przez restart. Jeśli właściciel straci token lub zniknie, integrator najpierw ustala stan jego pracy i dopiero potem podejmuje ręczną naprawę rejestru z kopią zapasową, przy zatrzymanych agentach. Nie rób tego automatycznie.
