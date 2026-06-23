import { NextRequest } from 'next/server';
import { createServiceClient, getScopedLocationIds, requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authz = await requireRole(['admin', 'scheduler']);
    if ('error' in authz) return authz.error;

    const supabaseAdmin = createServiceClient();
    const body = await request.json();
    const { staffId, locationId } = body;

    // Validate input
    if (!staffId || !locationId) {
      return Response.json(
        {
          success: false,
          error: 'Missing required fields: staffId, locationId',
        },
        { status: 400 }
      );
    }

    const scopedLocations = await getScopedLocationIds(authz.userId, authz.role, supabaseAdmin);
    if (!scopedLocations.all && !scopedLocations.ids.includes(locationId)) {
      return Response.json(
        {
          success: false,
          error: 'Forbidden',
        },
        { status: 403 }
      );
    }

    // Remove the staff member from this location only
    const { error: deleteError } = await supabaseAdmin
      .from('staff_locations')
      .delete()
      .eq('staff_id', staffId)
      .eq('location_id', locationId);

    if (deleteError) {
      console.error('Error removing staff from location:', deleteError);
      return Response.json(
        {
          success: false,
          error: `Failed to remove staff from location: ${deleteError.message}`,
        },
        { status: 400 }
      );
    }

    // Also remove all training records for this staff/location combination
    // Match on completed_at_location_id since that's what the matrix uses
    const { error: trainingError } = await supabaseAdmin
      .from('staff_training_matrix')
      .delete()
      .eq('staff_id', staffId)
      .eq('completed_at_location_id', locationId);

    if (trainingError) {
      console.warn('Could not delete training records:', trainingError.message);
      // Don't fail the entire operation for this, but log it
    }

    console.log(`Staff member ${staffId} removed from location ${locationId}`);

    return Response.json(
      {
        success: true,
        message: 'Staff member removed from this location only',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('API error:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
}
