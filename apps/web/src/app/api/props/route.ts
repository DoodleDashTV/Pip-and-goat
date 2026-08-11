import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
export async function GET() {
  const props = await prisma.prop.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json({ props });
}
