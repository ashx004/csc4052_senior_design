/**
 * Refunds a student's unused AI credit to their card(s).
 *
 *   npm run billing:refund -- student@school.edu         # shows the plan, changes nothing
 *   npm run billing:refund -- student@school.edu --yes   # does it
 *
 * Use this for every refund request instead of the Stripe dashboard: it works
 * out the refundable amount itself, pauses the student's AI while it runs,
 * refuses if a payment is disputed, and records the refund so the balance is
 * reduced exactly once. Accepts an email or a Firebase uid.
 */
import "./loadEnvironment";

async function main() {
  const [who] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const yes = process.argv.includes("--yes");
  if (!who) throw new Error("Usage: npm run billing:refund -- <email or uid> [--yes]");
  const { adminAuth } = await import("../src/library/firebaseAdmin");
  const { getWallet } = await import("../src/library/billing/wallet");
  const { refundUnusedCredit } = await import("../src/library/billing/refunds");
  const user = who.includes("@") ? await adminAuth.getUserByEmail(who) : await adminAuth.getUser(who);
  const usd = (m: number) => `$${(m / 1e6).toFixed(2)}`;
  const wallet = await getWallet(user.uid);
  console.log(`${user.email} (${user.uid}): balance ${usd(wallet.balanceMicros)}${wallet.heldMicros ? `, ${usd(wallet.heldMicros)} held by a running request` : ""}`);

  const result = await refundUnusedCredit(user.uid, { reason: "requested", dryRun: !yes });
  if (!result.items.length) return console.log("Nothing to refund.");
  for (const item of result.items) console.log(`  ${yes ? "refunded" : "would refund"} $${(item.cents / 100).toFixed(2)} on ${item.paymentIntentId}`);
  console.log(`${yes ? "Refunded" : "Would refund"} ${usd(result.refundedMicros)}; ${usd(result.leftoverMicros)} stays in the wallet (under a cent, or more than their purchases cover).`);
  if (!yes) console.log("Nothing changed. Add --yes to refund.");
}

main().then(() => process.exit(0), (error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
