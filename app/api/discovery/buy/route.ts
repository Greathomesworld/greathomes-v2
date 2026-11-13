import { NextRequest, NextResponse } from 'next/server';
import { propertyDiscoveryService, type DiscoveryFilters } from '@/src/domain/projects/services/propertyDiscoveryService';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const location = searchParams.get('location') || undefined;
    const rawScope = searchParams.get('scope');
    const scope: 'DIRECT' | 'DESCENDANT' | undefined =
      rawScope === 'DIRECT' || rawScope === 'DESCENDANT' ? rawScope : undefined;
    const bhkRaw = searchParams.get('bedroomCount') || searchParams.get('bhk');
    const bedroomCountParsed = bhkRaw ? parseInt(bhkRaw, 10) : NaN;
    const bedroomCount = Number.isFinite(bedroomCountParsed) ? bedroomCountParsed : undefined;
    const propertyType = searchParams.get('propertyType') || undefined;
    const minPriceParsed = searchParams.has('minPrice') ? parseInt(searchParams.get('minPrice')!, 10) : NaN;
    const maxPriceParsed = searchParams.has('maxPrice') ? parseInt(searchParams.get('maxPrice')!, 10) : NaN;
    const minPrice = Number.isFinite(minPriceParsed) ? minPriceParsed : undefined;
    const maxPrice = Number.isFinite(maxPriceParsed) ? maxPriceParsed : undefined;
    const inventoryType = searchParams.get('inventoryType') || undefined;
    const sort = searchParams.get('sort') || undefined;
    const query = searchParams.get('q') || searchParams.get('query') || undefined;

    let page = searchParams.has('page') ? parseInt(searchParams.get('page')!, 10) : 1;
    let pageSize = searchParams.has('pageSize') ? parseInt(searchParams.get('pageSize')!, 10) : 20;

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) pageSize = 20;

    const filters: DiscoveryFilters = {
      location,
      scope,
      bedroomCount,
      propertyType,
      minPrice,
      maxPrice,
      inventoryType,
      sort,
      query,
    };

    const results = await propertyDiscoveryService.discoverBuy(filters, page, pageSize);
    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
