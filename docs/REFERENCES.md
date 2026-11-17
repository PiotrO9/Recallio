# Referencje i wybrane wzorce

Przegląd: 2026-11-17.

## Rachmistrz

Odczyt lokalny `D:/CODE/rachmistrz`: src/styles/tokens.css, base.css, training.css i src/training/controller.ts; przegląd struktury domain/persistence/features.

Przeniesione wzorce: Manrope Variable dostarczany lokalnie przez pakiet fontsource; tło #f6f5ef, tekst #293c33, powierzchnia #fffefa, akcent #d9ef8b; oszczędny trening, widoczny fokus, reduced-motion. Rozdział domeny i persistence oraz stała komenda przy retry. Nie przeniesiono generatorów zadań matematycznych ani logiki wyników. Nie wykonywano pełnego audytu wizualnego Rachmistrza w przeglądarce.

## Next Frontend Starter

Repozytorium: https://github.com/PiotrO9/next-frontend-starter
Zweryfikowany HEAD: `be63b4eea189bd59c16c27754a02903417ea4896`. Publiczna strona zwracała 404, ale `git ls-remote` i shallow clone przez lokalną konfigurację Git zadziałały. Przegląd wykonany w katalogu tymczasowym, bez modyfikowania oryginału.

Przeczytano package.json, AGENTS.md oraz skille nextjs-app-router, react-best-practices, testing-react-next. Przyjęto: Node 22.12+, npm, App Router, wąska granica client, odczyt storage po hydration, build produkcyjny i headless E2E. Nie kopiowano skilli ani ich komend 1:1: starter dotyczy również commerce, demo auth, PL/EN i Tailwind, których tutaj nie ma. Zasady pasujące do Recallio zapisano w projektowym AGENTS.md. Test runner fundamentu to node:test przez tsx, bez potrzeby Vitest/jsdom na tym etapie. Rozbudowa o testy komponentów wymaga osobnej decyzji.

## Dokumentacja zewnętrzna

- Next.js instalacja: https://nextjs.org/docs/app/getting-started/installation
- Cloudflare / Next.js: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- OpenNext: https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase changelog: https://supabase.com/changelog.md

W chwili przeglądu Cloudflare rekomenduje vinext dla nowych aplikacji. To nie jest powód automatycznej zmiany ustalonego stacku. PLATFORM-01 ma zweryfikować integrację i zapisać ADR. Żaden adapter nie został jeszcze zainstalowany ani sprawdzony na Workers. Next.js 16.4.6 i React 19.3.1 potwierdzono również w npm i starterze.

Supabase: przeczytano skill supabase i aktualny changelog oraz dokument RLS. Nie wykonano konfiguracji Supabase, migracji SQL ani implementacji Auth. Szczegóły SDK, CLI i grantów muszą być ponownie zweryfikowane przy implementacji DATA/AUTH.
