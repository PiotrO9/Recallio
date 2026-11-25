const root = document.getElementById("root");
const firstState = (id) => Object.keys(views.get(id).states)[0];
const renderers = [
  panel,
  library,
  deckForm,
  detail,
  cardForm,
  ...Array.from({ length: 4 }, (_, i) => (s, p) => study("W0" + (i + 6), s, p)),
  ...["W10", "W11", "W12"].map((id) => (s) => csvScreen(id, s)),
  account,
  ...["W14", "W15", "W16", "W17", "W18"].map((id) => (s) => access(id, s)),
];
const headings = {
  W01: "Po odczycie biblioteki udostępnij polecaną akcję.",
  W02: "Kolejność: wyszukiwanie, zestawy, szczegóły wybranego zestawu.",
  W03: "Po błędzie wróć do pola nazwy. Po zapisie otwórz pierwszą fiszkę.",
  W04: "Zarządzanie rozwija się w miejscu. Usunięcie wymaga potwierdzenia.",
  W05: "Pierwsze pole to strona A. Przy błędzie przejdź do pierwszego niepoprawnego pola.",
  W06: "Trzymaj pytanie w tym samym miejscu przed i po odsłonięciu.",
  W07: "Oceny czytamy od lewej. Błąd przenosi fokus na „Ponów zapis”.",
  W08: "Po zakończeniu przenieś fokus na nagłówek podsumowania.",
  W09: "Po błędzie zachowaj wprowadzone ustawienia i wskaż przyczynę przy polu.",
  W10: "Najpierw wybierz zestaw i plik. Poprawny plik odblokowuje podgląd.",
  W11: "Podaj numer wiersza przy każdej decyzji. Na telefonie najpierw czytaj wartość z pliku.",
  W12: "Ogłaszaj wynik zapisu. Potwierdzenie przerwania rozpoczyna się od opcji anulowania.",
  W13: "Oddziel anulowanie od odrzucenia zmian. Po błędzie umożliw ponowienie synchronizacji.",
  W14: "Po błędzie zachowaj adres e-mail i ogłoś komunikat przed polami.",
  W15: "Po wysłaniu formularza przenieś fokus na potwierdzenie. Link z poczty otwiera pierwszy panel.",
  W16: "Po wysłaniu pokaż ten sam komunikat niezależnie od istnienia konta.",
  W17: "Sukces otwiera konto z potwierdzeniem zmiany hasła.",
  W18: "Po komunikacie 404 udostępnij jedno wyjście.",
};
function decodeRoute(raw) {
  const [path, query = ""] = raw.replace(/^#/, "").split("?");
  const parts = path.split("/"),
    embedded = parts[0] === "frame";
  if (embedded) parts.shift();
  const id = views.has(parts[0]) ? parts[0] : "W01";
  const s = Object.hasOwn(views.get(id).states, parts[1])
    ? parts[1]
    : firstState(id);
  return {
    id,
    s,
    device: parts[2] === "mobile" ? "mobile" : "desktop",
    query,
    p: new URLSearchParams(query),
    embedded,
  };
}
const uri = (id, s, query = "") => `${id}/${s}${query ? "?" + query : ""}`;
const navigate = (path) => {
  location.hash = "frame/" + path;
};
let importTimer;
function renderFrame(r) {
  clearTimeout(importTimer);
  const { id, s, p } = r,
    view = views.get(id);
  document.body.className = "prototype";
  const previous = root.dataset.route;
  root.dataset.route = uri(id, s, r.query);
  document.title = `${view.title} · ${view.states[s]} · Recallio`;
  root.innerHTML = renderers[Number(id.slice(1)) - 1](s, p);
  root.dataset.view = id;
  root.dataset.state = s;
  if (id === "W01" && s === "first")
    root.querySelector(".home").classList.add("firstvisit");
  if (id === "W07" && s === "error")
    root.querySelector(".primary")?.classList.add("focus-example");
  attachInteractions(r);
  window.scrollTo(0, 0);
  if (focusAfterNavigation) {
    let selector = "h1";
    if (["remove", "discard", "stop", "reset", "leave"].includes(s))
      selector = ".confirm .secondary, .receipt .secondary";
    else if (id === "W07") selector = s === "error" ? ".primary" : ".grade";
    else if (id === "W06") selector = ".studyactions .primary";
    else if (id === "W03" || id === "W05")
      selector = ".field input, .field textarea";
    const target =
      root.querySelector("[aria-invalid=true]") ||
      root.querySelector(selector) ||
      root.querySelector("h1");
    if (target) {
      if (target.tagName === "H1") target.tabIndex = -1;
      target.focus();
    }
    focusAfterNavigation = false;
  }
  if (window.parent !== window)
    parent.postMessage(
      { kind: "recallio-frame", path: root.dataset.route, previous },
      "*",
    );
}
function devicePath(r) {
  return `${r.id}/${r.s}/${r.device}${r.query ? "?" + r.query : ""}`;
}
function studio(r) {
  const view = views.get(r.id);
  document.body.className = "studio";
  document.title = "Recallio · Galeria makiet";
  if (!root.querySelector("iframe")) {
    root.innerHTML = `<header class="studiohead"><strong>Recallio <span> / Projekt interfejsu</span></strong><span>Makiety do implementacji</span></header><main><div class="controls"><label>Widok<select id="view">${catalog.map(([id, title]) => `<option value="${id}">${id} · ${title}</option>`).join("")}</select></label><label>Stan<select id="state"></select></label><fieldset class="devices"><legend>Ramka</legend><div><button data-device="desktop">Desktop</button><button data-device="mobile">Mobile</button></div></fieldset></div><div class="cap"><span id="dimensions"></span><a id="openframe" target="_blank" rel="noopener">Otwórz sam widok</a></div><div class="proof"><div class="framebox"><iframe title="Interaktywna makieta Recallio"></iframe></div></div><div class="spec"><p><strong>Do implementacji</strong><span id="note"></span></p><p><strong>Interakcja i fokus</strong><span id="behavior"></span></p></div></main>`;
    document.getElementById("view").onchange = (e) => {
      const id = e.target.value;
      location.hash = devicePath({
        ...decodeRoute(location.hash),
        id,
        s: firstState(id),
        query: "",
      });
    };
    document.getElementById("state").onchange = (e) => {
      location.hash = devicePath({
        ...decodeRoute(location.hash),
        s: e.target.value,
        query: "",
      });
    };
    root.querySelectorAll("[data-device]").forEach(
      (b) =>
        (b.onclick = () => {
          location.hash = devicePath({
            ...decodeRoute(location.hash),
            device: b.dataset.device,
          });
        }),
    );
    new ResizeObserver(resizeProof).observe(root.querySelector(".proof"));
  }
  document.getElementById("view").value = r.id;
  const states = document.getElementById("state");
  states.innerHTML = Object.entries(view.states)
    .map(([k, v]) => `<option value="${k}">${v}</option>`)
    .join("");
  states.value = r.s;
  root
    .querySelectorAll("[data-device]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.device === r.device)),
    );
  const hash = "#frame/" + uri(r.id, r.s, r.query),
    iframe = root.querySelector("iframe");
  document.getElementById("openframe").href = hash;
  document.getElementById("note").textContent = view.note;
  document.getElementById("behavior").textContent = headings[r.id];
  // A hash-only change preserves the current scenario when the same frame remains open.
  const desired = location.href.split("#")[0] + hash;
  if (iframe.dataset.path !== hash) {
    iframe.dataset.path = hash;
    iframe.src = desired;
  }
  resizeProof();
}
function resizeProof() {
  const proof = root.querySelector(".proof");
  if (!proof) return;
  const mobile = decodeRoute(location.hash).device === "mobile",
    w = mobile ? 390 : 1440,
    h = mobile ? 844 : 900;
  const scale = Math.min(1, (proof.clientWidth - 12) / w);
  const box = proof.firstElementChild,
    iframe = box.firstElementChild;
  Object.assign(box.style, {
    width: w * scale + "px",
    height: h * scale + "px",
  });
  Object.assign(iframe.style, {
    width: w + "px",
    height: h + "px",
    transform: `scale(${scale})`,
  });
  document.getElementById("dimensions").textContent =
    `${w} × ${h} px · ${Math.round(scale * 100)}%`;
}
window.addEventListener("message", (e) => {
  const iframe = root.querySelector("iframe");
  if (
    !iframe ||
    e.source !== iframe.contentWindow ||
    e.data?.kind !== "recallio-frame"
  )
    return;
  const current = decodeRoute(location.hash),
    incoming = decodeRoute("#frame/" + e.data.path);
  const hash = "#frame/" + uri(incoming.id, incoming.s, incoming.query);
  // A device or screen selection can overtake a message from the previous frame.
  const expected = "#frame/" + uri(current.id, current.s, current.query);
  if (
    hash === expected ||
    expected !== iframe.dataset.path ||
    "#frame/" + e.data.previous !== expected
  )
    return;
  iframe.dataset.path = hash;
  location.hash = devicePath({ ...incoming, device: current.device });
});
function render() {
  const r = decodeRoute(location.hash);
  if (r.embedded) renderFrame(r);
  else studio(r);
}
window.addEventListener("hashchange", render);
render();
