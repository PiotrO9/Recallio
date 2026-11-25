function account(s) {
  const confirm = ["pending", "retry", "discard"].includes(s);
  const panel =
    s === "discard"
      ? modal(
          "Odrzucić niewysłane zmiany?",
          "Jedna zmiana istnieje tylko na tym urządzeniu. Po wylogowaniu utracisz ją bezpowrotnie.",
          line(
            secondary("Anuluj", "W13/pending"),
            link("Odrzuć zmiany i wyloguj się", "W14/login", "destructive"),
          ),
        )
      : confirm
        ? modal(
            "Wylogować się z konta?",
            "Jedna zmiana czeka na wysłanie. Możesz zapisać ją na koncie przed wylogowaniem.",
            line(
              main(
                s === "retry"
                  ? "Ponów synchronizację i wyloguj się"
                  : "Synchronizuj i wyloguj się",
                "W14/login",
              ),
              link("Anuluj", "W13/account"),
            ) +
              line(
                link("Odrzuć zmiany i wyloguj się", "W13/discard", "danger"),
              ),
            s === "retry"
              ? note(
                  "Synchronizacja nie powiodła się. Sprawdź połączenie i spróbuj ponownie.",
                  true,
                )
              : "",
          )
        : "";
  return page(
    back("Wróć do panelu", "W01/due") +
      split(
        "Moje konto",
        "Dane logowania i zapis zmian.",
        `<div class="accountdata"><div><span>Adres e-mail</span><strong>ola@example.test</strong></div><div><span>Synchronizacja</span><strong>${confirm ? "1 niewysłana zmiana" : "Wszystkie zmiany zapisane"}</strong></div></div>${s === "password" ? note("Hasło zostało zmienione.") : ""}${confirm ? panel : line(secondary("Wyloguj się", "W14/login"), link("Wróć do nauki", "W01/due"))}`,
      ),
    "account",
  );
}
function access(id, s) {
  const login = id === "W14",
    signup = id === "W15",
    forgot = id === "W16",
    missing = id === "W18",
    reset = id === "W17";
  const h = missing
    ? "Nie znaleziono strony"
    : s === "sent"
      ? "Sprawdź pocztę"
      : login
        ? "Zaloguj się"
        : signup
          ? "Utwórz konto"
          : forgot
            ? "Odzyskaj hasło"
            : "Ustaw nowe hasło";
  const text = missing
    ? "Adres może być nieaktualny. Wróć do panelu i otwórz swój zestaw."
    : s === "sent"
      ? signup
        ? "Jeśli adres wymaga potwierdzenia, otrzymasz wiadomość z dalszymi instrukcjami."
        : "Jeśli z tym adresem jest powiązane konto, otrzymasz link do ustawienia nowego hasła."
      : forgot
        ? "Podaj adres e-mail używany do logowania."
        : "";
  let body = "";
  if (missing) body = main("Strona główna", "W01/due");
  else if (s === "sent") body = link("Wróć do logowania", "W14/login");
  else if (reset && s === "expired")
    body =
      note("Link do zmiany hasła wygasł. Poproś o nową wiadomość.", true) +
      main("Wyślij nowy link", "W16/request");
  else {
    const message =
      login &&
      {
        error: "Sprawdź adres e-mail, hasło i potwierdzenie konta.",
        session:
          "Sesja wygasła. Zaloguj się na to samo konto, aby wysłać lokalne zmiany.",
        expired:
          "Ten link jest nieprawidłowy lub wygasł. Możesz poprosić o nowy link.",
      }[s];
    body =
      (message ? note(message, s !== "session") : "") +
      (!reset
        ? field(
            "Adres e-mail",
            forgot && s === "invalid"
              ? "ola@"
              : s === "error" || s === "session" || s === "invalid"
                ? "ola@example.test"
                : "",
            {
              type: "email",
              error:
                forgot && s === "invalid" ? "Podaj pełny adres e-mail." : "",
            },
          )
        : "") +
      (!forgot
        ? field(reset ? "Nowe hasło" : "Hasło", s === "invalid" ? "123" : "", {
            type: "password",
            error: s === "invalid" ? "Użyj co najmniej 8 znaków." : "",
            hint:
              (signup || reset) && s !== "invalid"
                ? "Co najmniej 8 znaków."
                : "",
          })
        : "") +
      line(
        main(
          login
            ? "Zaloguj się"
            : signup
              ? "Utwórz konto"
              : forgot
                ? "Wyślij link"
                : "Zapisz hasło",
          login
            ? "W01/due"
            : signup
              ? "W15/sent"
              : forgot
                ? "W16/sent"
                : "W13/password",
        ),
      ) +
      `<div class="authlinks">${login ? link("Utwórz konto", "W15/signup") + link("Nie pamiętam hasła", "W16/request") : link("Wróć do logowania", "W14/login")}</div>`;
  }
  return `<main class="entry"><div class="entrycopy">${missing ? '<p class="kicker">Błąd 404</p>' : ""}${title(h, text)}<div class="entryfields">${body}</div></div>${paperArt()}</main>`;
}
