import { NextResponse } from 'next/server';
import { SoraProviderStub, SeedanceProviderStub } from '@doodle-dash/providers';
export async function GET() {
  const sora = new SoraProviderStub();
  const seedance = new SeedanceProviderStub();
  return NextResponse.json({
    providers: [
      { id: 'sora', ...(await sora.getCapabilities()), supportsReferenceImages: sora.supportsReferenceImages() },
      { id: 'seedance', ...(await seedance.getCapabilities()), supportsReferenceImages: seedance.supportsReferenceImages() },
    ],
  });
}
