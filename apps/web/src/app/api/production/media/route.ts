import { NextResponse } from 'next/server';
import { prisma } from '@doodle-dash/database';
import {
  AppError,
  createDefaultObjectStorage,
  parseStorageKeyFromUri,
} from '@doodle-dash/shared';

export const dynamic = 'force-dynamic';

/**
 * Serve an uploaded production binary for in-app preview (reference JPEGs, etc.).
 * Uses the configured object-storage abstraction — never invents placeholder images.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assetId = url.searchParams.get('assetId');
    if (!assetId) {
      return NextResponse.json({ error: 'assetId required' }, { status: 400 });
    }

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset?.storageLocation) {
      return NextResponse.json({ error: 'Asset binary not found' }, { status: 404 });
    }

    const storage = createDefaultObjectStorage();
    const parsed = parseStorageKeyFromUri(asset.storageLocation);
    if (!parsed?.key || !storage.readObject) {
      // Public HTTP(S) URLs from OBJECT_STORAGE_PUBLIC_BASE_URL can be redirected.
      if (/^https?:\/\//i.test(asset.storageLocation)) {
        return NextResponse.redirect(asset.storageLocation);
      }
      return NextResponse.json(
        {
          error:
            'Cannot preview this storage URI with the current provider. Configure readable object storage.',
        },
        { status: 501 },
      );
    }

    const bytes = await storage.readObject(parsed.key);
    const contentType = asset.mimeType || 'application/octet-stream';
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=60',
        'Content-Length': String(bytes.byteLength),
        'X-Content-SHA256': asset.hash ?? '',
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    throw error;
  }
}
