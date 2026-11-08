import { NextRequest, NextResponse } from 'next/server';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    
    const results = await propertyDiscoveryService.search(query);
    return NextResponse.json({ success: true, data: results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
