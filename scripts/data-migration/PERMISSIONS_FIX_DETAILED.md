# Permissions & Header Fix - Complete Implementation Guide

## Overview
This document provides a complete explanation of the fixes implemented to resolve permission and header information issues in the training portal.

## Problems Solved

### Problem 1: Permissions Not Being Set Correctly
**Symptom:** After login, users' roles/permissions were not being retrieved or were lost.

**Impact:** 
- Users couldn't access role-based features
- Admin features wouldn't show for admin users
- Scheduler features wouldn't show for scheduler users

### Problem 2: Header Information Dropping During Navigation  
**Symptom:** User's name and role in the top-right header would disappear when navigating between routes.

**Impact:**
- Confusing user experience (appears logged out when still logged in)
- Header shows "Loading..." or "Profile" instead of actual name/role
- Creates support requests and confusion

## Root Cause Analysis

### What Was Happening

1. **Initial Load:**
   - User logs in successfully ✅
   - Session is created ✅
   - Profile API is called to get role_tier ✅
   - Profile is set in state with role_tier ✅

2. **Navigation or API Failure:**
   - User navigates to new route
   - Hooks re-initialize
   - Profile API called again
   - If API fails or is slow:
     - Old code: Error is thrown, profile is cleared ❌
     - User appears logged out ❌
     - Name and role disappear from header ❌

3. **Error Handling Issue:**
   - The profile hook had weak error handling
   - If profile API failed for any reason, the entire profile was lost
   - No fallback to session data
   - No retry mechanism

## Solution Architecture

### Three-Layer Defense

#### Layer 1: Session Fallback
**File:** `src/lib/useCurrentUserProfile.ts` - `loadProfile()` function

When the profile API fails:
- Keep the authenticated session
- Set profile with session data
- Set `role_tier: null` temporarily
- Log the error for monitoring

```typescript
// If fetch fails but we have session user, keep them logged in
if (sessionUser) {
  setIsAuthenticated(true);
  setProfile({
    id: sessionUser.id,
    full_name: sessionUser.user_metadata?.full_name || null,
    email: sessionUser.email || null,
    phone_number: null,
    avatar_path: null,
    role_tier: null,  // <- Placeholder, will be retried
    password_needs_change: null,
  });
  console.warn("Profile API failed, using fallback session data", fetchError);
  return;
}
```

**Benefits:**
- User stays logged in even if API is slow/fails
- System remains responsive
- No user confusion about being logged out

#### Layer 2: Automatic Retry with Backoff
**File:** `src/lib/useCurrentUserProfile.ts` - Secondary `useEffect`

Monitor the profile state and automatically retry if permission data is missing:

```typescript
useEffect(() => {
  if (!isAuthenticated || !profile || loading) return;
  
  // If we have a profile but critical permission data is missing, refresh
  if (profile.role_tier === null && profile.id) {
    const retryLoadProfile = async () => {
      // Add a small delay to avoid hammering the API
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadProfile();
    };
    
    retryLoadProfile();
  }
}, [isAuthenticated, profile, loading]);
```

**Benefits:**
- Automatically detects incomplete data
- Retries with 500ms delay (prevents API hammering)
- No user action required
- Transparent recovery

#### Layer 3: Header Component Trigger
**File:** `src/app/components/FixedHeader.tsx`

Double-check at the header level and trigger refresh if needed:

```typescript
// Auto-refresh profile if role_tier is missing when authenticated
useEffect(() => {
  if (isAuthenticated && !loading && profile && !roleTier && currentUserId) {
    console.log('Profile loaded but role_tier is missing, refreshing...');
    refreshProfile();
  }
}, [isAuthenticated, loading, profile, roleTier, currentUserId, refreshProfile]);
```

**Benefits:**
- Second line of defense
- Ensures header always has current data
- Visible logging for debugging

### Data Flow Diagram

