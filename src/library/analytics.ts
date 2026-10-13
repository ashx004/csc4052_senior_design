"use client";

import type { Analytics } from "firebase/analytics";
import type { FirebaseOptions } from "firebase/app";
import {
  eventSchemas,
  normalizeAnalyticsPath,
  type AnalyticsEvent,
  type EventProperties,
} from "./analyticsContract";

const ANALYTICS_APP_NAME = "catalyst-analytics";
const MAX_REMEMBERED_EVENTS = 2000;
let analyticsInstance: Analytics | undefined;
let analyticsSdk: typeof import("firebase/analytics") | undefined;
let initializationPromise: Promise<Analytics | null> | undefined;
let activeUserId: string | null = null;
let activeSession = 0;
let collectionEnabled = false;
let consentChangeCount = 0;
const sentEventKeys = new Set<string>();

export function analyticsEnabled(): boolean {
  return typeof window !== "undefined" && collectionEnabled;
}

function syncCollectionWithConsent() {
  if (!analyticsInstance || !analyticsSdk) return;

  const enabled = analyticsEnabled();
  analyticsSdk.setAnalyticsCollectionEnabled(analyticsInstance, enabled);
  analyticsSdk.setConsent({
    analytics_storage: enabled ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

export function setAnalyticsEnabled(enabled: boolean, session = activeSession) {
  if (session !== activeSession) return;
  collectionEnabled = enabled;
  consentChangeCount += 1;
  try {
    syncCollectionWithConsent();
  } catch {
    // The local consent check still blocks events when the SDK is unavailable.
  }
}

export function setAnalyticsUser(userId: string | null): number {
  if (userId !== activeUserId) {
    activeUserId = userId;
    activeSession += 1;
    setAnalyticsEnabled(false);
    sentEventKeys.clear();
  }
  return activeSession;
}

function getAnalyticsConfiguration(): FirebaseOptions | null {
  if (process.env.NEXT_PUBLIC_ANALYTICS_CONFIGURED !== "true") {
    return null;
  }

  let configuration: FirebaseOptions;
  if (process.env.NODE_ENV === "production") {
    configuration = {
      measurementId: process.env.NEXT_PUBLIC_ANALYTICS_MEASUREMENT_ID,
      appId: process.env.NEXT_PUBLIC_ANALYTICS_APP_ID,
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      projectId: "studora-933f8",
    };
  } else {
    configuration = {
      measurementId: process.env.NEXT_PUBLIC_ANALYTICS_TEST_MEASUREMENT_ID,
      appId: process.env.NEXT_PUBLIC_ANALYTICS_TEST_APP_ID,
      apiKey: process.env.NEXT_PUBLIC_ANALYTICS_TEST_API_KEY,
      projectId: process.env.NEXT_PUBLIC_ANALYTICS_TEST_PROJECT_ID,
    };
  }

  if (!configuration.apiKey || !configuration.projectId) {
    return null;
  }
  if (!configuration.measurementId || !configuration.appId) {
    return null;
  }
  return configuration;
}

function getSafePageProperties(page: string) {
  return {
    page_location: `${window.location.origin}${page}`,
    page_title: page,
    page_referrer: "",
  };
}

async function initializeConfiguredAnalytics(configuration: FirebaseOptions) {
  const sdk = await import("firebase/analytics");
  const browserIsSupported = await sdk.isSupported();
  if (!browserIsSupported || !analyticsEnabled()) {
    return null;
  }

  const { initializeApp, getApps } = await import("firebase/app");
  if (!analyticsEnabled()) {
    return null;
  }

  let analyticsApp = getApps().find((app) => app.name === ANALYTICS_APP_NAME);
  if (!analyticsApp) {
    analyticsApp = initializeApp(configuration, ANALYTICS_APP_NAME);
  }

  sdk.setConsent({
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  const page = normalizeAnalyticsPath(window.location.pathname);
  analyticsInstance = sdk.initializeAnalytics(analyticsApp, {
    config: {
      ...getSafePageProperties(page),
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    },
  });
  analyticsSdk = sdk;
  syncCollectionWithConsent();
  return analyticsInstance;
}

async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (!analyticsEnabled()) {
    return null;
  }

  const configuration = getAnalyticsConfiguration();
  if (!configuration) {
    return null;
  }
  if (analyticsInstance) {
    return analyticsInstance;
  }

  if (!initializationPromise) {
    initializationPromise = initializeConfiguredAnalytics(configuration)
      .catch(() => null)
      .finally(() => {
        initializationPromise = undefined;
      });
  }
  return initializationPromise;
}

function rememberSentEvent(key: string) {
  sentEventKeys.add(key);
  if (sentEventKeys.size <= MAX_REMEMBERED_EVENTS) {
    return;
  }

  const oldestKey = sentEventKeys.values().next().value;
  if (oldestKey) {
    sentEventKeys.delete(oldestKey);
  }
}

/** The local attempt key is never sent to Google. */
export async function track<EventName extends AnalyticsEvent>(
  name: EventName,
  properties: EventProperties<EventName>,
  localAttemptKey?: string,
): Promise<void> {
  if (!analyticsEnabled()) {
    return;
  }

  const validation = eventSchemas[name]?.safeParse(properties);
  if (!validation?.success) {
    return;
  }

  const consentChangesWhenRequested = consentChangeCount;
  let page = normalizeAnalyticsPath(window.location.pathname);
  if ("page_name" in validation.data) {
    page = validation.data.page_name;
  }

  try {
    const analytics = await getAnalyticsInstance();
    const consentChangedWhileWaiting =
      consentChangesWhenRequested !== consentChangeCount;
    if (
      !analytics ||
      !analyticsSdk ||
      !analyticsEnabled() ||
      consentChangedWhileWaiting
    ) {
      return;
    }

    let eventKey = "";
    if (localAttemptKey) {
      eventKey = `${name}:${localAttemptKey}`;
    }
    if (eventKey && sentEventKeys.has(eventKey)) {
      return;
    }

    const eventProperties: Record<string, string | number | boolean> = {
      ...validation.data,
      ...getSafePageProperties(page),
    };
    if (process.env.NODE_ENV !== "production") {
      eventProperties.debug_mode = true;
    }

    analyticsSdk.logEvent(analytics, name as string, eventProperties);

    if (eventKey) {
      rememberSentEvent(eventKey);
    }
  } catch {
    // Tracking is best effort and must never interrupt the user's workflow.
  }
}
