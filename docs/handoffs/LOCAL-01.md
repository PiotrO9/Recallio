# LOCAL-01 — praca w toku

Status: IN_PROGRESS, nie REVIEW. Baza `542c53c59c4476706986aeeddb9032d983fb28dc`, branch `codex/local-01`, worktree `D:/CODE/Recallio-local-01`.

Poprzednią blokadę dotyczącą współbieżności adresuje lokalne compare-and-swap: `readProgress` odczytuje pełną projekcję, a `commitReviewFrom(command, expected)` porównuje ją z aktualnym stanem w transakcji zapisu. Gdy stan się zmienił, zapis nie zachodzi: wywołujący odczytuje stan, przelicza projekcję i ponawia to samo zdarzenie z tym samym ID. Test obejmuje dwie różne równoczesne oceny przy identycznej rewizji serwera i ponowienie przegranej. To porównanie całej wartości projekcji, nie nowy znacznik lokalnej wersji.

Do integratora: wspólny `LearningRepository.commitReview` nie przekazuje podstawy projekcji. Aby uniknąć cichego nadpisania, prototyp tej metody akceptuje tylko zapis przy braku poprzedniego postępu oraz retry już zapisanego zdarzenia; kolejne oceny wymagają lokalnego rozszerzenia `readProgress`/`commitReviewFrom`. Zintegrować odpowiednik tego kontraktu z kontrolerem i wspólnym portem lub uzgodnić równoważną metodę atomowego przeliczania. Obecna implementacja nie jest zamiennikiem zgodnym zachowaniem dla wszystkich wywołań istniejącego wspólnego portu i nie jest podłączona do aplikacji.

Repozytorium ma oddzielną bazę na konto, atomowy zapis oceny/postępu/wprowadzenia/outbox, dzierżawy, migrację prototypowej bazy v1 do v2, callbacki blokady, zamykanie przy versionchange i etapowanie stron snapshotu z atomowym przełączeniem. Rebase jest wstrzykiwanym portem, nie pełnym mechanizmem sync.

Pozostaje przed REVIEW: rzeczywisty deterministyczny rebase oczekujących operacji; repozytoria zmian treści i ustawień oraz atomiczne zastosowanie wyników sync; scenariusze snapshotu z pending delete/reset i tombstone rodzica; test rzeczywistego IndexedDB w przeglądarce i limit pamięci etapowania. Wymagane zmiany wspólnego portu i polecenia testowego przekazać integratorowi. Nie integrować prototypu w obecnym stanie.

Weryfikacja 2026-11-18: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` oraz osobne `npx tsx --test tests/storage/*.test.ts` przeszły. E2E dotyczy wyłącznie demo; `npm test` nie obejmuje podkatalogu testów storage. Nie wykonano testów chmury ani rzeczywistego sync. Brak push i wdrożenia.
