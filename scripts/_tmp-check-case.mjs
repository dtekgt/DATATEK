import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const repoRoot = "C:\\Users\\Dominic\\Documents\\GitHub\\DATATEK";
function loadEnvLocal() {
  const raw = readFileSync(path.join(repoRoot, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnvLocal();
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();
const { rows } = await client.query(
  `select c.id, c.folio_code, c.status, c.created_at, cu.display_name, v.primary_plate
     from cases c
     join customers cu on cu.id = c.customer_id
     join vehicles v on v.id = c.vehicle_id
    where cu.display_name = 'Cliente Puerta A Real'`,
);
console.log(JSON.stringify(rows, null, 2));
await client.end();
