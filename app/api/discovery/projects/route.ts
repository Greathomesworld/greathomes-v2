import { NextRequest, NextResponse } from 'next/server';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const location = searchParams.get('location') || undefined;
    const bedroomCount = searchParams.has('bedroomCount') ? parseInt(searchParams.get('bedroomCount')!) : undefined;
    const propertyType = searchParams.get('propertyType') || undefined;
    const minPrice = searchParams.has('minPrice') ? parseInt(searchParams.get('minPrice')!) : undefined;
    const maxPrice = searchParams.has('maxPrice') ? parseInt(searchParams.get('maxPrice')!) : undefined;
    
    let page = searchParams.has('page') ? parseInt(searchParams.get('page')!) : 1;
    let pageSize = searchParams.has('pageSize') ? parseInt(searchParams.get('pageSize')!) : 20;

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) pageSize = 20;

    const filters = { location, bedroomCount, propertyType, minPrice, maxPrice };

    const results = await propertyDiscoveryService.discoverProjects(filters, page, pageSize);
    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
