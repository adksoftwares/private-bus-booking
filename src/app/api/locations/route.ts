import { NextResponse } from 'next/server';
import { 
  SRI_LANKA_BUS_STANDS, 
  SRI_LANKA_PROVINCES, 
  SRI_LANKA_TOWNS,
  searchBusStands 
} from '@/data/sriLankaBusStands';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const district = searchParams.get('district');
    const province = searchParams.get('province');
    const mode = searchParams.get('mode'); // 'towns', 'provinces', 'stands'

    if (mode === 'towns') {
      return NextResponse.json({ towns: SRI_LANKA_TOWNS });
    }

    if (mode === 'provinces') {
      return NextResponse.json({ provinces: SRI_LANKA_PROVINCES });
    }

    let results = SRI_LANKA_BUS_STANDS;

    if (province) {
      results = results.filter(s => s.province.toLowerCase() === province.toLowerCase());
    }

    if (district) {
      results = results.filter(s => s.district.toLowerCase() === district.toLowerCase());
    }

    if (query) {
      results = searchBusStands(query, 30);
    }

    return NextResponse.json({
      total: results.length,
      busStands: results
    });
  } catch (err: unknown) {
    console.error("Locations API error:", err);
    return NextResponse.json({ error: "Failed to fetch locations" }, { status: 500 });
  }
}
