/**
 * V2.8 smoke: Credits Economy — search free, AI gated with confirm + ledger fields.
 */
import { promises as fs } from "fs";
import path from "path";
import {
  estimateCredits,
  getCreditsSummary,
  consumeCredits,
} from "../src/modules/account/credits/service";
import {
  guestMayUseCapability,
  capabilityRequiresLogin,
  isSearchFree,
  GUEST_CREDITS_ALLOWANCE,
} from "../src/modules/account/credits/policy";
import { gateAiUsage } from "../src/modules/account/credits/usage-guard";
import { guestAccountId } from "../src/modules/account/credits/guest-session";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const outDir = path.join(process.cwd(), ".nexa-data", "ai-tests");
  await fs.mkdir(outDir, { recursive: true });

  assert(isSearchFree(), "search must be free");

  const guestId = guestAccountId("smoke_guest_v28");
  const guestSummary = await getCreditsSummary(guestId, null, {
    isGuest: true,
    guestAllowance: GUEST_CREDITS_ALLOWANCE,
  });
  assert(guestSummary.balance >= GUEST_CREDITS_ALLOWANCE, "guest allowance");

  const guestGateNoConfirm = await gateAiUsage({
    account: {
      accountId: guestId,
      userId: null,
      isGuest: true,
    },
    capability: "aiOverview",
    confirm: false,
  });
  assert(
    !guestGateNoConfirm.ok && guestGateNoConfirm.code === "confirm_required",
    "confirm required"
  );

  const guestGateConfirm = await gateAiUsage({
    account: {
      accountId: guestId,
      userId: null,
      isGuest: true,
    },
    capability: "aiOverview",
    confirm: true,
    jobId: "job_smoke_overview",
  });
  assert(guestGateConfirm.ok, "guest overview gate ok");

  const guestResearch = await gateAiUsage({
    account: {
      accountId: guestId,
      userId: null,
      isGuest: true,
    },
    capability: "research",
    confirm: true,
  });
  assert(
    !guestResearch.ok && guestResearch.code === "login_required",
    "guest blocked from research"
  );

  assert(guestMayUseCapability("aiOverview"), "guest ai overview");
  assert(capabilityRequiresLogin("generateImage"), "image login required");

  const overviewEst = estimateCredits("aiOverview");
  assert(overviewEst.available && overviewEst.estimatedCredits === 3, "aiOverview cost");

  const researchEst = estimateCredits("research");
  assert(researchEst.available && researchEst.estimatedCredits === 15, "research cost");

  const userId = "user_smoke_v28_credits";
  await getCreditsSummary(userId, "user");

  const charge = await consumeCredits({
    userId,
    amount: 2,
    description: "smoke test consume",
    referenceType: "ai_capability",
    referenceId: "generateText",
    jobId: "job_smoke_gen",
    capability: "generateText",
  });
  assert(!("error" in charge), "consume ok");
  assert(charge.jobId === "job_smoke_gen", "ledger jobId");
  assert(charge.capability === "generateText", "ledger capability");
  assert(charge.jobStatus === "success", "ledger status");

  const after = await getCreditsSummary(userId, "user");
  const top = after.entries[0];
  assert(top?.jobId === "job_smoke_gen", "summary has jobId");

  const result = {
    at: new Date().toISOString(),
    searchFree: true,
    guestBalance: guestSummary.balance,
    confirmRequired: guestGateNoConfirm.code,
    guestResearchBlocked: guestResearch.code,
    aiOverviewCredits: overviewEst.estimatedCredits,
    ledgerSample: {
      jobId: charge.jobId,
      capability: charge.capability,
      jobStatus: charge.jobStatus,
      amount: charge.amount,
    },
    ok: true,
  };

  const outPath = path.join(outDir, "v2.8-credits-economy-smoke.json");
  await fs.writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
