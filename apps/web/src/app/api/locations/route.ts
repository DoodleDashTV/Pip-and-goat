import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
export async function GET() {
  const locations = await prisma.location.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json({ locations });
}
