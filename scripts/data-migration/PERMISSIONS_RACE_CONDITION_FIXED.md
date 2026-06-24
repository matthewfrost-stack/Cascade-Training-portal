# Permission Race Condition - FIXED ✅

## Problem Identified

When navigating between pages, users were experiencing:
- **Stuck on "user loading"** state indefinitely
- **Admin page disappeared** (redirected away unexpectedly)
- **Permissions not working correctly** during page transitions

## Root Cause

Both the admin page (`/admin`) and admin-tools page (`/admin-tools`) were performing their own authentication checks using direct Supabase queries, instead of using the centralized `useCurrentUserProfile` hook. This created a **race condition**:

1. User navigates to `/admin` page
2. Page does its own direct Supabase query to fetch `role_tier`
3. If the query is slow or times out, `role_tier` is `null`
4. `hasPermission(null, 'ADMIN_DASHBOARD', 'canView')` returns `false` (because of the check `if (!userRole) return false`)
5. User gets redirected away before the real role loads
6. This creates an infinite loop or redirect loop

### Code Before (Problematic Pattern)

```tsx
// ❌ DON'T DO THIS - Direct Supabase queries without proper async handling
useEffect(() => {
  const runAuthCheck = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role_tier')
      .eq('id', currentUser.id)
      .single();
    const role = profile?.role_tier || null;
    
    // If role is null due to network delay, this redirects immediately
    if (!hasPermission(role, 'ADMIN_DASHBOARD', 'canView')) {
      router.push('/apps/booking-calendar');
      return;
    }
  };
  runAuthCheck();
}, [router]);
```

**Issues with this pattern:**
- No error handling for database queries
- Doesn't account for async load time
- No retry mechanism if role_tier is missing
- Creates duplicate auth logic across the app
- Can redirect before the actual role loads

## Solution Implemented

Both pages now use the centralized `useCurrentUserProfile()` hook which has built-in mechanisms to handle:
- Session fallback when API fails
- Auto-retry if role_tier is missing
- Proper async handling with `loading` state
- Prevents redirects during load

### Code After (Fixed Pattern)

```tsx
// ✅ USE CENTRALIZED HOOK - Proper async handling with fallbacks
const { profile, isAuthenticated, loading } = useCurrentUserProfile();

useEffect(() => {
  // Wait for auth to complete
  if (loading) return;

  // Not authenticated
  if (!isAuthenticated || !profile) {
    router.push('/login');
    return;
  }

  // Don't have permissions yet - wait for profile to fully load
  if (!profile.role_tier) {
    console.warn('Profile loaded but role_tier is missing, waiting...');
    return; // Don't redirect - just wait
  }

  // Now we can safely check permissions
  if (!hasPermission(profile.role_tier, 'ADMIN_DASHBOARD', 'canView')) {
    setAccessDenied(true);
    // Redirect after a brief delay
    const timeout = setTimeout(() => {
      router.push('/apps/booking-calendar');
    }, 2000);
    return () => clearTimeout(timeout);
  }
}, [loading, isAuthenticated, profile, router]);
```

**Benefits of this approach:**
- ✅ Waits for `loading` to complete before checking permissions
- ✅ Returns early if `role_tier` is still missing (doesn't redirect)
- ✅ Only redirects after user sees "Access Denied" message
- ✅ Uses centralized hook with all fallback mechanisms
- ✅ Consistent pattern across the application

## Files Modified

### 1. `/src/app/admin/page.tsx`
- **Removed:** Direct Supabase query for profile/role_tier
- **Removed:** User state management (`useState<User>`)
- **Added:** Import of `useCurrentUserProfile` hook
- **Added:** `accessDenied` state to show user-friendly message
- **Changed:** Permission check to use profile from hook
- **Changed:** Added guard clause to wait for `role_tier` before redirecting

### 2. `/src/app/admin-tools/page.tsx`
- **Removed:** Direct Supabase query for profile/role_tier
- **Removed:** User state management
- **Added:** Import of `useCurrentUserProfile` hook
- **Added:** `accessDenied` state
- **Changed:** Permission check to use profile from hook
- **Changed:** Added guard clause to wait for `role_tier` before redirecting

## How `useCurrentUserProfile` Handles Race Conditions

The hook has three layers of protection:

### Layer 1: Session Fallback
If the API call to `/api/profile` fails, it falls back to session data from Supabase auth.
```typescript
if (sessionUser) {
  setIsAuthenticated(true);
  setProfile({
    id: sessionUser.id,
    full_name: sessionUser.user_metadata?.full_name || null,
    email: sessionUser.email || null,
    role_tier: null, // Will be null initially
  });
  return;
}
```

### Layer 2: Auto-Retry on Missing Permissions
If the profile loaded but `role_tier` is null, it automatically retries after 500ms.
```typescript
useEffect(() => {
  if (profile.role_tier === null && profile.id) {
    const retryLoadProfile = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadProfile();
    };
    retryLoadProfile();
  }
}, [isAuthenticated, profile, loading]);
```

### Layer 3: Pages Wait for role_tier
Pages now check if `role_tier` exists before making permission decisions.
```typescript
if (!profile.role_tier) {
  console.warn('Profile loaded but role_tier is missing, waiting...');
  return; // Don't redirect - just wait
}
```

## Testing the Fix

### Scenario 1: Admin User Navigating to /admin
1. User clicks admin button
2. Page mounts, shows loading state
3. `useCurrentUserProfile` hook fetches profile
4. When role_tier loads and is 'admin':
   - `hasPermission` returns `true`
   - Admin page displays normally
5. ✅ **Result:** Admin page displays without redirects

### Scenario 2: Non-Admin User Navigating to /admin
1. User tries to access `/admin` directly
2. Page mounts, shows loading state
3. `useCurrentUserProfile` hook fetches profile
4. When role_tier loads and is NOT 'admin':
   - `hasPermission` returns `false`
   - "Access Denied" message shows for 2 seconds
   - User redirects to booking calendar
5. ✅ **Result:** Access denied message shown, then redirected

### Scenario 3: Network Delay Scenario
1. User navigates between pages rapidly
2. Profile API is slow to respond
3. Initially `role_tier` is null
4. Permission check returns `false`
5. **Old code:** Would redirect immediately ❌
6. **New code:** Waits for retry, gets correct role, displays page ✅

## Additional Safeguards

### Auto-Refresh in Header
The `FixedHeader.tsx` component has a trigger to refresh profile if role_tier is missing:
```typescript
useEffect(() => {
  if (isAuthenticated && profile && !loading && profile.role_tier === null) {
    refreshProfile();
  }
}, [isAuthenticated, profile, loading, refreshProfile]);
```

### Consistent Pattern
All protected pages should now follow this pattern:
1. Use `useCurrentUserProfile()` hook
2. Wait for `loading === false`
3. Check `isAuthenticated && profile`
4. Guard clause: `if (!profile.role_tier) return;`
5. Then check permissions
6. Show friendly error message before redirecting

## Result

✅ **Problem Solved:**
- No more "stuck loading" state
- No more unexpected redirects
- Admin page stays accessible to admin users
- Permissions load correctly during page transitions
- User sees clear "Access Denied" message if not authorized

## Next Steps

If you experience any other permission-related issues:

1. **Check the browser console** for any error messages
2. **Verify user role** in the `profiles` table in Supabase
3. **Check loading states** - pages should show loading first, then content
4. **Look for redirect loops** - inspect the network tab for multiple redirects

The fix ensures that all permission-based routing uses the centralized hook with proper async handling and fallback mechanisms.
