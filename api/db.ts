// api/db.ts
import { Pool } from "pg";

const url = process.env.DATABASE_URL!;
console.log("DATABASE_URL:", url.replace(/\/\/.*?:.*?@/, "//***:***@"));

export const pool = new Pool({
  connectionString: url,
  // ssl: false  // no lo necesitas localmente, pero si lo llegas a usar en cloud, ajusta aquí
});

pool.on("error", (e) => console.error("PG POOL ERROR:", e));

(async () => {
  try {
    const r = await pool.query("select 1 as ok");
    console.log("PG CONNECT OK:", r.rows[0]);
  } catch (e: any) {
    console.error("PG CONNECT FAIL:", e.message);
  }
})();