```
User Login
    ↓
Create Session
    ↓
Call Profile API
    ↓
┌─────────────────────────────────────┐
│ API Success?                        │
└──────────┬──────────────────────────┘
           │
       YES  │  NO
           │   │
    ┌──────▼─┐ └─→ Fallback to Session Data
    │ Set    │      (role_tier = null)
    │ Profile│      │
    │ with   │      ├─→ Monitor Profile State
    │role_tier   │      ├─→ Detect role_tier = null
    └──────┬─────┘      ├─→ Retry after 500ms
           │            │
           └────────┬───┘
                    ↓
        ┌──────────────────────┐
        │ Header Component     │
        │ Double-checks and    │
        │ triggers refresh if  │
        │ needed              │
        └──────────────────────┘
                    ↓
        ┌──────────────────────┐
        │ Profile Fully Loaded │
        │ with role_tier       │
        │ Header Shows Info    │
        └──────────────────────┘
```

## Technical Details

### Modified Files

#### 1. `src/lib/useCurrentUserProfile.ts`

**Change 1: Graceful Fallback in Try Block**
- Location: Lines 68-109
- Purpose: Handle profile API failures without losing session
- Before: Threw error if API failed
- After: Falls back to session data

**Change 2: Graceful Fallback in Catch Block**
- Location: Lines 133-153
- Purpose: Handle fetch errors without losing authentication
- Before: Lost session if fetch threw error
- After: Preserves session, adds console warning

**Change 3: Auto-Retry Effect**
- Location: Lines 199-214
- Purpose: Automatically refresh profile if permissions are missing
- Before: No retry mechanism
- After: Detects `role_tier === null` and retries

#### 2. `src/app/components/FixedHeader.tsx`

**Change 1: Import refreshProfile**
- Location: Line 96
- Before: `const { profile, isAuthenticated, loading } = useCurrentUserProfile();`
- After: `const { profile, isAuthenticated, loading, refreshProfile } = useCurrentUserProfile();`

**Change 2: Add Header Refresh Trigger**
- Location: Lines 119-126
- Purpose: Detect missing permissions at header level and trigger refresh
- Condition: Authenticated AND not loading AND profile exists AND no roleTier
- Action: Call `refreshProfile()`

## Expected Behavior After Fix

### Scenario 1: Normal Login
```
User enters credentials
↓
Login succeeds
↓
Profile API called
↓
Profile loads with role_tier
↓
Header shows: "John Admin" with role "admin"
↓
Navigate to other pages
↓
Header stays showing: "John Admin" with role "admin" ✅
```

### Scenario 2: Slow Profile API
```
User enters credentials
↓
Login succeeds
↓
Profile API called (slow server)
↓
Timeout - Use fallback with role_tier = null
↓
Header shows: "John" (no role yet)
↓
Auto-retry after 500ms
↓
Profile API returns
↓
Profile updates with role_tier
↓
Header updates to: "John Admin" ✅
```

### Scenario 3: API Temporarily Down
```
User enters credentials
↓
Login succeeds
↓
Profile API called but server is down
↓
Use fallback session data
↓
User stays logged in with role_tier = null
↓
Header shows: "John" (no role)
↓
Auto-retry detected missing role_tier
↓
Keep retrying every 500ms
↓
API comes back online
↓
Profile API succeeds
↓
Profile updates with role_tier
↓
Header updates to: "John Admin" ✅
```

## Debugging Guide

### Console Messages to Expect

#### Normal Operation
```
✅ Silent (no messages)
- Profile API succeeds
- role_tier is populated
- No fallbacks needed
```

#### Profile API Had Issues
```
⚠️ "Profile API failed, using fallback session data: {error details}"
- Profile API failed or timed out
- Using session data as fallback
- Auto-retry will happen in 500ms
- This is normal, system recovering
```

#### Auto-Retry Detected Missing Permissions
```
🔄 "Profile loaded but role_tier is missing, refreshing..."
- Profile state has role_tier = null
- Auto-retry mechanism triggered
- Will call profile API again
- This is normal recovery
```

#### Real Error (Needs Investigation)
```
❌ "Error loading current user profile: {error details}"
- Unhandled error in profile loading
- User may be logged out
- Check:
  - Is profile API working?
  - Is user's database record valid?
  - Is role_tier field populated in database?
```

### How to Monitor in Production

