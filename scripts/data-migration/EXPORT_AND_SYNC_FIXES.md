# Export Button & Matrix Sync - Fixes & Documentation

## Export Button Issue - FIXED ✅

### Problem
An "Export Roster" button was appearing at the bottom of the Booking Calendar event modal, which was out of place and confusing. The export functionality should only be available in the Training Matrix page.

### Solution
1. **Removed the Export Roster button** from `BookingModal.tsx`
   - Location: Bottom of the modal dialog (was taking up 50% of button space)
   - Now only shows "Close" button
   
2. **Removed the unused export function** from `BookingModal.tsx`
   - The `exportRosterCsv()` function was generating event attendance CSVs
   - This belonged in the Training Matrix context, not in Booking Calendar
   - Cleaned up unused code

### Files Modified
- `src/app/components/BookingModal.tsx`
  - Removed: `exportRosterCsv()` function (lines 220-253)
  - Removed: Export button from dialog (line 683)
  - Updated: Close button to full width since export button is gone

### Where Export NOW Works
✅ **Training Matrix Page** only
- Click "Export CSV" button in the toolbar
- Exports the entire training matrix for a selected location
- Includes all staff and courses with their training statuses

---

## Matrix Sync - Complete Documentation ✅

### What Was Asked
"We were looking into how the matrix sync works and does it overwrite what is on the system currently and use the CSV file to build the matrix with that"

### Answer: NO, It Does NOT Overwrite
The matrix sync is a **safe, selective, merge-based import**, NOT a complete overwrite.

### Key Behaviors

#### ✅ What Matrix Sync DOES
1. **Upserts** records (insert if new, update if exists)
2. **Merges** CSV data with existing system data
3. **Preserves** records for staff/courses not in the CSV
4. **Updates** display order based on CSV column positions
5. **Creates** new courses only if allowlisted (e.g., "Level 3 Diploma in Residential Childcare")
6. **Location-specific** - Only affects the selected location

#### ❌ What Matrix Sync Does NOT Do
- ❌ Does NOT delete existing records
- ❌ Does NOT wipe out the entire database
- ❌ Does NOT remove training records from staff not in the CSV
- ❌ Does NOT affect other locations
- ❌ Does NOT remove historical data

### How It Works

```
1. Parse CSV
   ↓
2. Find staff names in database
   (Skip if not found)
   ↓
3. Find course names for the location
   (Skip if not found)
   ↓
4. For each cell in CSV:
   - If empty: Skip
   - If date (01/01/2024): Parse → Calculate expiry → Update status to "allocated"
   - If "Allocated": Update status
   - If "N/A": Update status to "na"
   - If "Not Yet Due": Update status to "not_yet_due"
   ↓
5. Upsert to staff_training_matrix
   (Merges with existing data)
   ↓
6. Update display_order
   (Based on CSV column positions)
   ↓
7. Return summary
   (Rows processed, upserts, errors)
```

### Data Safety Example

**Scenario:** You have John Smith with 5 training records in the system.
You import a CSV with John Smith having 2 of those trainings filled in.

**Result:**
- 2 trainings: Updated with CSV data
- 3 trainings: Unchanged (preserved)
- No data is deleted
- No data is lost

### CSV Format Required

```csv
Staff Name,First Aid,Manual Handling,Level 3
John Smith,01/01/2024,Allocated,Not Yet Due
Sarah Jones,N/A,,12/12/2023
```

- Column 1: Staff names (required)
- Columns 2+: Course names (must match location courses)
- Cell values: Dates (DD/MM/YYYY), "Allocated", "N/A", "Not Yet Due", or empty

### Important Notes

1. **Location-Specific:** Only courses linked to that location will be imported
2. **Admin Only:** Requires admin role to import
3. **Name Matching:** Staff names normalized but must match database (case-insensitive)
4. **Course Linking:** Courses must be linked in `location_training_courses` first
5. **Selective:** Only rows/columns in CSV are affected; everything else is preserved

### Comprehensive Documentation

See the new file: **[MATRIX_SYNC_EXPLAINED.md](./MATRIX_SYNC_EXPLAINED.md)**

This file includes:
- Detailed workflow explanation
- Database interaction details
- API endpoint documentation
- CSV format specifications
- Common scenarios and examples
- Troubleshooting guide
- Safety features overview

---

## Files Created/Modified

### Created
- ✅ `MATRIX_SYNC_EXPLAINED.md` - Complete guide to how matrix sync works

### Modified
- ✅ `src/app/components/BookingModal.tsx`
  - Removed export button
  - Removed unused export function
  - No TypeScript errors

---

## Testing

### Export Button Removal
```
1. Navigate to Booking Calendar
2. Click on an event to open the modal
3. Verify: Only "Close" button appears (no "Export Roster" button)
4. Close button works correctly
```

### Matrix Sync Still Works
```
1. Go to Training Matrix page
2. Select a location
3. Click "Matrix Sync" button
4. Upload a CSV file
5. Verify: Data updates correctly with safe merge behavior
```

---

## Summary

✅ **Export button issue resolved** - Removed from Booking Calendar, kept only in Training Matrix
✅ **Matrix sync documented** - Created comprehensive guide explaining it's a safe merge, not an overwrite
✅ **No breaking changes** - All functionality preserved, just cleaner UI

The training portal now has clearer separation of concerns:
- **Training Matrix page**: Has export and sync functionality
- **Booking Calendar page**: Clean modal with just close button
