// The gallery uses fictional, in-memory examples. It never sends credentials, files or study events.
let draftDeck = "",
  draftCard = null,
  choiceByRow = {},
  newLimit = "20",
  counts = [false, false],
  savedSearch = "",
  editedDeck = "",
  extraDecks = [];
let focusAfterNavigation = false;
document.addEventListener(
  "click",
  (e) => {
    if (e.target.closest('a[href^="#frame/"]')) focusAfterNavigation = true;
  },
  true,
);
function attachInteractions({ id, s, p }) {
  const find = (selector) => root.querySelector(selector);
  const all = (selector) => Array.from(root.querySelectorAll(selector));
  const action = (label) =>
    all("a.act").find((a) => a.textContent.trim() === label);
  const on = (element, event, fn) => element?.addEventListener(event, fn);
  const intercept = (el, fn) =>
    on(el, "click", (e) => {
      e.preventDefault();
      fn();
    });
  const primary = find(".primary");
  const setName = (selector, value) => {
    const el = find(selector);
    if (el) el.textContent = value;
  };
  const param = (key) => p.get(key);
  if (id === "W01" && s === "first") {
    draftDeck = "";
    draftCard = null;
  }
  if (id === "W02") {
    if (p.has("removed"))
      all(".row")
        .filter((el) => el.querySelector("b").textContent === italian)
        .forEach((el) => el.remove());
    if (!["empty", "none"].includes(s))
      for (const deck of extraDecks) {
        find(".section").insertAdjacentHTML(
          "beforeend",
          row(esc(deck), "1 fiszka", "Otwórz", "W04/full?deck=own"),
        );
      }
    const input = find("input[type=search]");
    if (input) {
      if (s === "list" && savedSearch) input.value = savedSearch;
      const filter = () => {
        savedSearch = input.value;
        const query = savedSearch.toLocaleLowerCase("pl");
        const rows = all(".row");
        rows.forEach(
          (el) =>
            (el.hidden = !el
              .querySelector("b")
              .textContent.toLocaleLowerCase("pl")
              .includes(query)),
        );
        find(".search-empty")?.remove();
        if (rows.length && rows.every((el) => el.hidden)) {
          find(".section").insertAdjacentHTML(
            "beforeend",
            `<p class="search-empty">Brak wyników dla „${esc(input.value)}”.</p>`,
          );
        }
      };
      if (s === "list") filter();
      on(input, "input", filter);
      intercept(action("Wyczyść wyszukiwanie"), () => {
        savedSearch = "";
        navigate("W02/list");
      });
    }
  }
  if (id === "W03")
    intercept(primary, () => {
      const input = find(".field input"),
        value = input.value.trim();
      if (!value) {
        navigate("W03/invalid");
        input.focus();
        return;
      }
      if (s === "edit") {
        editedDeck = value;
        navigate("W04/full?deck=edited");
      } else {
        draftDeck = value;
        draftCard = null;
        navigate("W05/first?deck=own");
      }
    });
  if (id === "W04") {
    const own = param("deck") === "own",
      en = param("deck") === "english";
    if (own && draftCard) {
      setName("h1", draftDeck);
      setName(".intro", "1 fiszka · Ze strony A na B");
      all(".row").forEach((a) => a.remove());
      find(".section:last-child").insertAdjacentHTML(
        "beforeend",
        row(
          esc(draftCard[0]),
          esc(draftCard[1]),
          "Edytuj",
          "W05/edit?deck=own",
        ),
      );
      action("Ucz się z tego zestawu").href = "#frame/W06/question?deck=own";
    }
    if (param("deck") === "edited" && editedDeck) setName("h1", editedDeck);
    if (p.has("removed")) {
      find(".row")?.remove();
      setName(".intro", "7 fiszek · Ze strony A na B");
    }
    if (en) all(".row").forEach((a) => (a.dataset.deck = "english"));
    if (["limit", "zero"].includes(param("reason")))
      action("Ucz się z tego zestawu").href = "#frame/W06/limit";
  }
  if (id === "W05") {
    const fields = all("textarea"),
      own = param("deck") === "own";
    const eng = [
      ["a ticket", "bilet"],
      ["the station", "dworzec"],
      ["a suitcase", "walizka"],
      ["a passenger", "pasażer"],
      ["the platform", "peron"],
      ["a seat", "miejsce"],
      ["a journey", "podróż"],
      ["a passport", "paszport"],
      ["the airport", "lotnisko"],
      ["a map", "mapa"],
      ["a train", "pociąg"],
      ["a hotel", "hotel"],
    ];
    if (own && draftDeck) {
      setName(".intro", draftDeck);
      if (s === "edit" && draftCard) {
        fields[0].value = draftCard[0];
        fields[1].value = draftCard[1];
      }
      if (s === "saved")
        action("Ucz się z tego zestawu").href = "#frame/W06/question?deck=own";
    }
    if (param("deck") === "english") {
      setName(".intro", "Angielski w podróży");
      const card = eng[Number(param("card"))] || eng[0];
      fields[0].value = card[0];
      fields[1].value = card[1];
      fields.slice(2).forEach((el) => (el.value = ""));
    }
    intercept(primary, () => {
      const empty = fields.slice(0, 2).find((el) => !el.value.trim());
      if (empty) {
        empty.setAttribute("aria-invalid", "true");
        if (!empty.parentElement.querySelector(".fault"))
          empty.insertAdjacentHTML(
            "afterend",
            '<strong class="fault">Uzupełnij tę stronę fiszki.</strong>',
          );
        empty.focus();
        return;
      }
      draftCard = fields.slice(0, 2).map((el) => el.value.trim());
      if (own && !extraDecks.includes(draftDeck)) extraDecks.push(draftDeck);
      navigate(
        s === "edit"
          ? "W04/full" + (own ? "?deck=own" : "")
          : "W05/saved" + (own ? "?deck=own" : ""),
      );
    });
  }
  if ((id === "W06" || id === "W07") && param("deck") === "own" && draftCard) {
    const deckLink = find(".studyline a");
    deckLink.textContent = draftDeck;
    deckLink.href = "#frame/W04/full?deck=own";
    setName(".prompt h1", draftCard[0]);
    setName(".answer h2", draftCard[1]);
    find(".example")?.remove();
  }
  if (id === "W09") {
    const limit = find("input[type=number]"),
      toggles = all("input[type=checkbox]");
    if (s === "saved") {
      limit.value = newLimit;
      toggles.forEach((el, i) => (el.checked = counts[i]));
    }
    intercept(primary, () => {
      const n = Number(limit.value);
      if (limit.value === "" || !Number.isInteger(n) || n < 0 || n > 10000) {
        navigate("W09/invalid");
        return;
      }
      newLimit = limit.value;
      counts = toggles.map((el) => el.checked);
      navigate("W09/saved");
    });
  }
  if (id === "W10") {
    const targets = all("input[type=radio]");
    targets.forEach((el, i) =>
      on(el, "change", () => navigate("W10/" + (i ? "target" : "file"))),
    );
    on(find("input[type=file]"), "change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 1048576) {
        navigate("W10/size");
        return;
      }
      find(".filename").textContent = file.name;
      find(".notice")?.remove();
      const button = find(".actions button");
      if (button) button.outerHTML = main("Pokaż podgląd", "W11/preview");
    });
  }
  if (id === "W11") {
    const longList = s === "many" || p.has("many");
    if (longList) {
      const sec = find(".section");
      setName(".section h2", "Wiersze 2–21");
      Array.from({ length: 15 }, (_, i) => {
        const [a, b] = vocabulary[i % 8];
        sec.insertAdjacentHTML(
          "beforeend",
          `<div class="csvrow"><small>Wiersz ${i + 7}</small><span>${a} / ${b}</span><strong>Pomiń duplikat</strong></div>`,
        );
      });
      find(".section+.actions").insertAdjacentHTML(
        "beforeend",
        link("Następna strona", "W11/page"),
      );
    }
    if (s === "conflict" || s === "example") {
      const opts = all("input[type=radio]");
      if (choiceByRow[s] !== undefined) opts[choiceByRow[s]].checked = true;
      intercept(action("Zastosuj decyzję"), () => {
        choiceByRow[s] = opts.findIndex((el) => el.checked);
        navigate("W11/preview?decision=" + s);
      });
    }
    if (s === "preview" || s === "many" || s === "page") {
      for (const [k, labels] of Object.entries({
        conflict: ["Pomiń wiersz", "Dodaj osobną fiszkę", "Zastąp treść"],
        example: ["Pomiń wiersz", "Zaktualizuj przykłady"],
      })) {
        if (
          choiceByRow[k] !== undefined ||
          (k === "conflict" && p.has("skip"))
        ) {
          const a = action(
            k === "conflict" ? "Inna odpowiedź" : "Inny przykład",
          );
          if (a)
            a.insertAdjacentHTML(
              "beforebegin",
              `<strong>${labels[choiceByRow[k] || 0]}</strong>`,
            );
        }
      }
      intercept(primary, () => navigate("W12/running?play=1"));
    }
  }
  if (id === "W12" && s === "paused")
    intercept(action("Wznów import"), () => navigate("W12/resumed?play=1"));
  if (id === "W12" && p.has("play") && ["running", "resumed"].includes(s))
    importTimer = setTimeout(() => navigate("W12/done"), 1500);
  if (
    (id === "W14" || id === "W15" || id === "W16" || id === "W17") &&
    primary &&
    !["sent", "expired"].includes(s)
  ) {
    intercept(primary, () => {
      const fields = all("input");
      const invalid = fields.find(
        (el) =>
          !el.value.trim() ||
          !el.checkValidity() ||
          (el.type === "password" && id !== "W14" && el.value.length < 8),
      );
      if (invalid) {
        if (s === "invalid" || s === "error") {
          invalid.focus();
          return;
        }
        navigate(id + "/" + (id === "W14" ? "error" : "invalid"));
        return;
      }
      location.hash = primary.hash;
    });
  }
}
document.addEventListener("keydown", (e) => {
  if (
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    e.repeat ||
    /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
  )
    return;
  if (document.body.className !== "prototype") return;
  const { id } = decodeRoute(location.hash);
  if (id === "W06" && e.code === "Space") {
    const show = root.querySelector(".studyactions a");
    const activeAction = e.target.closest("a,button");
    if (show && (!activeAction || activeAction === show)) {
      e.preventDefault();
      show.click();
    }
  }
  if (id === "W07" && /^[1-4]$/.test(e.key)) {
    const grade = root.querySelectorAll(".grade")[Number(e.key) - 1];
    if (grade) {
      e.preventDefault();
      grade.click();
    }
  }
});
