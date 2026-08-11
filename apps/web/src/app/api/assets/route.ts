import { NextResponse } from 'next/server';
import { assetService } from '@doodle-dash/characters';
import { CreateAssetSchema } from '@doodle-dash/domain';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const universeId = searchParams.get('universeId') ?? undefined;
  const missingParam = searchParams.get('missing');
  const missing =
    missingParam === null ? undefined : missingParam === 'true';

  const assets = await assetService.list({ universeId, missing });
  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = CreateAssetSchema.parse(body);
    const asset = await assetService.create(input);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: (error as Error).message } },
      { status: 400 },
    );
  }
}
