import "server-only";

import { createPrivateKey } from "node:crypto";
import { ReportError } from "./analyticsReportContract";

export function getReportingPropertyId() {
  const isProduction = process.env.NODE_ENV === "production";
  const propertySetting = isProduction
    ? "GA4_PROPERTY_ID"
    : "GA4_TEST_PROPERTY_ID";
  const propertyId = process.env[propertySetting]?.trim();
  if (!propertyId || !/^\d+$/.test(propertyId)) {
    throw new ReportError(
      503,
      `Set ${propertySetting} to the numeric GA4 property ID.`,
    );
  }
  return propertyId;
}

export function getReportingConfiguration() {
  const propertyId = getReportingPropertyId();
  const timeZone = process.env.GA4_PROPERTY_TIMEZONE?.trim();
  const clientEmail = process.env.GA4_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!timeZone) {
    throw new ReportError(
      503,
      "Set GA4_PROPERTY_TIMEZONE to the property's timezone.",
    );
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw new ReportError(503, "The analytics reporting timezone is invalid.");
  }
  if (
    !clientEmail ||
    !/^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(clientEmail) ||
    !privateKey
  ) {
    throw new ReportError(
      503,
      "Configure the GA4 reporting service account email and private key.",
    );
  }
  try {
    if (createPrivateKey(privateKey).asymmetricKeyType !== "rsa")
      throw new Error();
  } catch {
    throw new ReportError(503, "The GA4 reporting private key is invalid.");
  }

  return { propertyId, timeZone, clientEmail, privateKey };
}
