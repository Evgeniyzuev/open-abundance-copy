import { expect, test } from "@playwright/test";

test("app shell renders", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("navigation", { name: /Main navigation|Основная навигация/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: /Nested navigation|Вложенная навигация/i })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
