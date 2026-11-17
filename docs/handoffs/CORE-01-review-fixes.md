# CORE-01 — poprawki po przeglądzie

Status: do przeglądu integratora. Baza: `8e018911a50616a261f99a24da1a9ec1d7632c0a`, branch `codex/core-01-review-fixes`, worktree `D:/CODE/Recallio-core-review`. Zmiany wykonano na bezpośrednie polecenie użytkownika po zamknięciu czatu pierwotnego właściciela. Rejestr nadal wskazuje jego commit i status REVIEW; nie zmieniano rezerwacji ani tokenu.

Snapshot zawiera wymagane `introductions` ze znormalizowanym dniem i czasem pierwszego wprowadzenia, w tej samej paginowanej generacji. Ocena zawiera wymagane `observedMode`, utrwalane w zdarzeniu i operacji. Testy obejmują roundtrip, nieprawidłowe i brakujące wartości.

Integracja: sprawdzić obie zmiany wraz z CORE-01, scalić tę gałąź bez squash/cherry-pick, aby oryginalny commit rejestrowy pozostał przodkiem HEAD; procedurę `done` wykonać dopiero po przeglądzie i weryfikacji. W razie potrzeby integrator uzgadnia rejestr według `docs/COORDINATION.md`. Zmiany są niekompatybilne ze starszymi fixture operacji i snapshotów, ale brak wdrożonego API i produkcyjnych danych do migracji.

LEARN-01 musi zatwierdzić deterministyczną regułę kanonicznego trybu oceny, również dla spóźnionych zdarzeń i rozbieżnych urządzeń. `observedMode` jest informacją klienta, której serwer nie może bezwarunkowo ufać. DATA/SYNC/LOCAL muszą implementować pełną spójną generację wprowadzeń i rebase outbox; same schematy tego nie weryfikują. Decyzja o zmianie strefy pozostaje otwarta. Nie testowano Supabase ani Workers.

Weryfikacja w tym worktree: `npm ci`, `npm run typecheck`, `npm test` (14 testów), `npm run build` — zakończone poprawnie. Integrator powinien powtórzyć odpowiednie testy po scaleniu.
