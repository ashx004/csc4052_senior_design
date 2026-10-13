import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RecoveryScreen from "./RecoveryScreen";

describe("RecoveryScreen", () => {
  it("uses the network recovery copy and exposes accessible recovery actions", () => {
    const markup = renderToStaticMarkup(
      <RecoveryScreen
        variant="network"
        primaryAction={{ label: "Try again", onClick: () => undefined }}
        secondaryAction={{ label: "Go to dashboard", href: "/dashboard" }}
      />
    );

    expect(markup).toContain("We&#x27;re having trouble connecting");
    expect(markup).toContain("Check your connection and try again.");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Try again");
    expect(markup).toContain('href="/dashboard"');
  });

  it("disables the primary action and communicates retry progress", () => {
    const markup = renderToStaticMarkup(
      <RecoveryScreen
        variant="server"
        primaryAction={{ label: "Try again", onClick: () => undefined }}
        isRetrying
      />
    );

    expect(markup).toContain("Trying again…");
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
  });

  it("allows contextual copy without exposing implementation details", () => {
    const markup = renderToStaticMarkup(
      <RecoveryScreen
        variant="unavailable"
        title="This study set isn't available"
        message="Choose another study set to continue learning."
      />
    );

    expect(markup).toContain("This study set isn&#x27;t available");
    expect(markup).toContain("Choose another study set to continue learning.");
  });
});
