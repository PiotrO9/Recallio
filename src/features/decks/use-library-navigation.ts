import { useState, useEffect, useRef, type MouseEvent } from "react";
import type { Card, Deck } from "@/contracts";
type LibraryPosition = {
  userId: string;
  search: string;
  rowId: string;
  scrollY: number | null;
};

function libraryPosition(userId: string): LibraryPosition | undefined {
  const position = window.history.state?.libraryPosition;
  return position?.userId === userId ? position : undefined;
}

export function deckHref(id: string) {
  return "/decks?deck=" + encodeURIComponent(id);
}

export type LibraryEntry = {
  userId: string;
  initialDeck?: string;
  createDeck?: boolean;
  createCard?: boolean;
};
export function useLibraryNavigation(
  { userId, initialDeck, createDeck, createCard }: LibraryEntry,
  busy: boolean,
) {
  const [selected, setSelected] = useState<string | undefined>(initialDeck);
  const returnPosition = useRef<LibraryPosition | undefined>(undefined);
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
      setSelected(id);
      setDeckForm(params.get("new") === "1" ? null : undefined);
      setCardForm(params.get("card") === "new" ? null : undefined);
    }
    restoreLocation();
    window.addEventListener("popstate", restoreLocation);
    return () => window.removeEventListener("popstate", restoreLocation);
  }, [userId]);

  function openDeck(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (busy || id === selected) return;
    const position = { userId, rowId: id, search, scrollY: window.scrollY };
    if (!selected) {
      window.history.replaceState({ libraryPosition: position }, "", "/decks");
      window.history.pushState(
        { libraryPosition: position, fromLibrary: true },
        "",
        deckHref(id),
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
    focusSelection.current = true;
    setSelected(id);
    setCardForm(undefined);
  }

  function closeCardForm() {
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
    const position = { userId, rowId: id, search, scrollY: null };
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
