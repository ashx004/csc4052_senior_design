import "./loadEnvironment";

async function main() {
  const [action, userId] = process.argv.slice(2);
  const hasValidAction = ["grant", "revoke", "status"].includes(action);
  if (!hasValidAction || !userId || process.argv.length !== 4) {
    throw new Error(
      "Usage: npm run admin:access -- grant|revoke|status FIREBASE_UID",
    );
  }

  const { adminAuth } = await import("../src/library/firebaseAdmin");
  const account = await adminAuth.getUser(userId);
  if (action === "status") {
    console.log(
      `Administrator access: ${account.customClaims?.admin === true && !account.disabled ? "enabled" : "disabled"}.`,
    );
    return;
  }
  if (action === "grant" && account.disabled) {
    throw new Error("Cannot grant administrator access to a disabled account.");
  }

  const updatedClaims = { ...account.customClaims };
  if (action === "grant") {
    updatedClaims.admin = true;
  } else {
    delete updatedClaims.admin;
  }
  await adminAuth.setCustomUserClaims(userId, updatedClaims);
  if (action === "revoke") await adminAuth.revokeRefreshTokens(userId);

  console.log(
    action === "grant"
      ? "Administrator access granted. Sign out and back in to refresh the token."
      : "Administrator access revoked. Existing sessions were revoked.",
  );
}

main().catch(() => {
  console.error(
    "Could not update administrator access. Use grant, revoke, or status with an existing Firebase UID and configured server credentials.",
  );
  process.exitCode = 1;
});
