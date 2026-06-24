import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get records without expiry_date that belong to courses WITH expiry_months
const { data: missing, error } = await supabase
  .from("staff_training_matrix")
  .select(
    `id, course_id, completion_date, expiry_date, status,
     courses!inner(id, name, expiry_months)`,
    { count: "exact" }
  )
  .is("expiry_date", null)
  .eq("status", "completed")
  .not("courses.expiry_months", "is", null);

console.log(`Total records without expiry_date with courses that have months: ${missing?.length || 0}\n`);

if (missing && missing.length > 0) {
  console.log("Sample records:\n");
  missing.slice(0, 10).forEach((r) => {
    console.log(`ID ${r.id}: ${r.courses.name} (${r.courses.expiry_months}m, completion: ${r.completion_date})`);
  });
}
