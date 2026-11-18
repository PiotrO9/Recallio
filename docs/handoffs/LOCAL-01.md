# LOCAL-01 — częściowe wykonanie, potrzebne rozstrzygnięcia integratora

Status w rejestrze: BLOCKED; nie REVIEW, nie integrować. Baza `542c53c59c4476706986aeeddb9032d983fb28dc`, branch `codex/local-01`, worktree `D:/CODE/Recallio-local-01`.

Wykonano: baza per konto; atomowy commit oceny/postępu/wprowadzenia/outbox; lease, migracja v1→v2, versionchange/blocked, etapowanie i atomowe przełączenie stron snapshotu. `commitReviewFrom` porównuje pełny stan poprzedniej projekcji w transakcji, a stary `commitReview` przy istniejącym postępie zatrzymuje zapis. Rebase nie może ożywić usuniętego zestawu ani karty, w tym karty pod usuniętym rodzicem. Snapshot treningu ukrywa karty usuniętego rodzica.

## Wymagana decyzja integratora

1. **Konflikt lokalnych ocen.** Wspólny `PreparedReview` nie zawiera lokalnej podstawy projekcji, a `docs/CONTRACTS.md` mówi, że `PreparedReview` jest niezmienny przy retry. Dwie karty mogą przygotować różne komendy wobec tej samej rewizji serwera. Prototyp wykrywa zmianę pełnej projekcji i odrzuca przestarzałą komendę. Propozycja: dodać do wspólnego portu jawną podstawę lokalną, a następnie określić, czy konflikt oznacza nową projekcję z niezmienionym `ReviewEvent`, czy atomowe przeliczenie projekcji przez wstrzyknięty scheduler w transakcji. Należy jawnie rozróżnić retry awarii (identyczny `PreparedReview`) od rozwiązania konfliktu. Nie zmieniać ID, oceny ani czasu zdarzenia. Obecny fail-closed port nie jest zgodny zachowaniem ze wspólnym interfejsem dla kolejnych ocen.
2. **Snapshot i utracone potwierdzenie.** Serwer może przyjąć pending `review.record`, a odpowiedź może zaginąć. Outbox nadal zawiera zdarzenie, lecz snapshot o późniejszym watermarku może już zawierać jego efekt. Snapshot DTO nie zawiera listy ID uwzględnionych ocen/receiptów. Ślepy rebase policzy ją ponownie. Propozycja do oceny: przed aktywacją uzyskać wynik receiptów wszystkich operacji o niepewnym wyniku i atomowo usunąć potwierdzone wraz z zastosowaniem wyników; zagwarantować relację wyników do watermarku snapshotu, a brak dowodu traktować jako zatrzymanie aktywacji. Alternatywa to jawne informacje o uwzględnionych operacjach w spójnym snapshotcie. Wybór i protokół należą do integratora/SYNC; dotychczasowy callback rebase nie dowodzi poprawności i nie może zostać użyty jako gotowy sync.

## Pozostały zakres

Rzeczywisty deterministyczny rebase pending operacji, repozytoria treści i ustawień oraz atomowe zastosowanie wyników sync, scenariusze pending delete/reset, limit pamięci snapshotu, integracja wspólnego portu i rozszerzenie skryptów testowych. Nie dodawano zależności ani nie zmieniano wspólnej konfiguracji. Test przeglądarkowy używa istniejącego transitywnego `esbuild`; integrator powinien zapewnić jego jawne wsparcie lub wybrać inny sposób bundlowania.

## Weryfikacja

`npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npx tsx --test tests/storage/*.test.ts` i `node --test tests/storage/browser.test.mjs` przeszły. Ostatni test używa dwóch kart headless Chromium i rzeczywistego IndexedDB; E2E aplikacji obejmuje tylko demo. `npm test` nie obejmuje podkatalogu tests/storage. Brak testów chmury i rzeczywistego sync. Nie wykonano push ani wdrożenia.
