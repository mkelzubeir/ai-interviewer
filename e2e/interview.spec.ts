import { expect, test, type Page } from "@playwright/test";

const answers = [
  "I led the redesign of our quarterly planning cycle after three teams missed the same dependency two quarters running. I interviewed the leads, mapped the handoffs, and proposed a single intake with shared criteria. Duplicate requests fell 28% over the following quarter.",
  "I owned the rollout decision. We had the option of a single cutover or a phased launch across three regions. I chose phased because the support team could only absorb one region of retraining at a time, and I measured readiness with a weekly ticket-backlog baseline.",
  "I decided to stop a workstream that was consuming two analysts for a report nobody opened. I checked usage logs first, confirmed it with the two nominal owners, and redirected the capacity to the intake process instead. That freed roughly 20% of the team's analytical time.",
];

const reportHeading = (page: Page) => page.getByRole("heading", { name: "Your practice report." });
const answerBox = (page: Page) => page.locator("#answer");
const submitButton = (page: Page) => page.getByRole("button", { name: /Submit answer/ });

/** Fill the current question and wait for the interview to advance (or finish). */
async function submitAnswer(page: Page, text: string) {
  const textarea = answerBox(page);
  await expect(textarea).toBeEnabled();
  await textarea.fill(text);
  await submitButton(page).click();
  // Sample mode deliberately pauses before advancing, then remounts the question
  // with a cleared textarea. The report replaces the textarea entirely.
  await expect
    .poll(
      async () => (await textarea.count()) === 0 || ((await textarea.inputValue()) === "" && (await submitButton(page).isEnabled())),
      { timeout: 15_000 },
    )
    .toBe(true);
}

async function startSampleInterview(page: Page) {
  await page.goto("interview");
  await page.getByRole("button", { name: "Try sample interview" }).click();
  await page.getByRole("button", { name: /Start interview/ }).click();
  await expect(page.getByText(/Deterministic sample demonstration/)).toBeVisible();
}

test("serves the whole app under the /ai-interviewer subpath", async ({ page }) => {
  const failedRequests: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
  });

  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Practice the interview");

  await page.getByRole("link", { name: /Begin a mock interview/ }).click();
  await expect(page).toHaveURL(/\/ai-interviewer\/interview\/?$/);
  await expect(page.getByRole("heading", { name: /Set the context/ })).toBeVisible();

  expect(failedRequests, "no asset should 404 under the subpath").toEqual([]);
});

test("the static demo hides server-only modes and defaults to the local engine", async ({ page }) => {
  await page.goto("interview");
  await expect(page.getByText(/static export with no server/)).toBeVisible();

  await startSampleInterview(page);
  // Voice needs a Realtime client secret from a server that the export does not have.
  await expect(page.getByText("Live voice interview")).toHaveCount(0);
});

test("completes a sample interview, recovers a mid-session refresh, and produces a report", async ({ page }) => {
  await startSampleInterview(page);

  const firstPrompt = await page.getByRole("heading", { level: 1 }).textContent();
  await submitAnswer(page, answers[0]);
  await expect(page.getByText(/^2 of ~\d+$/)).toBeVisible();

  // Mid-session refresh must offer recovery rather than silently restarting.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Resume your interview?" })).toBeVisible();
  await page.getByRole("button", { name: "Resume interview" }).click();

  await expect(page.getByText(/^2 of ~\d+$/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(firstPrompt ?? "");
  await expect(answerBox(page)).toHaveValue("");

  for (let turn = 1; turn <= 12; turn += 1) {
    if (await reportHeading(page).isVisible()) break;
    await submitAnswer(page, answers[turn % answers.length]);
  }

  await expect(reportHeading(page)).toBeVisible();
  await expect(page.getByText("Overall practice score")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Question-by-question feedback" })).toBeVisible();
  // The report is built from the transcript, including the answer given before
  // the refresh — proof that recovery restored state rather than restarting.
  await expect(page.getByText(answers[0]).first()).toBeVisible();
});

test("start over from the recovery prompt discards the saved session", async ({ page }) => {
  await startSampleInterview(page);
  await submitAnswer(page, answers[0]);

  await page.reload();
  await page.getByRole("button", { name: "Start over" }).click();

  await expect(page.getByRole("heading", { name: /Set the context/ })).toBeVisible();
  await expect(page.locator("#resume")).toHaveValue("");
  await expect(page.locator("#job")).toHaveValue("");

  // The discard must be durable, not just a dismissed dialog.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Resume your interview?" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Set the context/ })).toBeVisible();
});
