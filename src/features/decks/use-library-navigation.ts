import { useState, useEffect, useRef, type MouseEvent } from "react";
import type { Card, Deck } from "@/contracts";
type LibraryPosition = {
  userId: string;
  search: string;
  scope?: "cards" | "decks";
  visible?: number;
  rowId: string;
  scrollY: number | null;
};

function libraryPosition(userId: string): LibraryPosition | undefined {
  const position = window.history.state?.libraryPosition;
  return position?.userId === userId ? position : undefined;
}

export function deckHref(id: string, card?: string) {
  return (
    "/decks?deck=" +
    encodeURIComponent(id) +
    (card ? "&card=" + encodeURIComponent(card) : "")
  );
}

export type LibraryEntry = {
  userId: string;
  initialDeck?: string;
  createDeck?: boolean;
  createCard?: boolean;
  initialCard?: string;
};
export function useLibraryNavigation(
  { userId, initialDeck, createDeck, createCard, initialCard }: LibraryEntry,
  busy: boolean,
) {
  const [selected, setSelected] = useState<string | undefined>(initialDeck);
  const returnPosition = useRef<LibraryPosition | undefined>(undefined);
  const [target, setTarget] = useState(initialCard);
  const [scope, setScope] = useState<"cards" | "decks">("decks");
  const [visible, setVisible] = useState(50);
  const [search, setSearch] = useState("");
  const [deckForm, setDeckForm] = useState<Deck | null | undefined>(
    createDeck ? null : undefined,
  );
  const [cardForm, setCardForm] = useState<Card | null | undefined>(
    createCard ? null : undefined,
  );
  const focusSelection = useRef(false);
  useEffect(() => {
    function restoreLocation() {
      if (window.location.pathname !== "/decks") return;
      const params = new URLSearchParams(window.location.search);
      const id = params.get("deck") ?? undefined;
      const position = libraryPosition(userId);
      returnPosition.current = id ? undefined : position;
      focusSelection.current = !!id;
      setSearch(position?.search ?? "");
      setScope(position?.scope ?? "decks");
      setVisible(position?.visible ?? 50);
      setTarget(
        params.get("card") === "new"
          ? undefined
          : (params.get("card") ?? undefined),
      );
      setSelected(id);
      setDeckForm(params.get("new") === "1" ? null : undefined);
      setCardForm(params.get("card") === "new" ? null : undefined);
    }
    restoreLocation();
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [userId]);

  function openDeck(
    event: MouseEvent<HTMLAnchorElement>,
    id: string,
    card?: string,
  ) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (busy || (id === selected && !card)) return;
    const position = {
      userId,
      rowId: card ?? id,
      search,
      scope,
      visible,
      scrollY: window.scrollY,
    };
    if (!selected || card) {
      window.history.replaceState({ libraryPosition: position }, "", "/decks");
      window.history.pushState(
        { libraryPosition: position, fromLibrary: true },
        "",
        deckHref(id, card),
      );
    } else {
      window.history.replaceState(
        {
          libraryPosition: libraryPosition(userId),
          fromLibrary: window.history.state?.fromLibrary,
        },
        "",
        deckHref(id),
      );
    }
    setTarget(card);
    focusSelection.current = !card;
    setSelected(id);
    setCardForm(undefined);
  }

  function closeCardForm() {
    setTarget(undefined);
    if (
      target &&
      window.history.state?.fromLibrary &&
      libraryPosition(userId)?.scope === "cards"
    ) {
      window.history.back();
      return;
    }
    if (
      target &&
      new URLSearchParams(window.location.search).get("from") === "repair"
    ) {
      const params = new URLSearchParams(window.location.search);
      const session = params.get("session");
      window.location.replace(
        "/study?repair=1&focusCard=" +
          encodeURIComponent(target) +
          (session === "today"
            ? "&scope=today"
            : session
              ? "&deck=" + encodeURIComponent(session)
              : ""),
      );
      return;
    }
    if (selected && new URLSearchParams(window.location.search).has("card")) {
      window.history.replaceState(
        {
          libraryPosition: libraryPosition(userId),
          fromLibrary: window.history.state?.fromLibrary,
        },
        "",
        deckHref(selected),
      );
    }
    setCardForm(undefined);
  }

  function returnToList(id: string) {
    if (window.history.state?.fromLibrary && libraryPosition(userId)) {
      window.history.back();
      return;
    }
    const position = {
      userId,
      rowId: id,
      search,
      scope,
      visible,
      scrollY: null,
    };
    window.history.replaceState({ libraryPosition: position }, "", "/decks");
    returnPosition.current = position;
    setSelected(undefined);
  }

  function finishDeckSave(entityId: string, isNew: boolean) {
    if (isNew)
      window.history.replaceState(
        { libraryPosition: libraryPosition(userId) },
        "",
        deckHref(entityId) + "&card=new",
      );
    setSelected(entityId);
    if (isNew) setCardForm(null);
    setDeckForm(undefined);
  }
  function leaveDeletedDeck() {
    window.history.replaceState({}, "", "/decks");
    setSelected(undefined);
    setDeckForm(undefined);
    setCardForm(undefined);
  }
  function cancelDeckForm() {
    if (createDeck && !selected) window.history.replaceState({}, "", "/decks");
    setDeckForm(undefined);
  }
  return {
    selected,
    target,
    scope,
    setScope,
    visible,
    setVisible,
    search,
    setSearch,
    deckForm,
    cardForm,
    returnPosition,
    focusSelection,
    openDeck,
    returnToList,
    closeCardForm,
    openCardForm: setCardForm,
    openDeckForm: setDeckForm,
    finishDeckSave,
    leaveDeletedDeck,
    cancelDeckForm,
  };
}
