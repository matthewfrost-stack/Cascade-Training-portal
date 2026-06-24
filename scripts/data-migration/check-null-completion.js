import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get records with NULL completion_date
const { data: nullCompletion } = await supabase
  .from("staff_training_matrix")
  .select(
    `id, staff_id, course_id, completion_date, expiry_date, status,
     courses!inner(id, name, expiry_months)`
  )
  .is("completion_date", null);

console.log("=== RECORDS WITH NULL COMPLETION_DATE ===\n");
console.log(`Total: ${nullCompletion?.length}\n`);

nullCompletion?.forEach((r) => {
  console.log(`ID: ${r.id}`);
  console.log(`  Course: ${r.courses.name}`);
  console.log(`  Status: ${r.status}`);
  console.log(`  Expiry Months: ${r.courses.expiry_months}`);
  console.log(`  Expiry Date: ${r.expiry_date}`);
  console.log("");
});

// Count by status
const { count: totalNull } = await supabase
  .from("staff_training_matrix")
  .select("status", { count: "exact" })
  .is("completion_date", null);

console.log(`Total records with NULL completion_date: ${totalNull}`);
