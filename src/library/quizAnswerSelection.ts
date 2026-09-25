export function isQuizOptionSelected({
  optionIndex,
  selectedIndex,
  selectedAnswer,
  option,
}: {
  optionIndex: number;
  selectedIndex: number | undefined;
  selectedAnswer: string | undefined;
  option: string;
}): boolean {
  if (selectedIndex !== undefined) {
    return selectedIndex === optionIndex;
  }
  return selectedAnswer === option;
}
