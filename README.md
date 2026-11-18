# Recallio

Aplikacja do nauki fiszek. Pierwszy lokalny szkielet, nie gotowa wersja MVP.

## Uruchomienie

Wymagania: Node.js >=22.12, npm. Bez kont, kluczy i usług zewnętrznych.

```sh
npm ci
npm run dev
```

Otwórz http://localhost:3000. Produkcja lokalna: `npm run build`, potem `npm start`.

## Przygotowanie połączenia Supabase

Wzór `.env.example` opisuje wymagane wartości i miejsca, z których je skopiować.
Utwórz jego kopię jako `.env.local` (nie nadpisuj istniejącej konfiguracji),
a następnie uzupełnij `NEXT_PUBLIC_SUPABASE_URL` oraz
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` danymi swojego projektu.
`.env.local` jest ignorowany przez Git.

Obecne demo nie używa jeszcze tych zmiennych. Po ich uzupełnieniu można
zaimplementować integrację. Do tworzenia tabel i migracji agent potrzebuje
osobno autoryzowanego połączenia Supabase MCP, ograniczonego do tego projektu.
Nie umieszczaj w publicznych zmiennych klucza secret/service_role ani hasła bazy.

## Co już działa

- Next.js App Router, React, TypeScript i zwykły CSS.
- Polski, responsywny ekran w stylistyce Rachmistrza.
- Gotowy zestaw sześciu fiszek, wybór A → B lub B → A przed rozpoczęciem.
- Odsłanianie odpowiedzi i przykładu, cztery oceny, ciągła kolejka demonstracyjna.
- Historia ocen w IndexedDB; odświeżenie zachowuje zapisane odpowiedzi.
- Ochrona przed ponowionym zapisem tego samego zdarzenia; błąd zapisu zatrzymuje fiszkę.
- Testy domeny/zapisu i scenariusz przeglądarkowy desktop/mobile.

Demo nie wylicza terminów, nie odtwarza pozycji sesji po odświeżeniu, nie synchronizuje danych i nie zapewnia otwarcia strony offline. IndexedDB nie jest kopią zapasową: wyczyszczenie danych witryny usuwa historię. Demo ma osobną bazę i nigdy nie migruje jej do konta.

## Dokumentacja dla kolejnych agentów

1. `AGENTS.md` — zasady pracy i granice modułów.
2. `docs/PRODUCT-BRIEF.md` — oryginalny plan użytkownika, zachowany bez zmian.
3. `docs/TECHNICAL-PLAN.md` — architektura, model danych, decyzje i etapy.
4. `docs/CONTRACTS.md` — proponowane kontrakty v1, do zamrożenia w zadaniu CORE-01.
5. `docs/AGENT-BACKLOG.md` — zadania, zależności, zakresy plików, kryteria odbioru.
6. `docs/VERIFICATION.md` — polecenia i scenariusze testowe.
7. `docs/REFERENCES.md` — przegląd Rachmistrza, startera i źródeł technicznych.

## Komendy

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

E2E startuje własny produkcyjny serwer na porcie 3210 i zamyka go po testach. Nie otwiera widocznej przeglądarki. `package-lock.json` utrwala zależności; zmienia je jeden integrator.

Najbliższa praca: CORE-01 (zamrożenie kontraktów), następnie równolegle DATA-01, LEARN-01, CSV-01 i PLATFORM-01. Żadne wdrożenie ani zasoby chmurowe nie zostały utworzone.
