import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get records without expiry_date that belong to courses WITH expiry_months
const { data: missing } = await supabase
  .from("staff_training_matrix")
  .select(
    `id, course_id, completion_date, expiry_date, status,
     courses!inner(id, name, expiry_months)`
  )
  .is("expiry_date", null)
  .eq("status", "completed")
  .not("courses.expiry_months", "is", null)
  .limit(50);

console.log("=== RECORDS WITHOUT EXPIRY_DATE BUT COURSE HAS MONTHS ===\n");
console.log(`Found: ${missing?.length}\n`);

missing?.forEach((r) => {
  console.log(`ID: ${r.id}`);
  console.log(`  Course: ${r.courses.name}`);
  console.log(`  Expiry Months: ${r.courses.expiry_months}`);
  console.log(`  Completion Date: ${r.completion_date}`);
  console.log("");
});
