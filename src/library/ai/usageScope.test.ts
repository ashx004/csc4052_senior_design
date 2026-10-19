import { describe, expect, it } from "vitest";
import { currentAiUser, enterAiUser, runAsAiUser } from "./usageScope";

describe("AI user scope", () => {
  it("follows the flow across awaits and stays out of other flows", async () => {
    const seen: (string | undefined)[] = [];
    const route = async (uid: string) => {
      enterAiUser(uid);
      await new Promise((r) => setTimeout(r, 5));
      seen.push(currentAiUser());
    };
    await Promise.all([runAsAiUser("x", () => route("a")), runAsAiUser("y", () => route("b"))]);
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("is undefined when no route set one", () => {
    expect(runAsAiUser(undefined as unknown as string, () => currentAiUser())).toBeUndefined();
  });
});
