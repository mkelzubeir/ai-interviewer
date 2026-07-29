import { expect, test, type Page } from "@playwright/test";

const RESUME = "Operations manager who led an intake redesign across three teams and cut duplicate requests by 28%.";
const JOB = "Strategic Projects Manager leading ambiguous cross-functional initiatives.";

/**
 * Seed a saved session, then reload into it.
 *
 * The app persists on every state change, so the seed must land *after* it has
 * hydrated — otherwise its own save effect races ahead and overwrites it.
 */
async function seedSession(page: Page, session: unknown) {
  await page.goto("interview");
  await expect(page.locator("#resume")).toBeVisible();
  await page.evaluate((s) => window.localStorage.setItem("ai-interviewer-phase-1-v2", JSON.stringify(s)), session);
  await page.reload();
}

async function fillBrief(page: Page) {
  await page.locator("#resume").fill(RESUME);
  await page.locator("#job").fill(JOB);
}

/** A v5 session mid-interview, seeded directly so recovery is testable without a live Realtime session. */
function interviewInProgress() {
  return {
    version: 5,
    phase: "interview",
    sampleMode: false,
    resume: RESUME,
    jobDescription: JOB,
    interviewType: "mixed",
    duration: 20,
    startedAt: Date.now(),
    questionBudget: 7,
    remainingBudget: 6,
    voiceTranscript: [
      { id: "i1", speaker: "interviewer", text: "Tell me about a rollout you owned.", timestamp: 1000, final: true, interrupted: false },
      { id: "c1", speaker: "candidate", text: "I led it across three regions and cut duplicates by 28%.", timestamp: 2000, final: true, interrupted: false },
    ],
    transcript: [],
    completedReport: null,
  };
}

test("the landing page leads with the voice interview", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Practice the interview");
  await expect(page.getByText("Live voice interview").first()).toBeVisible();
  await expect(page.getByText(/text-only/i)).toHaveCount(0);
  await expect(page.getByText(/no microphone needed/i)).toHaveCount(0);

  await page.getByRole("link", { name: /Start a voice interview/ }).click();
  await expect(page).toHaveURL(/\/ai-interviewer\/interview\/?$/);

  expect(failed, "no asset should 404 under the subpath").toEqual([]);
});

test("setup is a resume, a job description, and go", async ({ page }) => {
  await page.goto("interview");

  await expect(page.locator("#resume")).toBeVisible();
  await expect(page.locator("#job")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start voice interview/ })).toBeVisible();

  // No account step anywhere: no sign-in, no magic link, no saved reports.
  await expect(page.getByText(/sign in/i)).toHaveCount(0);
  await expect(page.getByText(/magic link/i)).toHaveCount(0);

  // What starting the interview sends is stated before it is sent.
  await expect(page.getByText(/sends your resume and job description, and your microphone audio, to OpenAI/i)).toBeVisible();
});

test("a sample brief fills both documents", async ({ page }) => {
  await page.goto("interview");
  await page.getByRole("button", { name: /Use a sample brief/ }).click();
  await expect(page.locator("#resume")).not.toHaveValue("");
  await expect(page.locator("#job")).not.toHaveValue("");
});

test("the interview cannot start without both documents", async ({ page }) => {
  await page.goto("interview");
  await page.locator("#resume").fill(RESUME);
  const start = page.getByRole("button", { name: /Start voice interview/ });
  if (await start.isDisabled()) return; // voice unavailable in this build; covered below
  await start.click();
  await expect(page.getByText(/Add both a resume and a job description/i)).toBeVisible();
});

test("there is no text interview anywhere in the flow", async ({ page }) => {
  await page.goto("interview");
  await fillBrief(page);

  // The old typed answer box and its controls must be gone for good.
  await expect(page.locator("#answer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Submit answer/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Skip question/ })).toHaveCount(0);
  await expect(page.getByText(/switch to text mode/i)).toHaveCount(0);

  await seedSession(page, interviewInProgress());
  await page.getByRole("button", { name: "Resume interview" }).click();
  await expect(page.locator("#answer")).toHaveCount(0);
});

test("voice readiness is reported honestly", async ({ page }) => {
  await page.goto("interview");
  await fillBrief(page);
  const start = page.getByRole("button", { name: /Start voice interview/ });
  const blockedReason = page.getByText(/Voice mode is not configured|anonymous sign-ins|Could not prepare a voice session/i);

  // Start is disabled while the anonymous session is still being established,
  // so settle first: either it becomes usable, or a reason is on screen.
  await expect
    .poll(async () => {
      if (!(await start.isDisabled())) return "ready";
      return (await blockedReason.count()) > 0 ? "blocked" : "pending";
    }, { timeout: 20_000 })
    .not.toBe("pending");

  if (await start.isDisabled()) {
    // Either the build has no token endpoint, or the session could not be
    // established. Both must say so rather than leaving a dead button.
    await expect(blockedReason.first()).toBeVisible();
    return;
  }

  await start.click();
  await expect(page.getByRole("heading", { name: /Ready for a spoken interview/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Allow microphone/ })).toBeVisible();
});

test("an interview in progress can be resumed, and its conversation survives", async ({ page }) => {
  await seedSession(page, interviewInProgress());

  await expect(page.getByRole("heading", { name: "Resume your interview?" })).toBeVisible();
  await page.getByRole("button", { name: "Resume interview" }).click();

  // The spoken turns recorded before the refresh are still on screen.
  await expect(page.getByText("Tell me about a rollout you owned.")).toBeVisible();
  await expect(page.getByText(/cut duplicates by 28%/)).toBeVisible();
});

test("ending a resumed interview produces a report from what was said", async ({ page }) => {
  await seedSession(page, interviewInProgress());
  await page.getByRole("button", { name: "Resume interview" }).click();

  await page.getByRole("button", { name: /End .*get report/ }).click();
  await page.getByRole("button", { name: "End and view report" }).click();

  await expect(page.getByRole("heading", { name: "Your practice report." })).toBeVisible();
  await expect(page.getByText("Overall practice score")).toBeVisible();
  // Built from the spoken conversation, not from an empty typed transcript.
  await expect(page.getByRole("heading", { name: "Question-by-question feedback" })).toBeVisible();
  await expect(page.getByText("Tell me about a rollout you owned.").first()).toBeVisible();
});

test("start over discards the saved session", async ({ page }) => {
  await seedSession(page, interviewInProgress());

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator("#resume")).toHaveValue("");
  await expect(page.locator("#job")).toHaveValue("");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Resume your interview?" })).toHaveCount(0);
});
