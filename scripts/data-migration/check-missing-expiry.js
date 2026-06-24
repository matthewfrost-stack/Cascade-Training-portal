import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get sample of records without expiry_date
const { data: missing } = await supabase
  .from("staff_training_matrix")
  .select(
    `id, staff_id, course_id, completion_date, expiry_date, status,
     courses!inner(id, name, expiry_months)`
  )
  .is("expiry_date", null)
  .eq("status", "completed")
  .limit(20);

console.log("=== RECORDS WITHOUT EXPIRY_DATE ===\n");
missing?.forEach((r) => {
  console.log(`ID: ${r.id}`);
  console.log(`  Course: ${r.courses.name}`);
  console.log(`  Expiry Months: ${r.courses.expiry_months}`);
  console.log(`  Completion Date: ${r.completion_date}`);
  console.log(`  Status: ${r.status}`);
  console.log("");
});

// Count by status
const { data: countByStatus } = await supabase
  .from("staff_training_matrix")
  .select("status", { count: "exact" })
  .is("expiry_date", null);

console.log("\nTotal records without expiry_date:", countByStatus?.length);

// Check for null completion dates
const { data: nullCompletion } = await supabase
  .from("staff_training_matrix")
  .select("id, status, completion_date", { count: "exact" })
  .is("completion_date", null)
  .limit(5);

console.log("\nRecords with NULL completion_date:", nullCompletion?.length);
