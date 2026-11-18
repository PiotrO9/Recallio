# LOCAL-01 — częściowe wdrożenie zaakceptowanych decyzji

Status: BLOCKED, nie REVIEW. Baza `542c53c59c4476706986aeeddb9032d983fb28dc`, branch `codex/local-01`, worktree `D:/CODE/Recallio-local-01`.

Wdrożono lokalnie schemat v4, odseparowane bazy kont, atomowy commit review i outbox, lease, snapshoty i obsługę versionchange. `readProgressVersion` odczytuje projekcję i jej lokalny licznik w jednej transakcji. `commitReviewFrom` wymaga bazowej wartości i wersji, a zapis oraz zwiększenie licznika są atomowe. Aktywacja snapshotu zmienia lokalne wersje nawet dla identycznej projekcji; stare komendy są odrzucane. Retry zapisanej komendy zwraca poprzedni receipt. Wspólny `commitReview` nadal nie niesie podstawy lokalnej i fail-closed nie obsługuje kolejnych ocen.

`acknowledge(result, commitCursor)` zapisuje pozycję potwierdzonej operacji. Retry z inną pozycją jest odrzucany; snapshot nie przełącza się, jeśli jego watermark nie obejmuje potwierdzonego kursora albo istnieje operacja o nieznanym wyniku. Potwierdzony outbox usuwany jest atomowo z przełączeniem. Migracja v3 ponownie oznacza receipt bez kursora jako niepewny, zachowując operację. Klient musi wywołać `beginSnapshot` przed żądaniem nowego snapshotu i przekazać jego generację przy pierwszej stronie.

## Decyzje zaakceptowane przez użytkownika 2026-11-18

1. Lokalny licznik projekcji jest oddzielny od rewizji serwera. Przy konflikcie bez zapisu kontroler może przygotować nową komendę z przeliczoną projekcją i oryginalnym zdarzeniem; przy błędzie lub utraconej odpowiedzi ponawia identyczną komendę.
2. Serwerowe potwierdzenie zawiera kursor commita, powtarzalny przy duplikacie; snapshot musi obejmować potwierdzone pozycje. Przy nieznanym wyniku klient ponawia operację z tym samym ID i nie przełącza snapshotu bez dowodu.

Wspólny port `PreparedReview` i schemat wyniku operacji nadal nie zawierają tych pól. Integrator musi wprowadzić zaakceptowane zmiany w `src/contracts` i `docs/CONTRACTS.md`, a następnie LOCAL-01 musi dostosować lokalną implementację. DATA/SYNC muszą wdrożyć i przetestować powtarzalny serwerowy kursor oraz spójność watermarku. Obecny lokalny adapter przyjmuje kursor oddzielnie, gdyż wspólny schemat nie dopuszcza dodatkowego pola. Nie istnieje jeszcze faktyczny klient ani serwer synchronizacji; przekazana pozycja nie stanowi sama w sobie dowodu serwerowego.

Pozostaje rzeczywisty deterministyczny rebase wszystkich typów pending operacji, repozytoria treści i ustawień, zastosowanie wyników sync, pending delete/reset i limit pamięci snapshotu. Callback rebase przyjmowany od wywołującego nie jest implementacją tego mechanizmu. Nie integrować prototypu jako gotowego LOCAL-01.

Weryfikacja 2026-11-18: typecheck, npm test, build, E2E demo, `npx tsx --test tests/storage/*.test.ts` (14) oraz `node --test tests/storage/browser.test.mjs` przeszły. Obejmuje utratę odpowiedzi, rollback zapisu receipt i wersji, migrację, konkurencję i brakujące kursory. E2E aplikacji dotyczy tylko demo; `npm test` nie obejmuje podkatalogu storage. Brak testów chmury i faktycznego sync. Nie wykonano push/wdrożenia.
