import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getReportingConfiguration } from "./analyticsReportingConfig";
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("GA4_TEST_PROPERTY_ID", "123");
  vi.stubEnv("GA4_PROPERTY_ID", "456");
  vi.stubEnv("GA4_PROPERTY_TIMEZONE", "America/Chicago");
  vi.stubEnv("GA4_CLIENT_EMAIL", "reporter@test.iam.gserviceaccount.com");
  vi.stubEnv("GA4_PRIVATE_KEY", privateKey);
});
afterEach(() => vi.unstubAllEnvs());

it("uses the isolated test property outside production", () => {
  expect(getReportingConfiguration().propertyId).toBe("123");
  vi.stubEnv("NODE_ENV", "production");
  expect(getReportingConfiguration().propertyId).toBe("456");
});
it("does not fall back to production when test reporting is missing", () => {
  vi.stubEnv("GA4_TEST_PROPERTY_ID", "");
  expect(getReportingConfiguration).toThrow("GA4_TEST_PROPERTY_ID");
});
it("accepts actual and escaped newlines in private keys", () => {
  expect(getReportingConfiguration().privateKey).toBe(privateKey.trim());
  vi.stubEnv("GA4_PRIVATE_KEY", privateKey.replace(/\n/g, "\\n"));
  expect(getReportingConfiguration().privateKey).toBe(privateKey.trim());
});
it("rejects invalid credentials without exposing the secret", () => {
  vi.stubEnv("GA4_PRIVATE_KEY", "private-secret-invalid");
  expect(getReportingConfiguration).toThrow(
    "The GA4 reporting private key is invalid.",
  );
});
it("rejects malformed property IDs and invalid timezones", () => {
  vi.stubEnv("GA4_TEST_PROPERTY_ID", "123/other");
  expect(getReportingConfiguration).toThrow("numeric GA4 property ID");
  vi.stubEnv("GA4_TEST_PROPERTY_ID", "123");
  vi.stubEnv("GA4_PROPERTY_TIMEZONE", "invalid");
  expect(getReportingConfiguration).toThrow("timezone is invalid");
});
