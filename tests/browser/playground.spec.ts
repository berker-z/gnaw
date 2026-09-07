import { test, expect } from "@playwright/test";

test("the jar: tap opens a task, set free removes it, add and split work, and it persists", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible();
  const count = page.getByRole("button", { name: "All the things on your mind" });
  await expect(count).toContainText("6");
  // The companion list reaches every task even when its creature is buried.
  await count.click();
  await expect(page.locator(".task")).toHaveCount(6);
  await page.getByRole("button", { name: "Send the invoice" }).click();
  await expect(page.getByRole("dialog", { name: "Task" })).toContainText(
    "PAST ITS DEADLINE",
  );
  await page.getByRole("button", { name: "Set free" }).click();
  await expect(count).toContainText("5");
  await expect(page.getByRole("status")).toContainText("Set free");
  // Undo brings it back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(count).toContainText("6");
  // Add with a deadline: it sleeps.
  await page.getByRole("button", { name: "Drop something in" }).click();
  await page.getByLabel("What is it?").fill("Call the bank");
  await page.getByLabel("Deadline").fill("2031-01-02");
  await page.getByLabel("Time").fill("15:45");
  await page.getByRole("button", { name: "Drop it in" }).click();
  await expect(count).toContainText("7");
  await count.click();
  await page.getByRole("button", { name: "Call the bank" }).click();
  await expect(page.getByRole("dialog", { name: "Task" })).toContainText(
    "Asleep until 02/01/2031 · 15:45",
  );
  // Split into three.
  await page.getByRole("button", { name: "Split" }).click();
  await page.getByRole("textbox", { name: "Step 1" }).fill("Find the number");
  await page.getByRole("textbox", { name: "Step 2" }).fill("Call");
  await page.getByRole("button", { name: "+ one more" }).click();
  await page.getByRole("textbox", { name: "Step 3" }).fill("Write down what they said");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("dialog", { name: "Split task" })).toContainText(
    "Split “Call the bank”?",
  );
  await page.getByRole("button", { name: "Split it" }).click();
  await expect(count).toContainText("9");
  // Tapping a creature on the canvas opens its task.
  await page.waitForTimeout(2500);
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.9);
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  // Survives a reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(count).toContainText("9");
  expect(errors).toEqual([]);
});
test("the playground keeps presets and dragging; the phone layout fits", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("canvas")).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile-jar.png" });
  await page.getByRole("button", { name: "Playground" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "A bit of a squish" }).click();
  await expect(page.getByRole("status")).toContainText("sorry");
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x + box.width * 0.3, y: box.y + box.height * 0.8 }],
  });
  for (let i = 1; i <= 12; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: box.x + box.width * (0.3 + i * 0.02),
          y: box.y + box.height * (0.8 - i * 0.025),
        },
      ],
    });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.getByRole("button", { name: "All done" }).click();
  await expect(page.getByRole("status")).toContainText("exhale");
  await page.getByRole("button", { name: "Reset the pile" }).click();
  await expect(page.getByRole("status")).toContainText("soft little pile");
  await page.screenshot({ path: "test-results/mobile-playground.png" });
  expect(errors).toEqual([]);
  await context.close();
});
