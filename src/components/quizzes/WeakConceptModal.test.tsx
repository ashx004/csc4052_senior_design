import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WeakConceptModal, { type WeakConceptModalProps } from "./WeakConceptModal";

const noop = () => {};

function render(overrides: Partial<WeakConceptModalProps> = {}) {
  return renderToStaticMarkup(
    <WeakConceptModal
      quizName="Lecture 4 — Derivatives"
      score={6}
      total={10}
      concepts={[
        { conceptKey: "chain rule", label: "Chain Rule", missCount: 3 },
        { conceptKey: "product rule", label: "Product Rule", missCount: 1 },
      ]}
      namingPending={false}
      namingInFlight={false}
      busy={null}
      error={null}
      canRetry
      onClose={noop}
      onStart={noop}
      onPlan={noop}
      onRetry={noop}
      {...overrides}
    />,
  );
}

describe("WeakConceptModal layer 1", () => {
  it("shows the score as a live arc and read-only concept rows", () => {
    const html = render();
    const arc = (2 * Math.PI * 45 * 0.6).toString();
    expect(html).toContain(`stroke-dasharray="${arc}`);
    expect(html).toContain("6 correct · 4 incorrect");
    expect(html).toContain("Chain Rule");
    expect(html).toContain("3 missed");
    expect(html).toContain("Practice these concepts now");
    expect(html).toContain("Retry wrong answers");
    expect(html).toContain("Maybe later");
    // Concept rows carry no action: the only buttons are close and the three below.
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html).not.toContain("<img");
  });

  it("keeps the score and explains while naming is pending", () => {
    const html = render({ concepts: [], namingPending: true, namingInFlight: true });
    expect(html).toContain("6/10");
    expect(html).toContain("still working out");
    expect(html).toContain("Finding the concepts behind your misses");
  });

  it("congratulates a clean attempt without an empty list", () => {
    const html = render({ score: 10, concepts: [] });
    expect(html).toContain("Nothing weak");
    expect(html).not.toContain("Concepts to focus on");
  });
});
