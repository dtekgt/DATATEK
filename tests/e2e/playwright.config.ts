import { defineConfig, devices } from "@playwright/test";

// Authored per R0-B sección 12 (E2E smoke).
//
// POR QUÉ ESTOS TESTS NO SE HAN EJECUTADO NUNCA (R0-E Fase 4, corregido)
// ---------------------------------------------------------------------
// El comentario anterior decía "the environment has no browser binaries".
// Eso ya es FALSO y conviene no repetirlo: `pnpm e2e:install` sí corrió, y
// los binarios están en `%LOCALAPPDATA%\ms-playwright\chromium-1234\`
// (con sus marcas `INSTALLATION_COMPLETE` y `DEPENDENCIES_VALIDATED`).
//
// La razón real es otra, y es la MISMA que obliga a Next a compilar con el
// fallback WASM en vez de SWC nativo — una política de Application Control
// de Windows que bloquea la ejecución de binarios descargados:
//
//   > Start-Process chrome.exe --version
//   This command cannot be run due to the error:
//   An Application Control policy has blocked this file.
//
// Es decir: instalar más navegadores no lo arregla. En esta máquina
// `pnpm test:e2e` no puede correr, y ningún reporte debe declarar estos
// escenarios como verificados mientras siga así. La verificación por
// navegador que sí se hizo en R0-E Fase 4 se condujo manualmente contra el
// servidor de desarrollo, y está documentada en el reporte de esa fase con
// lo que cubre y lo que no.
//
// En una máquina sin esa política: `pnpm e2e:install && pnpm test:e2e`.
export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    // El puerto no está fijo a 3000: ese puerto suele estar ocupado por otro
    // proyecto en la máquina de desarrollo, y estos tests corrieron contra
    // 4177 durante R0-E. `PLAYWRIGHT_BASE_URL` permite apuntarlos sin editar
    // el archivo.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-pass", use: { ...devices["iPhone 13"] } },
  ],
});
