import { test, expect } from "@playwright/test";

// R0-B sección 12 — E2E smoke. Authored, not executed in this session (no
// browser binaries available). See docs/runbooks/local-development.md for
// how to run these on a machine with `pnpm e2e:install`.

test("sitio público abre y navega a Pro/Pass/Market", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Conocer Pro" }).click();
  await expect(page).toHaveURL(/\/pro$/);
});

test("Pro abre en desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/pro/o/dtek-servicios/dashboard");
  await expect(page.getByText("DEMO DATA")).toBeVisible();
});

test("Pro abre en móvil con bottom nav", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pro/o/dtek-servicios/dashboard");
  await expect(page.getByRole("navigation", { name: "Navegación inferior" })).toBeVisible();
});

test("Pass abre en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pass");
  await expect(page.getByText("DEMO DATA")).toBeVisible();
});

test("Market abre", async ({ page }) => {
  await page.goto("/market");
  await expect(page.getByRole("heading", { name: "Encuentra un taller" })).toBeVisible();
});

test("/a/[token-ficticio] muestra estado neutral sin exigir cuenta", async ({ page }) => {
  await page.goto("/a/demo-token");
  await expect(page.getByText(/No necesitas instalar una app/i)).toBeVisible();
  await expect(page.getByRole("textbox", { name: /contraseña|password/i })).toHaveCount(0);
});

test("token inválido no revela información y no simula éxito", async ({ page }) => {
  await page.goto("/a/not-a-real-token");
  await expect(page.getByText(/no se registró ninguna decisión/i)).toBeVisible();
});

test("una ruta planned no simula éxito", async ({ page }) => {
  await page.goto("/pro/o/dtek-servicios/inbox");
  await expect(page.getByText(/Planificado/i)).toBeVisible();
});

test("Control abre separado en el puerto 3001", async ({ page, baseURL }) => {
  await page.goto("http://localhost:3001/");
  await expect(page.getByText("Datatek Control")).toBeVisible();
  expect(baseURL).toContain("3000");
});
