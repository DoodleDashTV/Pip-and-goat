import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import {
  PIP_CANONICAL_DNA,
  GOAT_CANONICAL_DNA,
  canonicalCharacterService,
  durableStorageOpsService,
  propOnboardingService,
} from '@doodle-dash/production';
import { CanonicalCharacterIntakeCard } from '@/components/CanonicalCharacterIntakeCard';
import { StorageHealthPanel } from '@/components/StorageHealthPanel';
import { UploadDropzone } from '@/components/UploadDropzone';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function SlotList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: string;
    kind: string;
    approvalStatus: string;
    storageLocation: string | null;
    missingReason: string | null;
    version: number;
  }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-sun-400">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-ink-950/40 px-4 py-3">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-semibold">{row.kind}</span>
              <span className={row.storageLocation ? 'text-leaf-300' : 'text-rose-300'}>
                {row.storageLocation
                  ? `${row.approvalStatus} · v${row.version}`
                  : 'PRODUCTION ASSET REQUIRED'}
              </span>
            </div>
            {row.missingReason ? <p className="mt-1 text-[var(--muted)]">{row.missingReason}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function pickCandidate(
  images: Array<{
    id: string;
    assetId: string | null;
    title: string | null;
    reviewStatus: string;
    notes: string | null;
    isPrimary: boolean;
    createdAt: Date;
  }>,
) {
  const withAsset = images.filter((i) => i.assetId);
  return (
    withAsset.find((i) => i.isPrimary && i.reviewStatus === 'PENDING_REVIEW') ??
    withAsset.find((i) => i.reviewStatus === 'PENDING_REVIEW') ??
    withAsset.find((i) => i.isPrimary && i.reviewStatus === 'APPROVED') ??
    withAsset.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
    null
  );
}

export default async function AssetIntakePage() {
  await canonicalCharacterService.bootstrapFoundingCharacters();
  const storage = await durableStorageOpsService.health();

  const [pip, goat, meadow, propBundle] = await Promise.all([
    prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.PIP },
      include: { referenceImages: { orderBy: { createdAt: 'desc' } } },
    }),
    prisma.character.findUniqueOrThrow({
      where: { internalCode: FOUNDING_CODES.GOAT },
      include: { referenceImages: { orderBy: { createdAt: 'desc' } } },
    }),
    prisma.location.findFirstOrThrow({ where: { internalCode: 'LOC_MEADOW_001' } }),
    propOnboardingService.ensureMapPropProfile(),
  ]);

  const [pipReady, goatReady] = await Promise.all([
    canonicalCharacterService.readinessMatrix(FOUNDING_CODES.PIP),
    canonicalCharacterService.readinessMatrix(FOUNDING_CODES.GOAT),
  ]);

  const intakes = await prisma.productionAssetIntake.findMany({
    orderBy: [{ kind: 'asc' }, { version: 'desc' }],
  });
  const inspections = await prisma.characterModelInspection.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
  });

  const forEntity = (entityId: string) =>
    intakes
      .filter((i) => i.entityId === entityId)
      .filter((row, idx, arr) => arr.findIndex((x) => x.kind === row.kind) === idx);

  return (
    <div className="space-y-8 overflow-x-hidden">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Launch Prep</p>
        <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
          Production Asset Onboarding
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-[var(--muted)] sm:text-base">
          Upload real Pip and Goat primary references from your phone. Validators run immediately.
          Uploads never auto-grant production-ready status.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href={`/references/approve/${FOUNDING_CODES.PIP}`} className="text-leaf-300 underline">
            Approve Pip
          </Link>
          <Link href={`/references/approve/${FOUNDING_CODES.GOAT}`} className="text-leaf-300 underline">
            Approve Goat
          </Link>
          <Link
            href="/episodes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/readiness"
            className="text-leaf-300 underline"
          >
            Meadow Map Mystery readiness
          </Link>
        </div>
      </header>

      <StorageHealthPanel initial={storage} />

      <CanonicalCharacterIntakeCard
        name="Pip"
        characterCode={FOUNDING_CODES.PIP}
        characterId={pip.id}
        initialReadiness={{
          canon: pipReady.canon,
          dna: pipReady.dna,
          primaryReference: pipReady.primaryReference,
          productionModel: pipReady.productionModel,
          rig: pipReady.rig,
          facialRig: pipReady.facialRig,
          lipSync: pipReady.lipSync,
          final1080pCharacterValidation: pipReady.final1080pCharacterValidation,
          referenceVersion: pipReady.referenceVersion,
          note: pipReady.note,
        }}
        initialCandidate={pickCandidate(pip.referenceImages)}
      />

      <CanonicalCharacterIntakeCard
        name="Goat"
        characterCode={FOUNDING_CODES.GOAT}
        characterId={goat.id}
        initialReadiness={{
          canon: goatReady.canon,
          dna: goatReady.dna,
          primaryReference: goatReady.primaryReference,
          productionModel: goatReady.productionModel,
          rig: goatReady.rig,
          facialRig: goatReady.facialRig,
          lipSync: goatReady.lipSync,
          final1080pCharacterValidation: goatReady.final1080pCharacterValidation,
          referenceVersion: goatReady.referenceVersion,
          note: goatReady.note,
        }}
        initialCandidate={pickCandidate(goat.referenceImages)}
      />

      <p className="text-center text-xs text-[var(--muted)]">
        DNA locked: Pip v{PIP_CANONICAL_DNA.dnaVersion} · Goat v{GOAT_CANONICAL_DNA.dnaVersion}. Do not
        invent substitute reference images.
      </p>

      <section id="meadow" className="scroll-mt-8 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6">
        <h2 className="font-display text-3xl font-bold">MEADOW ENVIRONMENT</h2>
        <p className="mt-1 text-sm text-sun-400">LOC_MEADOW_001 · used by Meadow Map Mystery</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <UploadDropzone entityCode="LOC_MEADOW_001" kind="LOCATION_BLEND" accept=".blend,.glb" label="Environment .blend" />
          <UploadDropzone entityCode="LOC_MEADOW_001" kind="LIGHTING_SETUP" accept=".blend,.json" label="Lighting configuration" />
          <UploadDropzone entityCode="LOC_MEADOW_001" kind="TEXTURE" accept="image/*" label="Environment textures" />
          <UploadDropzone entityCode="LOC_MEADOW_001" kind="REFERENCE_IMAGE" accept="image/*" label="Approved environment screenshots" />
        </div>
        <div className="mt-6">
          <SlotList title="Meadow intake slots" rows={forEntity(meadow.id)} />
        </div>
      </section>

      <section id="props" className="scroll-mt-8 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6">
        <h2 className="font-display text-3xl font-bold">PROPS</h2>
        <p className="mt-1 text-sm text-sun-400">PROP_MAP_001 · Adventure Map</p>
        <p className="mt-2 text-sm text-rose-300">
          {propBundle?.profile.productionReady
            ? 'READY'
            : propBundle?.profile.blockedReason ?? 'BLOCKED — PROP ASSET REQUIRED'}
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <UploadDropzone entityCode="PROP_MAP_001" accept=".blend,.glb" label="Map prop model" />
        </div>
        {propBundle ? (
          <div className="mt-6">
            <SlotList title="Prop intake" rows={forEntity(propBundle.prop.id)} />
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6">
        <h2 className="font-display text-2xl font-bold">Recent model inspections</h2>
        <ul className="mt-4 space-y-3 text-sm">
          {inspections.map((ins) => (
            <li key={ins.id} className="rounded-2xl bg-ink-950/40 px-4 py-3">
              <p className="font-semibold">
                {ins.fileName} · {ins.format} · hash {(ins.fileHash ?? '').slice(0, 12)}…
              </p>
              <p className="text-[var(--muted)]">
                size {ins.fileSize} · blender {ins.blenderInspectStatus} · productionReadyEligible=
                {String(ins.productionReadyEligible)}
              </p>
            </li>
          ))}
          {!inspections.length ? (
            <li className="text-[var(--muted)]">No inspections yet — upload a model to generate one.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