1. **Check Console Logs:** Look for warning messages about profile failures
2. **Monitor API Health:** Track `/api/profile` endpoint response times
3. **Database Check:** Verify all users have `role_tier` populated
4. **User Feedback:** Monitor support tickets for "logged out" issues

## Testing Procedures

### Test 1: Happy Path
```bash
1. Login with valid admin credentials
2. Verify name and role appear in header
3. Navigate to 5 different pages
4. After each navigation, verify header info is still visible
5. Open DevTools Console - should see no errors
6. PASS: Header info persists throughout session
```

### Test 2: Slow API Simulation
```bash
1. Open DevTools → Network tab
2. Filter to XHR/Fetch requests
3. Add 3000ms delay to `/api/profile` request
4. Login
5. Watch: Name appears, then role appears after delay
6. Verify no "flickering" or disappearing text
7. PASS: User experiences brief loading, then complete profile
```

### Test 3: API Failure Recovery
```bash
1. Open DevTools → Network tab
2. Right-click `/api/profile` → Offline
3. Login (should use fallback)
4. Verify you're logged in but role shows as "User"
5. Right-click `/api/profile` → Online again
6. Wait 1-2 seconds
7. Role should appear in header
8. PASS: System recovered from API failure
```

### Test 4: Multiple Role Test
```bash
1. Login as admin → verify role shows "admin"
2. Logout
3. Login as staff → verify role shows "staff"
4. Logout
5. Login as scheduler → verify role shows "scheduler"
6. Navigate between pages as each role
7. Verify permissions are correct
8. PASS: Roles are correctly set and persist
```

## Database Considerations

### Required Setup
Ensure every user in the `profiles` table has:

```sql
SELECT id, email, full_name, role_tier FROM profiles;
```

All rows should have:
- `role_tier` NOT NULL
- `role_tier` IN ('admin', 'scheduler', 'manager', 'staff')

### Checking for Issues
```sql
-- Find users missing role_tier
SELECT id, email, full_name, role_tier 
FROM profiles 
WHERE role_tier IS NULL;

-- Fix missing role_tier
UPDATE profiles 
SET role_tier = 'staff' 
WHERE role_tier IS NULL;
```

## Performance Impact

### API Calls
- **Before:** 1 call per navigation/auth state change
- **After:** Same, plus retry calls if API fails
- **Impact:** Minimal - retry only happens if API fails

### Memory
- **Impact:** Negligible - no new data structures

### Network
- **Impact:** Potential extra API calls on failures
- **Mitigation:** Retry only if `role_tier === null` (detected issue)

## Rollback Plan

If issues occur after deployment:

```bash
# Revert the two modified files
git checkout src/lib/useCurrentUserProfile.ts
git checkout src/app/components/FixedHeader.tsx

# Deploy previous version
npm run build
npm run deploy
```

Changes are backward compatible, so no data migration needed.

## Migration Checklist

- [ ] Code review completed
- [ ] TypeScript compilation passes
- [ ] No console errors in dev environment
- [ ] Manual testing completed (all 4 test scenarios)
- [ ] Database checked for missing role_tier values
- [ ] Monitoring alerts configured for error messages
- [ ] Documentation shared with team
- [ ] Deployed to staging environment
- [ ] Staging testing completed
- [ ] Deployed to production
- [ ] Production monitoring verified

## Support & Troubleshooting

### User Reports "Lost Name and Role"
1. Check console for error messages
2. Verify user's profile has role_tier in database
3. Check if profile API is responding
4. Try clearing browser cache and re-login
5. Check network tab for failed API calls

### User Reports "Can't Access Feature"
1. Verify user's role_tier is correct in database
2. Check if profile API returned correct role_tier
3. Verify permissions configuration matches role
4. Check if feature requires specific role

### Continuous "Profile API failed" Messages
1. Check `/api/profile` endpoint health
2. Verify database connection is working
3. Check for timeout issues
4. Monitor server load during these failures
5. Scale up API if needed

---

**Last Updated:** 2026-06-02
**Status:** Ready for Production
**Backward Compatible:** ✅ Yes
**Breaking Changes:** ❌ None
