const csvName = "włoski-w-kawiarni.csv";
const csvSample = `<a class="act text" download="wzor.csv" href="data:text/csv;charset=utf-8,side_a%2Cside_b%2Cexample_a%2Cexample_b%0D%0Aun%20conto%2Crachunek%2CIl%20conto%20per%20favore.%2CPoprosz%C4%99%20rachunek.">Pobierz wzór CSV</a>`;
const step = (num) =>
  `<ol class="steps" aria-label="Etapy importu">${["Wybór pliku", "Podgląd", "Wynik"].map((x, i) => `<li ${i + 1 === num ? 'aria-current="step"' : ""}>${x}</li>`).join("")}</ol>`;
function csvScreen(id, s) {
  const wrap = (heading, desc, body, num) =>
    page(
      back("Wróć do zestawów", "W02/list") +
        step(num) +
        split(heading, desc, body),
    );
  if (id === "W10") {
    const errors = {
      header:
        "Nie rozpoznano nagłówka. Użyj kolumn side_a i side_b. Kolumny example_a i example_b są opcjonalne.",
      encoding: "Zapisz plik w kodowaniu UTF-8 i wybierz go ponownie.",
      size: "Plik przekracza 1 MiB. Podziel go na mniejsze pliki.",
    };
    const chosen = !!errors[s] || s === "selected";
    return wrap(
      "Importuj CSV",
      "Dodaj fiszki z pliku. Przed zapisem sprawdzisz treść i rozstrzygniesz różnice.",
      radios(
        "Miejsce importu",
        ["Istniejący zestaw", "Nowy zestaw"],
        s === "target" ? 1 : 0,
      ) +
        (s === "target"
          ? field("Nazwa nowego zestawu", "Włoskie słówka")
          : `<label class="field"><span>Zestaw</span><select><option>${italian}</option><option>Angielski w podróży</option></select></label>`) +
        `<div class="filebox"><strong>Plik CSV</strong><label class="filepick">${chosen ? "Zmień plik" : "Wybierz plik"}<input type="file" accept=".csv,text/csv" aria-label="Wybierz plik CSV"></label><span class="filename">${chosen ? csvName : "Nie wybrano pliku"}</span><small>UTF-8 · do 1 MiB</small></div>` +
        (errors[s] ? note(errors[s], true) : "") +
        line(
          chosen && !errors[s]
            ? main("Pokaż podgląd", "W11/preview")
            : '<button class="primary" disabled>Pokaż podgląd</button>',
          csvSample,
        ),
      1,
    );
  }
  if (id === "W11") {
    const diff = s === "conflict" || s === "example";
    const compare = (lbl, txt, example) =>
      `<div><h3>${lbl}</h3><p>un conto <span>/</span> ${txt}</p>${example ? `<small>${example}</small>` : ""}</div>`;
    const mini = (n, a, b, state) =>
      `<div class="csvrow"><small>Wiersz ${n}</small><span>${a} <i>/</i> ${b}</span><strong>${state}</strong></div>`;
    const records =
      s === "page"
        ? Array.from({ length: 3 }, (_, i) =>
            mini(
              i + 22,
              ...[
                ["la tazza", "filiżanka"],
                ["il miele", "miód"],
                ["la pera", "gruszka"],
              ][i],
              "Dodaj fiszkę",
            ),
          ).join("")
        : s === "invalid"
          ? `<div class="review"><small>Wiersz 4</small><h2>Brak wartości strony B</h2><p>„un tavolo” ma pustą odpowiedź. Popraw plik lub pomiń ten wiersz.</p>${line(main("Pomiń wiersz", "W11/preview?skip=4"), link("Zmień plik", "W10/selected"))}</div>`
          : diff
            ? `<div class="review"><small>Wiersz ${s === "conflict" ? 4 : 5}</small><h2>${s === "conflict" ? "Inna odpowiedź" : "Inny przykład"}</h2><div class="comparison">${compare("W pliku", s === "conflict" ? "konto" : "rachunek", s === "example" ? "Posso avere il conto?" : "")}${compare("W zestawie", "rachunek", s === "example" ? "Il conto, per favore." : "")}</div>${s === "conflict" ? `<label class="field"><span>Fiszka docelowa</span><select><option>un conto / rachunek</option><option>un conto / paragon</option></select></label>` : ""}${radios("Decyzja dla tego wiersza", s === "example" ? ["Pomiń wiersz", "Zaktualizuj przykłady"] : ["Pomiń wiersz", "Dodaj osobną fiszkę", "Zastąp treść wybranej fiszki"])}${main("Zastosuj decyzję", "W11/preview?decision=" + s)}</div>`
            : mini(2, "il pane", "chleb", "Dodaj fiszkę") +
              mini(3, "un caffè", "kawa", "Duplikat · pomiń") +
              `<div class="csvrow"><small>Wiersz 4</small><span>un conto <i>/</i> konto</span>${link("Inna odpowiedź", "W11/conflict")}</div><div class="csvrow"><small>Wiersz 5</small><span>un conto <i>/</i> rachunek</span>${link("Inny przykład", "W11/example")}</div>` +
              mini(6, "il sale", "sól", "Dodaj fiszkę");
    return page(
      back("Wróć do wyboru pliku", "W10/selected") +
        step(2) +
        `<div class="pagehead"><div>${title("Podgląd importu", `${csvName} · separator: przecinek`)}</div><span class="decktarget">Do zestawu <strong>${italian}</strong></span></div>` +
        section(
          s === "page" ? "Wiersze 22–24" : "Decyzje dla wierszy",
          records,
        ) +
        (diff || s === "invalid"
          ? link("Wróć do listy wierszy", "W11/preview")
          : line(
              main("Zatwierdź plan importu", "W12/running"),
              s === "page"
                ? link("Poprzednia strona", "W11/many")
                : link("Zmień plik", "W10/selected"),
            )),
    );
  }
  const progress = {
    running: 1,
    paused: 2,
    resumed: 3,
    stop: 2,
    stopped: 2,
    done: 5,
  }[s];
  const headings = {
    done: "Import zakończony",
    running: "Trwa import",
    resumed: "Wznowiono import",
    paused: "Import wstrzymany",
    stop: "Zakończyć import?",
    stopped: "Import zakończony częściowo",
  };
  const desc = {
    done: "Fiszki zapisano na tym urządzeniu.",
    running: "Zapisujemy zatwierdzone zmiany na urządzeniu.",
    resumed: "Kontynuujemy od pierwszego niezapisanego kroku.",
    paused:
      "Zapis na urządzeniu został przerwany. Możesz wrócić do zapisanego miejsca.",
    stop: "Zapisane fiszki zostaną w zestawie. Pozostałe kroki zostaną pominięte.",
    stopped: "W zestawie zostały dotychczas zapisane fiszki.",
  };
  const buttons = {
    done: main("Otwórz zestaw", "W04/full"),
    running: secondary("Zakończ import", "W12/stop"),
    resumed: secondary("Zakończ import", "W12/stop"),
    paused: line(
      main("Wznów import", "W12/resumed"),
      link("Zakończ import", "W12/stop", "danger"),
    ),
    stop: line(
      secondary("Anuluj", "W12/paused"),
      link("Zakończ import", "W12/stopped", "destructive"),
    ),
    stopped: main("Otwórz zestaw", "W04/full"),
  };
  return wrap(
    headings[s],
    desc[s],
    `<div class="receipt"><p class="kicker">Zapis na urządzeniu</p><h2>Zapisano ${progress} z 5 kroków</h2><progress max="5" value="${progress}" aria-label="Zapisane kroki"></progress><dl><dt>Plik</dt><dd>${csvName}</dd><dt>Zestaw</dt><dd>${italian}</dd></dl>${buttons[s]}</div>`,
    3,
  );
}
