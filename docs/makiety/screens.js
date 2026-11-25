const italian = "Włoski w kawiarni";
const longName = "Słownictwo z rozdziału o historii włoskiej architektury";
const vocabulary = [
  ["un conto", "rachunek"],
  ["un caffè", "kawa"],
  ["il latte", "mleko"],
  ["un tavolo", "stolik"],
  ["lo zucchero", "cukier"],
  ["il menù", "menu"],
  ["un bicchiere", "szklanka"],
  ["il tè", "herbata"],
];
const longAnswer =
  "Rachunek, o który prosimy po posiłku w kawiarni lub restauracji. To samo słowo może również oznaczać konto w banku.";
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const link = (label, to, kind = "text") =>
  `<a class="act ${kind}" href="#frame/${to}">${label}</a>`;
const main = (label, to) => link(label, to, "primary");
const secondary = (label, to) => link(label, to, "secondary");
const line = (...items) => `<div class="actions">${items.join("")}</div>`;
const note = (text, error = false) =>
  `<p class="notice ${error ? "error" : ""}" role="${error ? "alert" : "status"}">${text}</p>`;
const title = (name, desc = "") =>
  `<h1>${name}</h1>${desc ? `<p class="intro">${desc}</p>` : ""}`;
const field = (name, value = "", opt = {}) =>
  `<label class="field"><span>${name}</span>${opt.area ? `<textarea rows="${opt.rows || 2}" ${opt.error ? 'aria-invalid="true"' : ""}>${esc(value)}</textarea>` : `<input type="${opt.type || "text"}" value="${esc(value)}" ${opt.error ? 'aria-invalid="true"' : ""}>`}${opt.error ? `<strong class="fault">${opt.error}</strong>` : ""}${opt.hint ? `<small>${opt.hint}</small>` : ""}</label>`;
const radios = (name, options, sel = 0) =>
  `<fieldset><legend>${name}</legend>${options.map((label, i) => `<label class="choice"><input name="${esc(name)}" type="radio" ${sel === i ? "checked" : ""}>${label}</label>`).join("")}</fieldset>`;
const mark = `<span class="brandmark">r.</span><span>recallio</span>`;
const topbar = (active = "") =>
  `<header class="top"><div><a class="brand" href="#frame/W01/due" aria-label="Recallio, panel nauki">${mark}</a><nav aria-label="Główna">${link("Moje zestawy", "W02/list", active === "library" ? "nav current" : "nav")}${link("Moje konto", "W13/account", active === "account" ? "nav current" : "nav")}</nav></div></header>`;
const paperArt = () =>
  `<figure class="art"><img src="../../public/ejiri.webp" alt="Podmuch wiatru unosi kartki nad podróżnymi na drodze w Ejiri."><figcaption><span>Katsushika Hokusai · <i>Ejiri w prowincji Suruga</i></span><a href="https://www.metmuseum.org/art/collection/search/55735" target="_blank" rel="noreferrer">The Met</a></figcaption></figure>`;
const page = (body, active = "library") =>
  topbar(active) + `<main class="wrap">${body}</main>`;
const back = (label, to) => `<div class="back">${link(label, to)}</div>`;
const split = (heading, desc, body, context = "") =>
  `<div class="split"><div class="side">${context}${title(heading, desc)}</div><div class="work">${body}</div></div>`;
const section = (heading, body, action = "") =>
  `<section class="section"><div class="sectitle"><h2>${heading}</h2>${action}</div>${body}</section>`;
const modal = (heading, desc, buttons, body = "") =>
  `<section class="confirm" aria-label="${heading}"><h2>${heading}</h2><p>${desc}</p>${body}${buttons}</section>`;
const row = (name, sub, end, to) =>
  `<a class="row" href="#frame/${to}"><span><b>${name}</b>${sub ? `<small>${sub}</small>` : ""}</span><span class="rowend">${end}</span></a>`;
