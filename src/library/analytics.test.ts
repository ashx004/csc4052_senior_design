import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const analyticsSdkMock = vi.hoisted(() => ({
  isSupported: vi.fn(),
  initializeAnalytics: vi.fn(),
  logEvent: vi.fn(),
  setAnalyticsCollectionEnabled: vi.fn(),
  setConsent: vi.fn(),
}));
vi.mock("firebase/analytics", () => analyticsSdkMock);
vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: () => ({ name: "test" }),
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: {
        pathname: "/courses/private-id",
        origin: "https://catalyst.test",
      },
    }),
  );
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONFIGURED", "true");
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_TEST_API_KEY", "test");
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_TEST_PROJECT_ID", "test");
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_TEST_MEASUREMENT_ID", "G-TEST");
  vi.stubEnv("NEXT_PUBLIC_ANALYTICS_TEST_APP_ID", "test-app");
  analyticsSdkMock.isSupported.mockResolvedValue(true);
  analyticsSdkMock.initializeAnalytics.mockReturnValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("consent and event delivery", () => {
  it("does not initialize before opt-in", async () => {
    const { track } = await import("./analytics");
    await track("quiz_started", { quiz_type: "full_quiz", question_count: 3 });
    expect(analyticsSdkMock.initializeAnalytics).not.toHaveBeenCalled();
  });

  it("initializes once, suppresses duplicates, and allows new attempts", async () => {
    const { track, setAnalyticsEnabled } = await import("./analytics");
    setAnalyticsEnabled(true);
    await Promise.all([
      track("quiz_started", { quiz_type: "full_quiz", question_count: 3 }, "a"),
      track("quiz_started", { quiz_type: "full_quiz", question_count: 3 }, "a"),
    ]);
    await track(
      "quiz_started",
      { quiz_type: "full_quiz", question_count: 3 },
      "b",
    );
    expect(analyticsSdkMock.initializeAnalytics).toHaveBeenCalledTimes(1);
    expect(analyticsSdkMock.logEvent).toHaveBeenCalledTimes(2);
    expect(analyticsSdkMock.logEvent.mock.calls[0][2]).toMatchObject({
      page_location: "https://catalyst.test/courses/[courseId]",
      page_referrer: "",
    });
    expect(JSON.stringify(analyticsSdkMock.logEvent.mock.calls)).not.toContain(
      "private-id",
    );
  });

  it("rejects unapproved properties at runtime", async () => {
    const { track, setAnalyticsEnabled } = await import("./analytics");
    setAnalyticsEnabled(true);
    await track("quiz_started", {
      quiz_type: "full_quiz",
      question_count: 3,
      // @ts-expect-error Deliberately invalid input tests runtime validation.
      email: "private",
    });
    expect(analyticsSdkMock.logEvent).not.toHaveBeenCalled();
  });

  it("stops collection after opt-out", async () => {
    const { track, setAnalyticsEnabled } = await import("./analytics");
    setAnalyticsEnabled(true);
    await track("page_view", { page_name: "/dashboard" });
    setAnalyticsEnabled(false);
    await track("page_view", { page_name: "/classes" });
    expect(analyticsSdkMock.logEvent).toHaveBeenCalledTimes(1);
    expect(
      analyticsSdkMock.setAnalyticsCollectionEnabled,
    ).toHaveBeenLastCalledWith({}, false);
  });

  it("drops an event if consent is withdrawn during initialization", async () => {
    let finishSupportCheck!: (value: boolean) => void;
    analyticsSdkMock.isSupported.mockImplementation(
      () =>
        new Promise<boolean>((done) => {
          finishSupportCheck = done;
        }),
    );
    const { track, setAnalyticsEnabled } = await import("./analytics");
    setAnalyticsEnabled(true);
    const pendingEvent = track("page_view", { page_name: "/dashboard" });
    await vi.waitFor(() => expect(finishSupportCheck).toBeTypeOf("function"));
    setAnalyticsEnabled(false);
    finishSupportCheck(true);
    await pendingEvent;
    expect(analyticsSdkMock.initializeAnalytics).not.toHaveBeenCalled();
  });

  it("absorbs initialization and sending failures", async () => {
    const { track, setAnalyticsEnabled } = await import("./analytics");
    setAnalyticsEnabled(true);
    analyticsSdkMock.isSupported.mockRejectedValueOnce(new Error("blocked"));
    await expect(
      track("page_view", { page_name: "/dashboard" }),
    ).resolves.toBeUndefined();
    analyticsSdkMock.logEvent.mockImplementationOnce(() => {
      throw new Error("offline");
    });
    await expect(
      track("page_view", { page_name: "/dashboard" }),
    ).resolves.toBeUndefined();
  });
});
