export type Direction = "a-b" | "b-a";
export type Rating = 1 | 2 | 3 | 4;
export interface Card {
  id: string;
  sideA: string;
  sideB: string;
  exampleA?: string;
  exampleB?: string;
}
export interface Review {
  id: string;
  cardId: string;
  direction: Direction;
  rating: Rating;
  answeredAt: string;
}
export function presentCard(card: Card, direction: Direction) {
  return direction === "a-b"
    ? { question: card.sideA, answer: card.sideB, example: card.exampleB }
    : { question: card.sideB, answer: card.sideA, example: card.exampleA };
}
// Demo queue only. Production scheduling is deliberately a separate future module.
export function nextIndex(index: number, length: number): number {
  if (length < 1) throw new Error("Zestaw jest pusty.");
  return (index + 1) % length;
}
