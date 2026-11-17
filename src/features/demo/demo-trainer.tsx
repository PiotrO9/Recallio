"use client";
import { useEffect, useRef, useState } from "react";
import {
  nextIndex,
  presentCard,
  type Direction,
  type Rating,
  type Review,
} from "@/domain/cards";
import { createDemoRepository } from "@/storage/demo-repository";
import { demoCards } from "./cards";
const repository = createDemoRepository();
const ratings: { value: Rating; label: string }[] = [
  { value: 1, label: "Nie pamiętam" },
  { value: 2, label: "Trudno" },
  { value: 3, label: "Dobrze" },
  { value: 4, label: "Łatwo" },
];
export function DemoTrainer() {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>("a-b");
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const pending = useRef<Review | null>(null);
  const busy = useRef(false);
  const revealButton = useRef<HTMLButtonElement>(null);
  const firstRating = useRef<HTMLButtonElement>(null);
  const card = demoCards[index];
  const face = presentCard(card, direction);
  useEffect(() => {
    let active = true;
    repository
      .count()
      .then((value) => {
        if (active) setSaved(value);
      })
      .catch(() => {
        if (active)
          setError(
            "Nie można odczytać lokalnego zapisu. Sprawdź ustawienia przeglądarki.",
          );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (started) {
      if (revealed) firstRating.current?.focus();
      else revealButton.current?.focus();
    }
  }, [started, revealed, index]);
  async function rate(rating: Rating) {
    if (busy.current || !revealed) return;
    busy.current = true;
    setSaving(true);
    setError("");
    pending.current ??= {
      id: crypto.randomUUID(),
      cardId: card.id,
      direction,
      rating,
      answeredAt: new Date().toISOString(),
    };
    try {
      await repository.save(pending.current);
      pending.current = null;
      setSaved((value) => (value === null ? null : value + 1));
      setIndex((value) => nextIndex(value, demoCards.length));
      setRevealed(false);
    } catch {
      setError(
        "Nie udało się zapisać odpowiedzi. Ponów zapis — fiszka pozostaje na ekranie.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <header>
        <a className="brand" href="/" aria-label="Recallio — strona główna">
          <span className="brand-mark" aria-hidden="true">
            r.
          </span>{" "}
          recallio
        </a>
        <span className="badge">Wersja demonstracyjna</span>
      </header>
      <main id="main">
        <div className="intro">
          <span className="eyebrow">MAŁY KROK. KAŻDEGO DNIA.</span>
          <h1>Chwila dla Twojej pamięci.</h1>
          <p>Jedna fiszka naraz. Tyle nauki, ile masz dziś czasu.</p>
        </div>
        <section className="workspace" aria-label="Demonstracja nauki">
          <aside>
            <span className="eyebrow">TWÓJ PIERWSZY ZESTAW</span>
            <h2>
              Małe, codzienne
              <br />
              rozmowy
            </h2>
            <p>
              6 angielskich wyrażeń,
              <br />
              które warto mieć pod ręką.
            </p>
            <div className="set-label">
              EN <span aria-hidden="true">↔</span> PL
            </div>
            <label htmlFor="direction">Kierunek nauki</label>
            <select
              id="direction"
              disabled={started}
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as Direction)
              }
            >
              <option value="a-b">Angielski → Polski</option>
              <option value="b-a">Polski → Angielski</option>
            </select>
            <p className="aside-note">
              Bez konta. Bez pośpiechu.
              <br />
              Możesz skończyć w każdej chwili.
            </p>
          </aside>
          <div className="training">
            <div className="training-top">
              <span>
                {started ? "Przypomnij sobie znaczenie" : "Poznaj Recallio"}
              </span>
              <span className="dot-label">
                <span className="dot" /> Zapis na urządzeniu
              </span>
            </div>
            {!started ? (
              <div className="welcome">
                <span className="card-symbol" aria-hidden="true">
                  Aa
                </span>
                <h2>
                  Znasz to uczucie,
                  <br />
                  kiedy słowo zostaje?
                </h2>
                <p>
                  Spróbuj krótkiej nauki. Odsłoń odpowiedź
                  <br />i oceń, jak łatwo udało się ją przypomnieć.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setStarted(true);
                    setError("");
                  }}
                >
                  Rozpocznij naukę <span aria-hidden="true">↗</span>
                </button>
              </div>
            ) : (
              <div className="exercise">
                <span className="eyebrow">
                  {direction === "a-b" ? "PO ANGIELSKU" : "PO POLSKU"}
                </span>
                <h2>{face.question}</h2>
                <div className="answer" aria-live="polite">
                  {revealed ? (
                    <>
                      <h3>{face.answer}</h3>
                      <p>{face.example}</p>
                    </>
                  ) : (
                    <p>Najpierw spróbuj przypomnieć sobie odpowiedź.</p>
                  )}
                </div>
                {!revealed ? (
                  <button
                    ref={revealButton}
                    className="primary"
                    onClick={() => setRevealed(true)}
                  >
                    Odsłoń odpowiedź
                  </button>
                ) : (
                  <div>
                    <p className="rating-label">Jak poszło przypominanie?</p>
                    <div className="ratings">
                      {ratings.map(({ value, label }, i) => (
                        <button
                          key={value}
                          ref={i === 0 ? firstRating : undefined}
                          disabled={saving || pending.current !== null}
                          onClick={() => rate(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
                {pending.current && (
                  <button
                    disabled={saving}
                    onClick={() => rate(pending.current!.rating)}
                  >
                    Ponów zapis
                  </button>
                )}
              </div>
            )}
            <div className="training-bottom">
              <span role="status">
                {saving
                  ? "Zapisywanie odpowiedzi…"
                  : saved === null
                    ? "Lokalna historia odpowiedzi"
                    : `Zapisane odpowiedzi: ${saved}`}
              </span>
              {started && (
                <button
                  disabled={saving || pending.current !== null}
                  onClick={() => {
                    setStarted(false);
                    setRevealed(false);
                  }}
                >
                  Zakończ na teraz <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          </div>
        </section>
        <div className="under-note">
          <span aria-hidden="true">↳</span>
          <p>
            To dopiero początek. Demo zapisuje odpowiedzi w tej przeglądarce.
            <br />
            Konta, własne zestawy i inteligentne powtórki pojawią się w
            kolejnych etapach.
          </p>
        </div>
      </main>
      <footer>
        <span>recallio / odrobinę każdego dnia</span>
        <span>Przestrzeń na to, co chcesz zapamiętać.</span>
      </footer>
    </div>
  );
}
