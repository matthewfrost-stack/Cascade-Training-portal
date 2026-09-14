import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    // This legacy Google Apps Script endpoint returns an unscoped location
    // header set. Managers must use the location-scoped Supabase endpoints.
    const authz = await requireRole(['admin', 'scheduler']);
    if ('error' in authz) return authz.error;

    const deploymentUrl = process.env.NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL;

    if (!deploymentUrl) {
      return NextResponse.json(
        { error: 'Google Apps Script URL not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(deploymentUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        function: 'getLocationHeaders',
        params: {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Apps Script error:', response.status, errorText);
      return NextResponse.json(
        { error: `Google Apps Script error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching locations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch locations' },
      { status: 500 }
    );
  }
}
