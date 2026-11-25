function study(id, s, p) {
  const en = p.get("deck") === "english",
    name = en ? "Angielski w podróży" : italian;
  const n = Number(p.get("n")) || 0,
    card = en
      ? n % 2
        ? ["the station", "dworzec"]
        : ["a ticket", "bilet"]
      : vocabulary[n % vocabulary.length];
  const reverse = s === "reverse",
    offline = s === "offline",
    answered = id === "W07" && !offline;
  const ctx = new URLSearchParams(p);
  ctx.set("n", String(n));
  const nextCtx = new URLSearchParams(ctx);
  nextCtx.set("n", String(n + 1));
  const next = `W06/${offline ? "offline" : "question"}?${nextCtx}`;
  const reveal = `W07/${reverse ? "reverse" : offline ? "revealed" : n || en ? "short" : "revealed"}?${ctx}${offline ? "&offline=1" : ""}`;
  const studyLink = `W06/question?${ctx}`;
  const context = `<div class="studyline">${link(name, "W04/full" + (en ? "?deck=english" : ""))}<span>${offline || p.has("offline") ? "Offline" : s === "practice" ? "Ćwiczenie dodatkowe" : "Trening"}</span></div>`;
  const foot = `<div class="studyfoot">${link("Ustawienia nauki", "W09/defaults")}${link("Zakończ sesję", s === "error" ? "W07/leave" : "W08/ended")}</div>`;
  const focusPage = (body) =>
    topbar("") + `<main class="studywrap">${context}${body}${foot}</main>`;
  if (id === "W08")
    return page(
      back("Wróć do zestawu", "W04/full") +
        split(
          "Sesja zakończona",
          name,
          `<div class="endcap"><h2>Możesz tu wrócić w każdej chwili.</h2>${s === "count" ? "<p>Odpowiedzi w tej sesji <strong>6</strong></p>" : ""}${line(main("Rozpocznij nową sesję", studyLink), link("Moje zestawy", "W02/list"))}</div>`,
        ),
      "",
    );
  if (id === "W09")
    return focusPage(
      `<section class="settings">${title("Ustawienia nauki")}<div class="settinggrid">${field("Nowe fiszki dziennie", s === "zero" ? "0" : s === "invalid" ? "-1" : "20", { type: "number", hint: "Limit obejmuje wszystkie zestawy na tym koncie.", error: s === "invalid" ? "Podaj liczbę całkowitą od 0 do 10000." : "" })}${s === "zero" ? note("Nowe fiszki są wyłączone. Zaplanowane powtórki pozostają dostępne.") : ""}<fieldset><legend>Liczniki podczas nauki</legend><label class="choice"><input type="checkbox">Pokaż liczbę należnych powtórek</label><label class="choice"><input type="checkbox">Pokaż liczbę odpowiedzi w sesji</label></fieldset><div class="settingfact"><strong>Strefa dnia nauki</strong><span>Europe/Warsaw</span><small>Nowy dzień zaczyna się o północy czasu warszawskiego.</small></div>${s === "saved" ? note("Zapisano ustawienia nauki.") : s === "error" ? note("Nie udało się zapisać ustawień na tym urządzeniu.", true) : ""}${line(main(s === "error" ? "Ponów zapis" : "Zapisz ustawienia", "W09/saved"), link("Wróć do fiszki", studyLink))}</div></section>`,
    );
  const blocked = {
    loading: ["Wczytywanie fiszek…", "Odczytujemy ten zestaw z urządzenia."],
    empty: [
      "Ten zestaw jest pusty",
      "Dodaj pierwszą fiszkę, żeby rozpocząć naukę.",
      main("Dodaj fiszkę", "W05/first"),
    ],
    unavailable: [
      "Zestaw jest niedostępny offline",
      "Połącz się z siecią i przygotuj zestaw na tym urządzeniu.",
      secondary("Wróć do zestawu", "W04/manage"),
    ],
    limit: [
      "Dzisiejszy limit został wykorzystany",
      "W zestawie pozostały tylko nowe fiszki.",
      main("Dodaj jeszcze jedną nową fiszkę", "W06/question"),
      link("Wróć do zestawu", "W04/full"),
    ],
  };
  if (id === "W06" && blocked[s]) {
    const [h, t, ...actions] = blocked[s];
    return focusPage(
      `<div class="flash quiet">${title(h, t)}${line(...actions)}</div>`,
    );
  }
  const prompt =
    offline && id === "W07"
      ? vocabulary[(n + 1) % vocabulary.length][0]
      : reverse
        ? card[1]
        : card[0];
  const grades = ["Nie pamiętam", "Trudno", "Dobrze", "Łatwo"];
  return focusPage(
    `${id === "W07" && offline ? note("Ocena zapisana na urządzeniu. Jedna zmiana czeka na wysłanie.") : ""}<article class="flash"><div class="prompt"><p class="label">${reverse ? "Strona B" : "Strona A"}</p><h1>${prompt}</h1></div>${answered ? `<div class="answer"><p class="label">${reverse ? "Strona A" : "Strona B"}</p><h2>${s === "long" ? longAnswer : reverse ? card[0] : card[1]}</h2>${s !== "short" && !en && !n ? `<p class="example">„${reverse ? "Il conto, per favore." : "Poproszę rachunek."}”</p>` : ""}</div>` : ""}</article>` +
      (!answered
        ? `<div class="studyactions">${main("Pokaż odpowiedź", id === "W07" && offline ? `W07/short?${nextCtx}&offline=1` : reveal)}</div>`
        : s === "error" || s === "leave"
          ? note(
              "Nie udało się zapisać oceny. Twoja odpowiedź pozostaje na ekranie.",
              true,
            ) +
            line(main("Ponów zapis", next)) +
            (s === "leave"
              ? modal(
                  "Zakończyć bez zapisu oceny?",
                  "Ta odpowiedź nie zostanie uwzględniona w postępie.",
                  line(
                    secondary("Anuluj", "W07/error"),
                    link("Zakończ bez zapisu", "W08/ended", "destructive"),
                  ),
                )
              : "")
          : s === "saving"
            ? `<div class="grades">${grades.map((x) => `<button disabled>${x}</button>`).join("")}</div>${note("Zapisywanie oceny na urządzeniu…")}`
            : `<p class="gradehint">Jak dobrze pamiętasz odpowiedź?</p><div class="grades">${grades.map((g, i) => link(`<small>${i + 1}</small>${g}`, p.has("offline") ? "W07/offline" : next, "grade")).join("")}</div>`),
  );
}
