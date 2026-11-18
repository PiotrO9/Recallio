# LOCAL-01 — przekazanie do przeglądu

Status: REVIEW, nie DONE. Właściciel `codex-local-20261117`; baza rezerwacji `542c53c59c4476706986aeeddb9032d983fb28dc`; branch `codex/local-01`, worktree `D:/CODE/Recallio-local-01`. Do branchu włączono zintegrowany `main` 9ccd4fb, obejmujący zatwierdzony LEARN-01. Commit przekazywany do przeglądu jest HEAD tego raportu.

## Co zmieniono

- Wspólne kontrakty: `PreparedReview.localVersion`, atomowy odczyt projekcji z lokalną wersją, porty treści i resetu, obowiązkowy `commitCursor` dla applied/duplicate oraz jego zakaz dla conflict/rejected. Dokument wyjaśnia retry, konflikt i watermark. Zmianę wspólnych plików wykonał ten agent na bezpośrednie polecenie użytkownika po sprawdzeniu rejestru; brak innych IN_PROGRESS. Kontrakt wymaga uwzględnienia w DATA/SYNC.
- Konto ma odrębną bazę IndexedDB v6; review i treść/reset zapisują projekcję lub rekord, outbox oraz lokalne potwierdzenie atomowo. Lokalne wersje chronią przed współbieżnym nadpisaniem; ponowienie identycznej komendy zwraca poprzedni receipt. Retry z inną treścią jest odrzucany.
- Outbox zachowuje kolejność i lease; możliwie wysłane operacje pozostają niepewne do receipt. Snapshot jest etapowany, ograniczany rozmiarem i przełączany razem z kursorem. Watermark musi obejmować pozycje receipt; potwierdzone pozycje są usuwane atomowo z przełączeniem. v2/v3/v4 są migrowane zachowawczo; stare potwierdzenia bez pozycji wymagają ponowienia.
- `createSnapshotRebaser` przetwarza oczekujące operacje treści, ustawień, oceny i resetu w kolejności. Konflikt rewizji, brak rodzica, nieznany scheduler lub brak polityki resetu zatrzymują przełączenie; tombstone nie przywraca materiału. Obliczanie projekcji oceny i resetu wstrzykuje przyszły silnik LEARN-02. Epocha starszej oceny nie wpływa na nowy postęp.
- `npm test` obejmuje testy storage; `npm run test:storage:browser` używa headless Chromium i jawnie przypiętego esbuild. Nie podłączono repozytorium do UI.

## Weryfikacja

Po `npm ci`: `npm run typecheck`, `npm test` (39 testów TS oraz 2 koordynacji), `npm run test:storage:browser` (Chromium), `npm run build` i `npm run test:e2e` (4 demo) przeszły. Testy obejmują awarie zapisów i migracji, retry, dwie karty i konta, snapshot, niepewne receipty, stale watermark, rebase i reset. E2E dotyczy demo. Brak rzeczywistego serwera synchronizacji, Supabase i Workers; żadne testy chmurowe nie były wykonywane.

## Uwagi dla integracji

- Należy przejrzeć nowy wspólny kontrakt oraz migracje i wykonać zwykły merge z zachowaniem commita, bez cherry-pick. Nie wykonywać `done` przed przeglądem i testami w integracji.
- LEARN-02 musi dostarczyć rzeczywisty wersjonowany scheduler oraz politykę resetu zgodną z FSRS; testy tutaj wstrzykują deterministyczne odpowiedniki, nie dowodzą poprawności FSRS. Wymagane golden fixtures LEARN-01 i testy Node/browser/Workers pozostają w LEARN-02.
- DATA/SYNC muszą zapewnić atomowy i powtarzalny cursor receipt, spójny watermark snapshotu, retry bez utraty danych oraz prawdziwą autoryzację. Przed wysyłką należy uszeregować zależne operacje; przy rebase rewizji treści lokalny adapter bezpiecznie zatrzymuje konflikt i nie rozstrzyga go automatycznie. Należy ocenić scenariusz kolejnych zmian tej samej encji przed pierwszym potwierdzeniem.
- Limit 32 MiB dotyczy pojedynczej etapowanej generacji; nie jest limitem surowej odpowiedzi HTTP ani łącznym limitem wielu generacji. Transport i PWA muszą obsłużyć quota i sprzątanie. Callback rebase i polityki scheduler/reset są zaufanymi portami; aplikacja musi używać zatwierdzonej implementacji.
- Bez rzeczywistych DATA/AUTH/SYNC/LEARN nie nazywać tego pełnym offline ani gotową aplikacją. Brak push i wdrożenia.
