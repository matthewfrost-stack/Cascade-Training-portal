# Matrix Sync: How It Works

## Overview
The Matrix Sync feature allows administrators to import training data from CSV files and update the training matrix for a specific location. It's a **partial update** system, not a complete overwrite.

## Key Points About Matrix Sync

### ❌ What It Does NOT Do
- ❌ Does NOT delete all existing records
- ❌ Does NOT completely overwrite the system
- ❌ Does NOT wipe out training records from other staff members not in the CSV

### ✅ What It DOES Do
- ✅ **Upserts** (insert or update) records from the CSV
- ✅ **Merges** CSV data with existing system data
- ✅ **Updates** display order based on CSV column positions
- ✅ **Creates** new courses if they don't exist (for allowlisted courses only)
- ✅ **Links** courses to the location based on CSV columns
- ✅ **Preserves** existing records for staff not in the CSV

## Workflow: Step by Step

### Step 1: Parse CSV File
```
User uploads CSV file for "Armfield" location
└─ System reads the CSV
└─ Finds the header row (Staff Name, Course1, Course2, ...)
└─ Extracts staff names and course data
```

### Step 2: Match Staff & Courses
```
For each staff name in CSV:
  ✓ Look up staff in database (normalize name)
  ✓ Skip if not found (tracked as "skipped")
  
For each course in CSV header:
  ✓ Look up course in location_training_courses table
  ✓ Match against course names
  ✓ Skip if not found (tracked as "skipped")
```

### Step 3: Process Each Cell
```
For each staff member × course cell in CSV:
  
  IF cell is empty:
    └─ Skip it
    
  IF cell contains a date (e.g., "01/01/2024"):
    ├─ Parse the date
    ├─ Calculate expiry date (based on course expiry_months)
    └─ Mark status as "allocated" with completion_date
    
  IF cell contains "Allocated":
    ├─ Update status to "allocated"
    └─ Keep existing completion_date if present
    
  IF cell contains "N/A":
    ├─ Update status to "na"
    └─ Clear completion_date
    
  IF cell contains "Not Yet Due":
    ├─ Update status to "not_yet_due"
    └─ Clear completion_date

THEN:
  └─ Upsert into staff_training_matrix table
```

### Step 4: Update Display Order
```
CSV column position → display_order in location_training_courses

Example:
  [Staff Name] [First Aid] [Child Safe] [Manual Handling]
       col 1      col 2       col 3         col 4
                ↓              ↓               ↓
          display_order: 2  display_order: 3  display_order: 4
```

## Database Interaction

### What Gets Updated
1. **staff_training_matrix** table
   - Upserts records: `(staff_id, location_id, course_id)`
   - Updates: `completion_date`, `expiry_date`, `status`
   - Preserves existing records not touched by CSV

2. **location_training_courses** table
   - Updates: `display_order` based on CSV column positions
   - Optionally creates new course links

3. **training_courses** table
   - Auto-creates courses only if in the allowlist
   - Currently, only "Level 3 Diploma in Residential Childcare" is allowlisted

### What Does NOT Get Deleted
- Records for staff members not in the CSV
- Existing data in other locations
- Historical completion dates and training records
- Any data outside the CSV import

## Data Handling Details

### Staff Name Normalization
```javascript
Input: "  John   Smith  " (with extra spaces)
       "Smith, John"     (Last, First format)
       "JOHN SMITH"      (different case)

Normalized to: "john smith" (lowercase, normalized)

Result: Matches against database "John Smith"
```

### Date Parsing
```javascript
Supported Format: DD/MM/YYYY

Examples:
  "01/01/2024" → 2024-01-01
  "31/12/2023" → 2023-12-31
  "Invalid" → Skipped

Expiry Calculation:
  completion_date: 2024-01-01
  course expiry_months: 12
  → expiry_date: 2025-01-01
```

### Ignored Columns
These columns in the CSV are skipped (not imported):
- Start Date
- End Date
- Induction
- Job Role
- DBS / D B S
- Qualifications Upon Entry
- Care Certificate
- OFSTED Only Training
- And others...

This allows you to include metadata columns without importing them.

### Divider Rows
These rows are skipped if found in the CSV:
- Notes
- Date Valid For
- Management
- Team Leaders
- Lead Support
- Staff Team
- Staff on Probation
- Inactive Staff
- Staff on Maternity
- Bank Staff

Allows you to organize the CSV with section headers.

## API Endpoint

### Endpoint
```
POST /api/training-matrix/import-csv
Content-Type: multipart/form-data

Parameters:
  - locationId (string): UUID of the location
  - file (File): CSV file
```

### Response Format
```json
{
  "rows": 150,                    // Total data rows processed
  "processedCells": 1500,         // Total cells examined
  "upserts": 1248,                // Records inserted/updated
  "skippedUnknownStaff": 5,       // Staff names not found in DB
  "skippedUnknownCourses": 12,    // Course names not found for location
  "errors": 0                     // Unhandled errors
}
```

### Error Handling
- Unknown staff names are skipped but counted
- Unknown courses are skipped but counted
- Invalid dates are silently skipped
- Duplicate entries are handled by upsert (last one wins)
- Empty cells are ignored

## CSV Format Example

