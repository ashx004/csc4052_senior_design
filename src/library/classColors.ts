// Curated palette shared by both the random color a new class gets on
// creation (AddEnrollmentModal) and the choices offered in ClassCard's
// color-edit popup — one shared list means a class's random starting color
// is always something the student could also have picked by hand.
export const CLASS_COLOR_PALETTE: string[] = [
  "#b08957", // gold
  "#6b8f5e", // sage
  "#c2685a", // coral
  "#5a7ca8", // slate blue
  "#8a6bb0", // lavender
  "#a8763a", // amber brown
  "#4a8f95", // teal
  "#c48a3f", // amber orange
];

export function randomClassColor(): string {
  return CLASS_COLOR_PALETTE[Math.floor(Math.random() * CLASS_COLOR_PALETTE.length)];
}
