// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AttentionCard } from "./AttentionCard";
import { CostDonut } from "./CostDonut";
import { CostShareBar } from "./CostShareBar";
import { TruncatedNotice } from "./MissingDaysNotice";
import { StaleBanner } from "./StaleBanner";

afterEach(cleanup);

describe("StaleBanner", () => {
  const builtAt = "2026-10-29T23:40:00.000Z";

  it("renders nothing for live data", () => {
    const { container } = render(<StaleBanner builtAt={builtAt} source="live" staleReason={null} timeZone="UTC" />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("names the data's age and the quota reset when the quota is used up", () => {
    render(<StaleBanner builtAt={builtAt} source="snapshot" staleReason="quota" timeZone="UTC" />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Showing data from 29 Oct, 11:40 PM.");
    expect(banner.textContent).toContain(
      "Live update unavailable — daily Firestore quota used up. Resets at midnight Pacific.",
    );
  });
  it("says plainly that live data is unavailable for any other reason, with no quota wording", () => {
    for (const staleReason of ["unavailable", null, undefined] as const) {
      render(<StaleBanner builtAt={builtAt} source="snapshot" staleReason={staleReason} timeZone="UTC" />);
      const banner = screen.getByRole("status");
      expect(banner.textContent).toContain("Showing data from 29 Oct, 11:40 PM.");
      expect(banner.textContent).toContain("Live update unavailable right now.");
      expect(banner.textContent).not.toMatch(/quota|Pacific/);
      cleanup();
    }
  });
  it("shows the time in the zone it is given", () => {
    render(<StaleBanner builtAt={builtAt} source="snapshot" staleReason="quota" timeZone="America/Los_Angeles" />);
    expect(screen.getByRole("status").textContent).toContain("Showing data from 29 Oct, 4:40 PM.");
  });
});

describe("CostShareBar", () => {
  const fill = (container: HTMLElement) => container.querySelector("[data-share-fill]") as HTMLElement;

  it("CostShareBar renders a zero-width bar for a zero total without dividing by zero", () => {
    const { container } = render(<CostShareBar micros={0} totalMicros={0} />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(fill(container).style.width).toBe("0%");
    expect(screen.getByRole("img", { name: "0% of AI cost" })).toBeTruthy();
  });
  it("sizes the bar to the feature's share and says it in words", () => {
    const { container } = render(<CostShareBar micros={23_120_000} totalMicros={48_200_000} />);
    expect(screen.getByRole("img", { name: "48% of AI cost" })).toBeTruthy();
    expect(parseFloat(fill(container).style.width)).toBeCloseTo(47.97, 1);
  });
  it("never reads a real but tiny share as zero, and never overflows", () => {
    render(<CostShareBar micros={10} totalMicros={48_200_000} />);
    expect(screen.getByRole("img", { name: "<1% of AI cost" })).toBeTruthy();
    cleanup();
    const { container } = render(<CostShareBar micros={60} totalMicros={50} />);
    expect(fill(container).style.width).toBe("100%");
  });
});

describe("AttentionCard", () => {
  it("AttentionCard is a link an admin can tab to and read", () => {
    render(
      <AttentionCard
        tone="slow" label="Slowest" feature="quiz-generation"
        value="21.4 s" context="worst case (p95)" href="/admin/ai/slow"
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    const link = screen.getByRole("link", { name: /quiz-generation/ });
    expect(link.getAttribute("href")).toBe("/admin/ai/slow");
    expect(link.textContent).toContain("Slowest");
    expect(link.textContent).toContain("21.4 s");
    expect(link.textContent).toContain("worst case (p95)");
  });
  it("carries its tone", () => {
    for (const tone of ["slow", "cost", "fail"] as const) {
      render(<AttentionCard tone={tone} label="L" feature="chat" value="1" context="c" href="/x" />);
      expect(screen.getByRole("link").getAttribute("data-tone")).toBe(tone);
      cleanup();
    }
  });
  it("without an href is the same card, not a link, and says there is no detail page", () => {
    const { container } = render(
      <AttentionCard tone="cost" label="Most expensive" feature="brand-new" value="$1.00" context="10% of AI spend" href={null} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    const card = container.querySelector("[data-tone]") as HTMLElement;
    expect(card.getAttribute("data-tone")).toBe("cost");
    for (const text of ["Most expensive", "brand-new", "$1.00", "10% of AI spend", "No detail page is available for this feature."]) {
      expect(card.textContent).toContain(text);
    }
  });
});

describe("TruncatedNotice", () => {
  it("says some days are partial only when the report is truncated", () => {
    const { container } = render(<TruncatedNotice truncated={false} />);
    expect(container.innerHTML).toBe("");
    render(<TruncatedNotice truncated />);
    expect(screen.getByText("Some days hit the 20,000-request cap; figures for those days are partial.")).toBeTruthy();
  });
});

describe("CostDonut", () => {
  const slices = [
    { label: "chat", micros: 23_120_000, color: "#6b5bd2" },
    { label: "quiz-generation", micros: 8_310_000, color: "#b08957" },
    { label: "flashcard-generation", micros: 5_620_000, color: "#c97c4c" },
    { label: "practice-generation", micros: 4_900_000, color: "#8f84d9" },
    { label: "All others", micros: 6_250_000, color: "#9d937f" },
  ];

  it("CostDonut has an accessible description naming each slice and its share", () => {
    const { container } = render(<CostDonut slices={slices} />);
    const img = screen.getByRole("img");
    const name = img.getAttribute("aria-label") ?? "";
    expect(name).toContain("$48.20");
    for (const part of ["chat 48%", "quiz-generation 17%", "flashcard-generation 12%", "practice-generation 10%", "All others 13%"]) {
      expect(name).toContain(part);
    }
    expect(container.querySelectorAll("[data-slice]")).toHaveLength(5);
  });
  it("puts the total in the centre as dollars", () => {
    render(<CostDonut slices={slices} />);
    expect(screen.getByText("$48.20")).toBeTruthy();
    expect(screen.getByText("Total AI cost")).toBeTruthy();
  });
  it("draws a neutral ring and $0.00 for an all-zero total, never NaN", () => {
    const { container } = render(<CostDonut slices={slices.map((s) => ({ ...s, micros: 0 }))} />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getByText("$0.00")).toBeTruthy();
    expect(container.querySelectorAll("[data-slice]")).toHaveLength(0);
    expect(container.querySelector("[data-empty-ring]")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("chat 0%");
  });
  it("draws nothing for an empty slice", () => {
    const { container } = render(
      <CostDonut slices={[{ label: "chat", micros: 1_000_000, color: "#6b5bd2" }, { label: "ocr", micros: 0, color: "#b08957" }]} />,
    );
    expect(container.querySelectorAll("[data-slice]")).toHaveLength(1);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