```csv
Staff Name,First Aid,Manual Handling,Level 3,Notes
John Smith,01/01/2024,15/03/2023,,Updated Jan 2024
Sarah Jones,Allocated,Not Yet Due,12/12/2023,
Mike Brown,N/A,N/A,,
,Not Yet Due calculation note:,
Jane Patel,31/12/2023,Allocated,,
```

### Required Columns
- **First column**: Staff Name (Required header text)
  - Aliases: "Staff Name", "Learner Name", "Learner's Name"
  
- **Remaining columns**: Course Names
  - Matched against location_training_courses table
  - Column position determines display_order

### Valid Cell Values
| Value | Result |
|-------|--------|
| Empty | Ignored |
| `01/01/2024` | Date → status: "allocated" |
| `Allocated` | Status: "allocated" |
| `Not Yet Due` | Status: "not_yet_due" |
| `N/A` | Status: "na" |
| Other text | Ignored |

## Location-Specific Import

### Important: Location Filtering
The import is **location-specific**:

```javascript
// Only courses configured for THIS location are imported
const locationCourses = await supabase
  .from('location_training_courses')
  .select('training_course_id, training_courses(...)')
  .eq('location_id', locationId)  ← Filtered by location
```

**This means:**
- ✓ Importing for "Armfield" won't affect "Felix Group"
- ✓ Courses must be linked to the location first
- ✓ Each location has independent staff training records

### Linking Courses to Locations

Before importing, ensure courses are linked in `location_training_courses`:

```sql
-- Example: Link "First Aid" course to "Armfield" location
INSERT INTO location_training_courses (location_id, training_course_id)
VALUES ('armfield-uuid', 'first-aid-uuid');
```

## Workflow Diagram

```
┌─────────────────────┐
│ Upload CSV File     │
├─ Location ID        │
├─ CSV Content        │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Parse CSV           │
├─ Find header row    │
├─ Extract staff      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ For Each Staff Member (data row)    │
├─ Normalize name                     │
├─ Look up staff_id in database       │
├─ If not found: Skip, count as error │
└────────┬────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ For Each Course (column header)      │
├─ Normalize course name              │
├─ Look up course in location         │
├─ If not found: Skip, count as error │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ For Each Cell (staff × course)       │
├─ Interpret cell value               │
├─ Parse date if needed               │
├─ Calculate expiry if applicable     │
├─ Create upsert record               │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Batch Upsert to Database             │
├─ staff_training_matrix              │
├─ Preserve existing records           │
├─ Update display_order               │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Return Summary                       │
├─ Rows processed                     │
├─ Cells processed                    │
├─ Upserts completed                  │
├─ Errors/Skipped                     │
└──────────────────────────────────────┘
```

## Common Scenarios

### Scenario 1: Update Existing Training Completion Dates
```
Current DB:
  John Smith × First Aid: completion_date=null, status=na

CSV Import:
  John Smith, 01/01/2024

Result:
  John Smith × First Aid: completion_date=2024-01-01, status=allocated, expiry_date=2025-01-01
```

### Scenario 2: Add New Courses for Location
```
Current DB:
  Armfield location has: First Aid, Manual Handling
  Felix location has: First Aid, Manual Handling, Child Safe

CSV Import for Armfield:
  Header: Staff Name, First Aid, Manual Handling, Child Safe

Result:
  Child Safe is skipped (not in Armfield's courses)
  Only First Aid and Manual Handling are updated
```

### Scenario 3: Preserve Existing Data
```
Current DB:
  Sarah Jones × First Aid: status=allocated, completion_date=2023-01-01
  Sarah Jones × Manual Handling: status=na

CSV Import:
  Sarah Jones, [empty], [empty]

Result:
  Sarah Jones × First Aid: UNCHANGED (empty cell = skip)
  Sarah Jones × Manual Handling: UNCHANGED (empty cell = skip)
  
  Previous data is preserved!
```

### Scenario 4: Bulk Status Changes
```
CSV Import:
  John Smith, N/A, N/A, N/A
  (Mark all training as Not Applicable)

Result:
  All of John's training records: status=na, completion_date=null
```

## Safety Features

1. **Selective Import**: Only touches rows/columns in CSV
2. **Location Isolation**: Only affects one location at a time
3. **Upsert Logic**: Merges with existing data, doesn't overwrite
4. **Error Tracking**: Counts unknown staff/courses for review
5. **Validation**: Checks dates, skips invalid entries
6. **Admin Only**: Requires admin role to access
7. **Batch Operations**: Reduces transaction load

## Troubleshooting

### Problem: Staff not being imported
**Solution**: 
- Check staff names match exactly (case-insensitive but spelling must match)
- Verify staff is not marked as `is_deleted = true`
- Check for extra spaces in CSV or database

### Problem: Courses not being imported
**Solution**:
- Verify courses are linked to the location in `location_training_courses`
- Check course names match exactly
- Look for extra spaces or special characters

### Problem: Dates showing as N/A
**Solution**:
- Verify CSV date format is DD/MM/YYYY
- Check that course has `expiry_months` configured
- If course is "never expires", dates won't be calculated

### Problem: Expected more records to update
**Solution**:
- Import is location-specific; verify correct location was selected
- Empty cells are skipped; check CSV has data
- Staff not in CSV are preserved; import won't touch them
- Check the summary for skipped staff/courses

---

**Bottom Line:** Matrix Sync is a **safe, selective, merge-based import** that updates the training matrix with CSV data while preserving existing records.
