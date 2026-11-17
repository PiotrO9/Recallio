# LEARN-01 — przekazanie do przeglądu

Status: REVIEW po zgłoszeniu; właściciel `codex-learn-20261117`; baza `542c53c59c4476706986aeeddb9032d983fb28dc`; branch `codex/learn-01`; worktree `D:/CODE/Recallio-learn-01`. Zależność CORE-01 DONE w rejestrze; kontrakt z bazy 542c53c.

Zakres: propozycja FSRS-6 i osłony ćwiczeń w `docs/decisions/learning-scheduler.md`; scenariusze i wartości referencyjne w `tests/fixtures/learning/fsrs6-v1.json`. Nie implementowano produkcyjnego schedulera, UI, przechowywania ani synchronizacji. Nie zmieniano wspólnych kontraktów, package.json ani lockfile.

Weryfikacja: `npm ci`, `npm run typecheck`, `npm test` (14 testów istniejącego projektu), `npm run build` — powodzenie. Dodatkowy eksperyment na Node 22.12 z `ts-fsrs@5.4.2` zainstalowanym poza repo: asercje dla pierwszej oceny, oceny w terminie, po 10 dniach i błędu przed terminem potwierdziły liczby w fixture. Pozostałe przypadki fixture są specyfikacją oczekiwanego zachowania adaptera, nie wykonanym testem jego implementacji.

Integrator: zatwierdzić ADR, w tym semantykę practice i kolejność zdarzeń; przed LEARN-02 uzgodnić przypięcie `ts-fsrs@5.4.2` oraz lockfile, sprawdzić kompatybilność browser/Workers i kontrakt przechowywania/pull pełnych danych zdarzeń i stanu. Oddzielić `lastEffectiveAt` projekcji od `last_review` modelu. Domyślny limit i zmiana strefy nadal wymagają decyzji produktu. Sprawdzić migrację i nową wersję profilu przy zmianie parametrów. `LEARN-02` może ruszyć po integracji oraz oznaczeniu LEARN-01 jako DONE przez integratora, nie po samym REVIEW.

Ograniczenia: brak implementacji, testów wielourządzeniowych, browser bundle, Workers i środowiska chmurowego; brak danych użytkowników potwierdzających efektywność. Zmiany algorytmu lub parametrów wymagają osobnego przeglądu i migracji stanu.