function decks(long = false) {
  return (
    row("Angielski w podróży", "12 fiszek", "Otwórz", "W04/full?deck=english") +
    row(italian, "8 fiszek", "Otwórz", "W04/full") +
    row(
      long ? longName : "Słowa z lektury",
      "0 fiszek",
      "Otwórz",
      long ? "W04/empty?deck=long" : "W04/empty",
    )
  );
}
function panel(s) {
  const info = {
    due: ["Powtórka czeka", italian, "Powtórz teraz", "W06/question"],
    count: ["2 kierunki do powtórki", italian, "Powtórz teraz", "W06/question"],
    new: ["Nowe fiszki", italian, "Poznaj nowe fiszki", "W06/question"],
    practice: ["Plan na dziś wykonany", italian, "Ćwicz dalej", "W06/practice"],
    first: [
      "Twoja biblioteka jest pusta",
      "Od czego zaczniesz?",
      "Utwórz pierwszy zestaw",
      "W03/create",
    ],
    empty: [
      "Zestaw czeka na materiał",
      "Słowa z lektury",
      "Dodaj pierwszą fiszkę",
      "W05/first?deck=empty",
    ],
    limit: [
      "Dzisiejszy limit nowych fiszek został wykorzystany.",
      italian,
      "Otwórz zestaw",
      "W04/full?reason=limit",
    ],
    zero: [
      "Nowe fiszki są wyłączone w ustawieniach.",
      italian,
      "Otwórz zestaw",
      "W04/full?reason=zero",
    ],
  };
  const [caption, name, cta, dest] = info[s] || [
    "Wczytywanie biblioteki…",
    "",
    "",
    "",
  ];
  return page(
    `<div class="home"><div class="lead">${title("Panel <em>nauki</em>")}<div class="recommend"><p class="kicker">${caption}</p>${name ? `<h2>${name}</h2>` : ""}${s === "first" ? "<p>Zapisz słowo lub pojęcie, do którego chcesz wrócić.</p>" : ""}${cta ? line(main(cta, dest), link("Moje zestawy", "W02/" + (s === "first" ? "empty" : "list"))) : '<div class="skeleton"></div>'}</div></div>${paperArt()}</div>` +
      section(
        "Biblioteka",
        s === "loading"
          ? "<p>Wczytywanie zestawów…</p>"
          : s === "first"
            ? "<p>Tu pojawią się Twoje zestawy.</p>"
            : s === "empty"
              ? row("Słowa z lektury", "0 fiszek", "Otwórz", "W04/empty")
              : decks(),
        link("Importuj CSV", "W10/file"),
      ),
    "",
  );
}
function library(s) {
  const empty = s === "empty";
  const search = empty
    ? ""
    : `<div class="search">${field("Wyszukaj zestaw", s === "none" ? "Biologia" : "", { type: "search" })}</div>`;
  return page(
    `<div class="pagehead">${title("Moje zestawy")}${line(main("Dodaj zestaw", "W03/create"), link("Importuj CSV", "W10/file"))}</div>${search}` +
      section(
        "Zestawy",
        empty
          ? `<div class="blank"><h3>Dodaj swój pierwszy zestaw</h3><p>W jednym zestawie możesz zebrać słowa z lekcji, książki lub podróży.</p></div>`
          : s === "none"
            ? `<div class="blank"><h3>Brak wyników dla „Biologia”</h3>${link("Wyczyść wyszukiwanie", "W02/list")}</div>`
            : decks(s === "long"),
      ),
  );
}
function deckForm(s) {
  return page(
    back("Wróć do zestawów", "W02/list") +
      split(
        s === "edit" ? "Edytuj zestaw" : "Nowy zestaw",
        "Wybierz, którą stronę fiszki zobaczysz jako pytanie.",
        field("Nazwa zestawu", s === "edit" ? italian : "", {
          error: s === "invalid" ? "Wpisz nazwę zestawu." : "",
        }) +
          radios("Kierunek nauki", [
            "Ze strony A na B",
            "Ze strony B na A",
            "Mieszany",
          ]) +
          line(
            main("Zapisz zestaw", s === "edit" ? "W04/full" : "W05/first"),
            link("Anuluj", s === "edit" ? "W04/full" : "W02/list"),
          ),
      ),
  );
}
function detail(s, p) {
  const empty = s === "empty",
    en = p.get("deck") === "english";
  const name = empty
    ? p.get("deck") === "long"
      ? longName
      : "Słowa z lektury"
    : en
      ? "Angielski w podróży"
      : italian;
  const edit = "W05/first" + (empty ? "?deck=empty" : "");
  const management = [
    "manage",
    "ready",
    "quota",
    "remove",
    "exported",
  ].includes(s);
  const english = [
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
  return page(
    back("Wróć do zestawów", "W02/list") +
      `<div class="pagehead"><div>${title(name, `${empty ? 0 : en ? 12 : 8} fiszek · Ze strony A na B`)}</div>${line(empty ? main("Dodaj pierwszą fiszkę", edit) : main("Ucz się z tego zestawu", "W06/question" + (en ? "?deck=english" : "")), empty ? "" : secondary("Dodaj fiszkę", "W05/next"))}</div>` +
      (management
        ? section(
            "Zarządzaj zestawem",
            line(
              link("Edytuj zestaw", "W03/edit"),
              link("Eksportuj CSV", "W04/exported"),
              link("Przygotuj offline", "W04/ready"),
              link("Usuń zestaw", "W04/remove", "danger"),
            ) +
              (s === "ready"
                ? note("Zestaw jest gotowy do nauki offline na tym urządzeniu.")
                : s === "quota"
                  ? note(
                      "Brakuje miejsca na urządzeniu. Zwolnij miejsce i spróbuj ponownie.",
                      true,
                    ) + secondary("Spróbuj ponownie", "W04/ready")
                  : s === "exported"
                    ? note("Przygotowano plik włoski-w-kawiarni.csv.")
                    : s === "remove"
                      ? modal(
                          "Usunąć zestaw?",
                          "Usuniesz 8 fiszek oraz ich postęp z tego konta.",
                          line(
                            secondary("Anuluj", "W04/manage"),
                            link(
                              "Usuń zestaw",
                              "W02/list?removed=italian",
                              "destructive",
                            ),
                          ),
                        )
                      : ""),
            link("Zwiń", "W04/full"),
          )
        : "") +
      section(
        "Fiszki",
        empty
          ? "<p>Ten zestaw czeka na pierwszą fiszkę.</p>"
          : (en ? english : vocabulary)
              .map(([a, b], i) =>
                row(
                  a,
                  b,
                  "Edytuj",
                  `W05/edit?card=${i}${en ? "&deck=english" : ""}`,
                ),
              )
              .join(""),
        management ? "" : link("Zarządzaj zestawem", "W04/manage"),
      ),
  );
}
function cardForm(s, p) {
  const isEdit = ["edit", "long", "remove", "reset"].includes(s);
  const entry = vocabulary[Number(p.get("card"))] || vocabulary[0];
  const a = isEdit || s === "invalid" ? entry[0] : "",
    b = s === "long" ? longAnswer : isEdit ? entry[1] : "";
  const inputs =
    `<div class="pair">${field("Strona A", a, { area: true })}${field("Strona B", b, { area: true, rows: s === "long" ? 5 : 2, error: s === "invalid" ? "Wpisz odpowiedź ze strony B." : "" })}</div>` +
    (isEdit
      ? `<div class="pair examples">${field("Przykład A (opcjonalnie)", entry === vocabulary[0] ? "Il conto, per favore." : "", { area: true })}${field("Przykład B (opcjonalnie)", entry === vocabulary[0] ? "Poproszę rachunek." : "", { area: true })}</div>`
      : `<details><summary>Dodaj przykłady</summary><div class="pair">${field("Przykład A", "", { area: true })}${field("Przykład B", "", { area: true })}</div></details>`);
  return page(
    back(
      "Wróć do zestawu",
      "W04/" + (p.get("deck") === "empty" ? "empty" : "full"),
    ) +
      split(
        isEdit
          ? "Edytuj fiszkę"
          : s === "first"
            ? "Pierwsza fiszka"
            : "Nowa fiszka",
        p.get("deck") === "empty" ? "Słowa z lektury" : italian,
        (s === "saved"
          ? note("Zapisano fiszkę. Możesz dodać kolejną lub zacząć naukę.") +
            link("Ucz się z tego zestawu", "W06/question")
          : "") +
          inputs +
          line(
            main("Zapisz fiszkę", isEdit ? "W04/full" : "W05/saved"),
            link("Anuluj", "W04/full"),
          ) +
          (isEdit
            ? section(
                "Postęp i usuwanie",
                line(
                  link("Resetuj postęp kierunku", "W05/reset"),
                  link("Usuń fiszkę", "W05/remove", "danger"),
                ),
              )
            : "") +
          (s === "remove"
            ? modal(
                "Usunąć fiszkę?",
                "Obie strony i historia tej fiszki zostaną usunięte.",
                line(
                  secondary("Anuluj", "W05/edit"),
                  link("Usuń fiszkę", "W04/full?removed=card", "destructive"),
                ),
              )
            : s === "reset"
              ? modal(
                  "Zresetować postęp?",
                  "Następna powtórka wybranego kierunku rozpocznie naukę od początku.",
                  line(
                    secondary("Anuluj", "W05/edit"),
                    link(
                      "Zresetuj wybrany kierunek",
                      "W04/full",
                      "destructive",
                    ),
                  ),
                  radios("Kierunek do resetu", ["A → B", "B → A"]),
                )
              : ""),
      ),
  );
}
