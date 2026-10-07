// Run with: node --env-file=.env.local --import tsx scripts/setAdmin.ts grant|revoke FIREBASE_UID
async function main() {
  const [action, userId] = process.argv.slice(2);
  const hasValidAction = action === "grant" || action === "revoke";
  if (!hasValidAction || !userId || process.argv.length !== 4) {
    throw new Error("Usage: setAdmin.ts grant|revoke FIREBASE_UID");
  }

  const { adminAuth } = await import("../src/library/firebaseAdmin");
  const account = await adminAuth.getUser(userId);

  const updatedClaims = { ...account.customClaims };
  if (action === "grant") {
    updatedClaims.admin = true;
  } else {
    delete updatedClaims.admin;
  }
  await adminAuth.setCustomUserClaims(userId, updatedClaims);

  if (action === "revoke") {
    await adminAuth.revokeRefreshTokens(userId);
  }

  if (action === "grant") {
    console.log(
      "Administrator access granted. Sign out and back in to refresh the token.",
    );
  } else {
    console.log(
      "Administrator access revoked. Existing sessions were revoked.",
    );
  }
}

main().catch(() => {
  console.error(
    "Could not update administrator access. Check arguments, server credentials, and the existing Firebase UID.",
  );
  process.exitCode = 1;
});
