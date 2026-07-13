'use client';

import { useState, useEffect } from 'react';
import UniformButton from './UniformButton';
import { supabase } from '@/lib/supabase';
import { hasPermission } from '@/lib/permissions';
import { debugLog, debugWarn } from '@/lib/debug';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';
import AdminResetPasswordModal from './AdminResetPasswordModal';

export default function AddStaffModal({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [locations, setLocations] = useState<any[]>([]);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);
  // Role comes from the shared profile hook (/api/profile with cookie fallback)
  // instead of a client-side supabase.auth.getUser(), which returned null when
  // the browser session wasn't attached — showing the role as "Unknown" and
  // denying access even to admins.
  const { profile, loading: roleLoading } = useCurrentUserProfile();
  const userRole = profile?.role_tier ?? null;
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState('');
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [showResetPasswordModal, setShowResetPasswordModal] = useState<{ userId: string; userName: string } | null>(null);
  
  const [formData, setFormData] = useState({ 
    full_name: '', 
    email: '', 
    home_house: '', 
    role_tier: 'staff' as 'staff' | 'manager' | 'scheduler' | 'admin',
    managed_houses: [] as string[],
    password: ''
  });

  const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test((value || '').trim());

  const resolveLocationId = (value: string): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (isUuid(trimmed) && locations.some(loc => loc.id === trimmed)) return trimmed;
    return locations.find(loc => (loc.name || '').trim().toLowerCase() === trimmed.toLowerCase())?.id || '';
  };

  const resolveLocationName = (value: string): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (isUuid(trimmed)) {
      return locations.find(loc => loc.id === trimmed)?.name || trimmed;
    }
    return trimmed;
  };

  const canonicalCourseName = (value: string): string =>
    (value || '')
      .replace(/\s+\(Careskills\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  useEffect(() => {
    checkTheme();
    fetchInitialData();
  }, []);

  useEffect(() => {
    const handleThemeChange = (event: any) => {
      setIsDark(event.detail.isDark);
    };
    
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  function checkTheme() {
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme');
      const isDarkMode = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setIsDark(isDarkMode);
    }
  }

  async function fetchInitialData() {
    const { data: locData } = await supabase.from('locations').select('*').order('name');
    // Deduplicate locations by id to prevent duplicates in dropdown
    const uniqueLocations = locData ? Array.from(new Map(locData.map((loc: any) => [loc.id, loc])).values()) : [];
    setLocations(uniqueLocations);
    const { data: staffData } = await supabase.from('profiles').select('*').eq('is_deleted', false).order('full_name');
    
    // Filter out dividers - entries that contain divider keywords
    const dividerKeywords = ['maternity', '—', '---', 'section', 'staff only', 'volunteers', 'team', 'department'];
    const filteredStaff = (staffData || []).filter(staff => {
      const name = (staff.full_name || '').toLowerCase();
      return !dividerKeywords.some(keyword => name.includes(keyword));
    });
    
    setAllStaff(filteredStaff);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    debugLog('handleSave called, editingId:', editingId, 'formData:', formData);
    
    if (!hasPermission(userRole, 'STAFF_MANAGEMENT', 'canEdit')) {
      alert('You do not have permission to manage staff');
      return;
    }

    setLoading(true);
    
    // All roles must have an assigned location
    if (!formData.home_house) {
      alert('All users must be assigned a location');
      setLoading(false);
      return;
    }

    try {
      if (editingId) {
        const currentStaff = allStaff.find(s => s.id === editingId);
        const newLocationId = formData.home_house;
        const currentPrimaryLocationId = resolveLocationId(currentStaff?.location || '');

        // Source of truth for current matrix placement is staff_locations, not profile.location text.
        const { data: currentLocationRows, error: currentLocationRowsError } = await supabase
          .from('staff_locations')
          .select('location_id')
          .eq('staff_id', editingId);
        if (currentLocationRowsError) throw currentLocationRowsError;

        const currentLocationIds = Array.from(
          new Set((currentLocationRows || []).map((r: any) => r.location_id).filter(Boolean))
        );
        const locationToMoveFrom =
          currentPrimaryLocationId && currentPrimaryLocationId !== newLocationId
            ? currentPrimaryLocationId
            : null;
        const shouldSyncLocationLinks =
          Boolean(locationToMoveFrom)
          || (currentLocationIds.length > 0 && !currentLocationIds.includes(newLocationId));
        
        const locationName = resolveLocationName(formData.home_house);
        
        // Map home_house to location for database update
        const updateData = {
          full_name: formData.full_name,
          email: formData.email,
          location: locationName,
          role_tier: formData.role_tier,
          managed_houses: formData.managed_houses
        };
        debugLog('Updating staff with ID:', editingId, 'data:', updateData);
        const { error, data } = await supabase.from('profiles').update(updateData).eq('id', editingId).select();
        debugLog('Update result:', { error, data });
        if (error) throw error;
        
        // Ensure staff location links are fully synced so they appear only on the selected matrix location.
        if (shouldSyncLocationLinks) {
          debugLog('Location link change detected, syncing staff_locations...');

          // Move only relevant training rows:
          // - rows currently attached to old location
          // - course exists on BOTH old and new location matrices (matched by canonical course name)
          // - remap course_id when old/new locations use different IDs for the matched course
          let movedTrainingCount = 0;
          if (locationToMoveFrom) {
            try {
              const newLocationCoursesQuery = await supabase
                .from('location_training_courses')
                .select('training_course_id, training_courses(name)')
                .eq('location_id', newLocationId);

              if (newLocationCoursesQuery.error) throw newLocationCoursesQuery.error;
              const newLocationCourses = newLocationCoursesQuery.data || [];

              const newCourseIdByName = new Map<string, string>();
              newLocationCourses.forEach((row: any) => {
                const courseObj = Array.isArray(row.training_courses) ? row.training_courses[0] : row.training_courses;
                const key = canonicalCourseName(courseObj?.name || '');
                if (key && row.training_course_id && !newCourseIdByName.has(key)) {
                  newCourseIdByName.set(key, row.training_course_id);
                }
              });

              const oldLocationCoursesQuery = await supabase
                .from('location_training_courses')
                .select('training_course_id, training_courses(name)')
                .eq('location_id', locationToMoveFrom);

              if (oldLocationCoursesQuery.error) throw oldLocationCoursesQuery.error;
              const oldLocationCourses = oldLocationCoursesQuery.data || [];

              const oldToNewCourseId = new Map<string, string>();
              oldLocationCourses.forEach((row: any) => {
                const courseObj = Array.isArray(row.training_courses) ? row.training_courses[0] : row.training_courses;
                const key = canonicalCourseName(courseObj?.name || '');
                const mappedNewCourseId = key ? newCourseIdByName.get(key) : null;
                if (mappedNewCourseId && row.training_course_id) {
                  oldToNewCourseId.set(row.training_course_id, mappedNewCourseId);
                }
              });

              const oldCourseIdsToMove = Array.from(oldToNewCourseId.keys());
              if (oldCourseIdsToMove.length > 0) {
                const { data: existingRows, error: existingRowsError } = await supabase
                  .from('staff_training_matrix')
                  .select('id, course_id')
                  .eq('staff_id', editingId)
                  .eq('completed_at_location_id', locationToMoveFrom)
                  .in('course_id', oldCourseIdsToMove);

                if (existingRowsError) throw existingRowsError;

                for (const row of existingRows || []) {
                  const targetCourseId = oldToNewCourseId.get(row.course_id) || row.course_id;
                  const { error: moveError } = await supabase
                    .from('staff_training_matrix')
                    .update({
                      completed_at_location_id: newLocationId,
                      course_id: targetCourseId,
                    })
                    .eq('id', row.id);

                  if (!moveError) {
                    movedTrainingCount++;
                    continue;
                  }

                  // If a duplicate already exists at destination, remove the old row.
                  if (moveError.code === '23505') {
                    const { error: deleteDuplicateError } = await supabase
                      .from('staff_training_matrix')
                      .delete()
                      .eq('id', row.id);
                    if (!deleteDuplicateError) {
                      movedTrainingCount++;
                    } else {
                      console.error('Error deleting duplicate old training row:', deleteDuplicateError);
                    }
                  } else {
                    console.error('Error moving training row:', moveError);
                  }
                }
              }
            } catch (moveTrainingError) {
              console.error('Error while moving matching training rows to new location:', moveTrainingError);
            }
          }
          
          // Move one location link to another while preserving any other secondary links.
          if (locationToMoveFrom) {
            const { error: deleteError } = await supabase
              .from('staff_locations')
              .delete()
              .eq('staff_id', editingId)
              .eq('location_id', locationToMoveFrom);
            
            if (deleteError) {
              console.error('Error removing previous location link:', deleteError);
              throw deleteError;
            }
          }
          
          // Ensure target link exists
          const { error: insertError } = await supabase
            .from('staff_locations')
            .upsert({
              staff_id: editingId,
              location_id: newLocationId,
              display_order: 9999 // Put at end of list
            }, { onConflict: 'staff_id,location_id' });
          
          if (insertError) {
            console.error('Error adding to staff_locations:', insertError);
            throw insertError;
          }

          debugLog('Staff_locations updated successfully (moved one location link)');
          debugLog(`Moved ${movedTrainingCount} matching training row(s) to the new location matrix`);
        }
        
        alert('✅ Staff member updated successfully');
        setEditingId(null);
      } else {
        // For new users, use the API endpoint to create auth user and profile
        // Find the location name from the selected location ID
        const selectedLocation = locations.find(loc => loc.id === formData.home_house);
        const locationName = selectedLocation?.name || formData.home_house;

        const payload = {
          full_name: formData.full_name,
          email: formData.email,
          location: locationName,
          location_id: resolveLocationId(formData.home_house) || formData.home_house,
          role_tier: formData.role_tier,
          ...(formData.password && { password: formData.password })
        };

        const response = await fetch('/api/add-staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!result.success || !result.results[0].success) {
          throw new Error(result.results[0].error || 'Failed to create user');
        }

        const roleLabel = formData.role_tier.charAt(0).toUpperCase() + formData.role_tier.slice(1);
        if (formData.password) {
          alert(`✅ ${roleLabel} created!\n\nPassword set.\n\nThey can now log in with their email and this password.`);
        } else {
          alert(`✅ ${roleLabel} created!\n\nA password setup email has been sent to ${formData.email}.\n\nThey must set a password before they can log in.`);
        }
      }
      
      setFormData({ full_name: '', email: '', home_house: '', role_tier: 'staff', managed_houses: [], password: '' });
      fetchInitialData();
      onRefresh();
    } catch (error: any) {
      console.error('Error in handleSave:', error);
      alert('❌ Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!hasPermission(userRole, 'STAFF_MANAGEMENT', 'canEdit')) {
      alert('You do not have permission to manage staff');
      return;
    }

    setBulkLoading(true);
    setBulkMessage('');

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setBulkMessage('❌ CSV must have a header row and at least one data row');
        setBulkLoading(false);
        return;
      }

      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      const expectedHeaders = ['full_name', 'email', 'home_house', 'role_tier'];
      
      debugLog('CSV Headers:', headers);
      debugLog('Expected Headers:', expectedHeaders);
      
      const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        setBulkMessage(`❌ Missing required columns: ${missingHeaders.join(', ')}`);
        setBulkLoading(false);
        return;
      }

      const staffData: any[] = [];
      let errorCount = 0;
      let skippedDuplicates = 0;
      let skippedInternalDuplicates = 0;
      const errors: string[] = [];
      const emailsInThisUpload = new Set<string>(); // Track emails within this CSV

      // First, fetch all existing emails to check for duplicates
      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('email');

      const existingEmails = new Set(existingProfiles?.map((p: any) => p.email.toLowerCase()) || []);

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row: any = {};
        
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });

        debugLog(`Row ${i} raw values:`, values);
        debugLog(`Row ${i} parsed:`, row);

        // Validation
        if (!row.full_name || !row.email) {
          errorCount++;
          errors.push(`Row ${i + 1}: Missing full_name or email`);
          continue;
        }

        // All roles require a location
        if (!row.home_house) {
          errorCount++;
          errors.push(`Row ${i + 1}: ${row.full_name} - Missing home_house location`);
          continue;
        }

        const emailLower = row.email.toLowerCase();

        // Check if email is a duplicate within this upload (internal duplicate)
        if (emailsInThisUpload.has(emailLower)) {
          skippedInternalDuplicates++;
          debugLog(`⏭️  Row ${i + 1}: Skipped duplicate email within this upload: ${row.email}`);
          continue;
        }

        // Check if email already exists in database
        if (existingEmails.has(emailLower)) {
          skippedDuplicates++;
          debugLog(`⏭️  Row ${i + 1}: Skipped duplicate email in database: ${row.email}`);
          continue;
        }

        debugLog(`Row ${i + 1}: ${row.full_name}, email: ${row.email}, location: ${row.home_house}, role: ${row.role_tier}`);

        const normalizedLocationId = resolveLocationId(row.home_house);
        const normalizedLocationName = resolveLocationName(row.home_house);

        const staffRecord: any = {
          full_name: row.full_name,
          email: emailLower,
          location: normalizedLocationName || row.home_house,
          location_id: normalizedLocationId || undefined,
          role_tier: row.role_tier || 'staff',
          managed_houses: []
        };

        // For schedulers and managers, set their primary location as a managed location by default
        if (row.role_tier === 'scheduler' || row.role_tier === 'manager') {
          staffRecord.managed_houses = [row.home_house];
        }

        staffData.push(staffRecord);
        emailsInThisUpload.add(emailLower); // Add to internal tracking
      }

      if (staffData.length === 0) {
        let message = '❌ No valid staff records to upload';
        if (skippedInternalDuplicates > 0) {
          message += `\n(${skippedInternalDuplicates} duplicate emails in this file)`;
        }
        if (skippedDuplicates > 0) {
          message += `\n(${skippedDuplicates} duplicate emails in database)`;
        }
        if (errors.length > 0) {
          message += '\n\n' + errors.slice(0, 3).join('\n');
        }
        setBulkMessage(message);
        setBulkLoading(false);
        return;
      }

      debugLog('Bulk upload data:', staffData);
      const { data, error } = await supabase.from('profiles').insert(staffData).select();
      
      if (error) {
        console.error('Supabase error details:', error);
        let message = `❌ Upload failed: ${error.message}`;
        if (skippedInternalDuplicates > 0) {
          message += `\n(${skippedInternalDuplicates} duplicates within file skipped)`;
        }
        if (skippedDuplicates > 0) {
          message += `\n(${skippedDuplicates} duplicates in database skipped)`;
        }
        if (errorCount > 0) {
          message += `\n(${errorCount} invalid rows skipped)`;
        }
        setBulkMessage(message);
      } else {
        debugLog('Upload success:', data);
        // Check if locations were actually inserted
        if (data && data.length > 0) {
          debugLog('📍 Checking inserted records:');
          data.forEach((record, idx) => {
            debugLog(`  Record ${idx + 1}: ${record.full_name} - location: ${record.location}`);
          });
          const locationsPresent = data.some(record => record.location);
          if (!locationsPresent) {
            debugWarn('⚠️ WARNING: All location values are NULL in inserted records. This is likely an RLS policy issue.');
          }

          // Ensure every inserted staff member is linked in staff_locations for matrix placement.
          const staffLocationRows = data
            .map((record: any) => {
              const locationId = resolveLocationId(record.location || '');
              if (!locationId) return null;
              return {
                staff_id: record.id,
                location_id: locationId,
                display_order: 9999,
              };
            })
            .filter((row: any) => row !== null);

          if (staffLocationRows.length > 0) {
            const { error: staffLocError } = await supabase
              .from('staff_locations')
              .upsert(staffLocationRows, { onConflict: 'staff_id,location_id' });

            if (staffLocError) {
              console.error('Error creating staff_locations for bulk upload:', staffLocError);
            }
          }
        }
        
        let message = `✅ Successfully uploaded ${staffData.length} staff members`;
        if (skippedInternalDuplicates > 0) {
          message += ` (${skippedInternalDuplicates} duplicates in file skipped)`;
        }
        if (skippedDuplicates > 0) {
          message += ` (${skippedDuplicates} duplicates in database skipped)`;
        }
        if (errorCount > 0) {
          message += ` (${errorCount} invalid rows skipped)`;
        }
        setBulkMessage(message);
        
        await fetchInitialData();
        onRefresh();
        
        setTimeout(() => {
          setShowBulkUpload(false);
          setBulkMessage('');
        }, 2000);
      }
    } catch (error: any) {
      setBulkMessage(`❌ Error: ${error.message}`);
    } finally {
      setBulkLoading(false);
      e.target.value = '';
    }
  };

  const downloadTemplate = () => {
    const template = `full_name,email,home_house,role_tier
John Smith,john@example.com,Felix House,staff
Jane Doe,jane@example.com,Banks House,staff
Bob Manager,bob@example.com,Armfield House,admin
Alice Scheduler,alice@example.com,Felix House,scheduler
Charlie Scheduler,charlie@example.com,Banks House,manager`;
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'staff_template.csv';
    a.click();
  };

  const handleDeleteStaff = async (id: string) => {
    if (!hasPermission(userRole, 'STAFF_MANAGEMENT', 'canDelete')) {
      alert('You do not have permission to delete staff');
      return;
    }

    if (!confirm('Delete this staff member? This will remove them from everywhere including login.')) return;
    try {
      // Find the staff member's email for the API call
      const staff = allStaff.find(s => s.id === id);
      if (!staff) {
        alert('Staff member not found');
        return;
      }

      const response = await fetch('/api/delete-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: id, email: staff.email })
      });

      const result = await response.json();

      if (!result.success) {
        alert('❌ Error: ' + result.error);
        return;
      }

      alert('✅ Staff member removed completely');
      fetchInitialData();
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    }
  };

  const handleEdit = (staff: any) => {
    setEditingId(staff.id);
    // Resolve to location ID from either location name or legacy UUID
    const locationId = resolveLocationId(staff.location || '');
    setFormData({
      full_name: staff.full_name,
      email: staff.email,
      home_house: locationId,
      role_tier: staff.role_tier || 'staff',
      managed_houses: staff.managed_houses || [],
      password: ''
    });
  };

  const toggleManagedHouse = (houseName: string) => {
    setFormData(prev => ({
      ...prev,
      managed_houses: prev.managed_houses.includes(houseName)
        ? prev.managed_houses.filter(h => h !== houseName)
        : [...prev.managed_houses, houseName]
    }));
  };

  const toggleLocationExpanded = (locationName: string) => {
    const newExpanded = new Set(expandedLocations);
    if (newExpanded.has(locationName)) {
      newExpanded.delete(locationName);
    } else {
      newExpanded.add(locationName);
    }
    setExpandedLocations(newExpanded);
  };

  const getStaffByLocation = () => {
    const grouped: { [key: string]: any[] } = {};
    
    allStaff.forEach(staff => {
      const location = staff.location ? (resolveLocationName(staff.location) || 'Unassigned') : 'Unassigned';
      if (!grouped[location]) {
        grouped[location] = [];
      }
      grouped[location].push(staff);
    });

    // Remove Unassigned if empty
    if (grouped['Unassigned'] && grouped['Unassigned'].length === 0) {
      delete grouped['Unassigned'];
    }

    // Sort locations alphabetically
    const sorted: { [key: string]: any[] } = {};
    Object.keys(grouped).sort().forEach(key => {
      sorted[key] = grouped[key];
    });

    return sorted;
  };

  const getRoleColor = (role: string) => {
    switch(role) {
      case 'admin': return { bg: '#dc2626', text: '#ffffff' };
      case 'manager': return { bg: '#9333ea', text: '#ffffff' };
      case 'scheduler': return { bg: '#2563eb', text: '#ffffff' };
      case 'staff': return { bg: '#10b981', text: '#ffffff' };
      default: return { bg: '#6b7280', text: '#ffffff' };
    }
  };

  const canManageStaff = hasPermission(userRole, 'STAFF_MANAGEMENT', 'canView');

  if (roleLoading || userRole === null) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff' }} className="rounded-3xl p-8 w-full max-w-md text-center shadow-2xl">
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!canManageStaff) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff' }} className="rounded-3xl p-8 w-full max-w-md text-center shadow-2xl">
          <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase tracking-tight mb-4">Access Denied</h2>
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mb-2">Your Role: <span style={{ color: '#2563eb' }} className="font-bold">{userRole || 'Unknown'}</span></p>
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="mb-6">You do not have permission to manage staff members.</p>
          <UniformButton
            variant="danger"
            className="w-full py-3 font-bold rounded-xl"
            onClick={onClose}
          >
            Close
          </UniformButton>
        </div>
      </div>
    );
  }

  if (showBulkUpload) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl p-8 w-full max-w-md shadow-2xl border transition-colors duration-300">
          
          <div className="flex justify-between items-center mb-6">
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase tracking-tight">
              Bulk Upload Staff
            </h2>
            <UniformButton
              variant="icon"
              className="hover:text-red-500 text-2xl transition-colors"
              style={{ color: isDark ? '#94a3b8' : '#64748b' }}
              onClick={() => setShowBulkUpload(false)}
              aria-label="Close"
            >
              &times;
            </UniformButton>
          </div>

          <div className="space-y-4">
            <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="border-2 border-dashed rounded-xl p-6 text-center">
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleBulkUpload}
                disabled={bulkLoading}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer block">
                <p style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="font-black text-sm mb-2">📁 Click to upload CSV</p>
                <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-xs">or drag and drop</p>
              </label>
            </div>

            {bulkMessage && (
              <div style={{ backgroundColor: bulkMessage.includes('✅') ? '#10b98122' : '#dc262622', borderColor: bulkMessage.includes('✅') ? '#10b981' : '#dc2626' }} className="border rounded-lg p-3">
                <p style={{ color: bulkMessage.includes('✅') ? '#10b981' : '#dc2626' }} className="text-sm font-bold">
                  {bulkMessage}
                </p>
              </div>
            )}

            <div>
              <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-2">Required columns:</p>
              <ul style={{ color: isDark ? '#cbd5e1' : '#1e293b' }} className="text-xs space-y-1 mb-4">
                <li>• <span className="font-bold">full_name</span> - Staff member name</li>
                <li>• <span className="font-bold">email</span> - Email address</li>
                <li>• <span className="font-bold">home_house</span> - Location (required for staff)</li>
                <li>• <span className="font-bold">role_tier</span> - staff, manager, scheduler, or admin</li>
              </ul>
            </div>

            <UniformButton
              variant="primary"
              className="w-full py-3 font-bold rounded-xl"
              style={{ backgroundColor: '#6366f1' }}
              onClick={downloadTemplate}
            >
              📥 Download Template
            </UniformButton>

            <UniformButton
              variant="secondary"
              className="w-full py-3 font-bold rounded-xl"
              style={{ backgroundColor: isDark ? '#334155' : '#cbd5e1', color: isDark ? '#f1f5f9' : '#1e293b' }}
              onClick={() => setShowBulkUpload(false)}
            >
              Close
            </UniformButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl p-8 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border transition-colors duration-300">
        
        <div className="flex justify-between items-center mb-6">
          <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase tracking-tight">
            {editingId ? 'Edit Staff Member' : 'Add Staff Member'}
          </h2>
          <div className="flex gap-2">
            <UniformButton
              variant="secondary"
              className="px-4 py-2 rounded-lg font-bold text-xs uppercase transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg duration-200"
              style={{ backgroundColor: '#f59e0b', color: '#fff' }}
              onClick={() => setShowBulkUpload(true)}
            >
              📤 Bulk Upload
            </UniformButton>
            <UniformButton
              variant="icon"
              className="hover:text-red-500 text-2xl transition-colors hover:scale-125 active:scale-100 duration-200"
              style={{ color: isDark ? '#94a3b8' : '#64748b' }}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </UniformButton>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 overflow-hidden">
          {/* FORM SECTION */}
          <div className="space-y-6 overflow-y-auto pr-4 custom-scrollbar">
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-1 block">Full Name</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. John Smith"
                  style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                  className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                  value={formData.full_name} 
                  onChange={e => setFormData({...formData, full_name: e.target.value})} 
                />
              </div>

              <div>
                <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-1 block">Email Address</label>
                <input 
                  type="email" 
                  required 
                  placeholder="e.g. john@example.com"
                  style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                  className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                />
              </div>

              <div>
                <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-1 block">Role</label>
                <select 
                  required 
                  style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                  className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                  value={formData.role_tier} 
                  onChange={e => {
                    setFormData({...formData, role_tier: e.target.value as any, managed_houses: [], home_house: ''});
                  }}
                >
                  <option value="staff">Staff Member</option>
                  <option value="scheduler">Scheduler</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {!editingId && (
                <div>
                  <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-1 block">Password (Optional)</label>
                  <input 
                    type="password" 
                    placeholder="Leave blank to email a setup link"
                    style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                    className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" 
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})} 
                  />
                  <p style={{ color: isDark ? '#64748b' : '#94a3b8' }} className="text-xs mt-1">
                    {formData.password 
                      ? '✓ They can log in with this password (you can still send a reset link later)' 
                      : '✓ They will receive an email link to set a password (required before they can log in)'}
                  </p>
                </div>
              )}
              
              {!editingId && (
                <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#cbd5e1' : '#1e293b' }} className="p-4 border rounded-xl text-xs font-bold">
                  ℹ️ All roles (including Staff) now get login access. If you don&apos;t set a password here, they&apos;ll get an email to set one.
                </div>
              )}

              {(formData.role_tier === 'staff' || formData.role_tier === 'admin' || formData.role_tier === 'scheduler' || formData.role_tier === 'manager') && (
                <div>
                  <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-1 block">Assigned Location *</label>
                  <select 
                    required 
                    style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                    className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                    value={formData.home_house} 
                    onChange={e => setFormData({...formData, home_house: e.target.value})}
                  >
                    <option value="">Select Location...</option>
                    {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </div>
              )}

              {(formData.role_tier === 'manager' || formData.role_tier === 'scheduler') && (
                <div>
                  <label style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-2 block">Managed Locations *</label>
                  <div className="space-y-2">
                    {locations.map(loc => (
                      <label key={loc.id} className="flex items-center gap-3 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={formData.managed_houses.includes(loc.name)}
                          onChange={() => toggleManagedHouse(loc.name)}
                          className="w-4 h-4 rounded"
                        />
                        <span style={{ color: isDark ? '#cbd5e1' : '#1e293b' }} className="text-sm font-bold">{loc.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button 
                type="submit"
                disabled={loading}
                style={{ 
                  backgroundColor: loading ? '#999999' : editingId ? '#2563eb' : '#10b981',
                  opacity: loading ? 0.7 : 1
                }} 
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.filter = 'brightness(0.9)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }
                }} 
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.filter = 'brightness(1)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }} 
                className="w-full py-3 text-white font-bold rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </>
                ) : editingId ? '💾 Save Changes' : '✅ Create Staff Member'}
              </button>
            </form>
          </div>

          {/* STAFF LIST SECTION */}
          <div style={{ borderColor: isDark ? '#334155' : '#e2e8f0' }} className="border-l pl-6 flex flex-col h-full overflow-hidden">
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-4 tracking-widest">Staff Directory by Location</p>
            <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar">
              {Object.entries(getStaffByLocation()).map(([locationName, staffList]) => (
                <div key={locationName}>
                  <button
                    onClick={() => toggleLocationExpanded(locationName)}
                    style={{
                      backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      color: isDark ? '#f1f5f9' : '#1e293b'
                    }}
                    className="w-full p-3 border rounded-lg font-bold text-sm flex items-center justify-between hover:opacity-80 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span>{expandedLocations.has(locationName) ? '▼' : '▶'}</span>
                      <span>{locationName}</span>
                      <span style={{ backgroundColor: '#60a5fa' }} className="text-white text-[10px] font-bold px-2 py-0.5 rounded">
                        {staffList.length}
                      </span>
                    </div>
                  </button>

                  {expandedLocations.has(locationName) && (
                    <div className="mt-2 ml-3 space-y-2 border-l-2 border-blue-500 pl-3">
                      {staffList.map(staff => {
                        const roleColor = getRoleColor(staff.role_tier);
                        return (
                          <div key={staff.id} style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="p-3 border rounded-xl group transition-all">
                            <div className="flex justify-between items-start mb-2">
                              <div className="overflow-hidden flex-1">
                                <p style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-sm font-bold truncate">{staff.full_name}</p>
                                <p style={{ color: '#60a5fa' }} className="text-[9px] font-bold uppercase">{staff.email}</p>
                              </div>
                              <div style={{ backgroundColor: roleColor.bg, color: roleColor.text }} className="px-2 py-1 rounded text-[9px] font-black uppercase whitespace-nowrap ml-2">
                                {staff.role_tier}
                              </div>
                            </div>
                            
                            <div className="mb-2">
                              <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[9px] font-bold">📍 Primary: {staff.location || 'No location'}</p>
                              {staff.role_tier === 'admin' && (
                                <p style={{ color: '#10b981' }} className="text-[9px] font-bold">✓ Manages all locations</p>
                              )}
                              {(staff.role_tier === 'scheduler' || staff.role_tier === 'manager') && staff.managed_houses && staff.managed_houses.length > 0 && (
                                <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[9px] font-bold">📋 Manages: {staff.managed_houses.join(', ')}</p>
                              )}
                            </div>

                            <div className="flex gap-2">
                              <UniformButton
                                variant="primary"
                                className="flex-1 p-2 text-[9px] font-bold transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg duration-200"
                                style={{ backgroundColor: '#2563eb', color: '#fff' }}
                                onClick={() => handleEdit(staff)}
                              >
                                ✏️ Edit
                              </UniformButton>
                              <UniformButton
                                variant="secondary"
                                className="flex-1 p-2 text-[9px] font-bold transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg duration-200"
                                style={{ backgroundColor: '#d946ef', color: '#fff' }}
                                onClick={() => setShowResetPasswordModal({ userId: staff.id, userName: staff.full_name })}
                                title="Admin: set password directly"
                              >
                                🔐 Set Password
                              </UniformButton>
                              <UniformButton
                                variant="danger"
                                className="flex-1 p-2 text-[9px] font-bold transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg duration-200"
                                onClick={() => handleDeleteStaff(staff.id)}
                              >
                                🗑️ Delete
                              </UniformButton>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Reset Password Modal */}
      {showResetPasswordModal && (
        <AdminResetPasswordModal
          userId={showResetPasswordModal.userId}
          userName={showResetPasswordModal.userName}
          isDark={isDark}
          onClose={() => setShowResetPasswordModal(null)}
          onSuccess={() => {
            // Optionally refresh the staff list
            fetchInitialData();
          }}
        />
      )}
    </div>
  );
}
