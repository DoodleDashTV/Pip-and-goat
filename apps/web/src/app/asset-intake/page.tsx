import { prisma } from '@doodle-dash/database';
import { FOUNDING_CODES } from '@doodle-dash/domain';
import { propOnboardingService } from '@doodle-dash/production';
import { UploadDropzone } from '@/components/UploadDropzone';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function SlotList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: string; kind: string; approvalStatus: string; storageLocation: string | null; missingReason: string | null; version: number }>;
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
                {row.storageLocation ? `${row.approvalStatus} · v${row.version}` : 'PRODUCTION ASSET REQUIRED'}
              </span>
            </div>
            {row.missingReason ? <p className="mt-1 text-[var(--muted)]">{row.missingReason}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function AssetIntakePage() {
  const [pip, goat, meadow, propBundle] = await Promise.all([
    prisma.character.findUniqueOrThrow({ where: { internalCode: FOUNDING_CODES.PIP } }),
    prisma.character.findUniqueOrThrow({ where: { internalCode: FOUNDING_CODES.GOAT } }),
    prisma.location.findFirstOrThrow({ where: { internalCode: 'LOC_MEADOW_001' } }),
    propOnboardingService.ensureMapPropProfile(),
  ]);
  const intakes = await prisma.productionAssetIntake.findMany({
    orderBy: [{ kind: 'asc' }, { version: 'desc' }],
  });
  const inspections = await prisma.characterModelInspection.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
  });

  const forEntity = (entityId: string) =>
    intakes.filter((i) => i.entityId === entityId).filter((row, idx, arr) => arr.findIndex((x) => x.kind === row.kind) === idx);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-sun-400">Launch Prep</p>
        <h1 className="mt-2 font-display text-4xl font-bold">Production Asset Onboarding</h1>
        <p className="mt-3 max-w-3xl text-[var(--muted)]">
          Upload real Pip, Goat, Meadow, and prop assets. Validators run immediately. Uploads never auto-grant
          production-ready status.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/episodes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/readiness" className="text-leaf-300 underline">
            Meadow Map Mystery readiness
          </Link>
          <Link href="/blender-worker" className="text-leaf-300 underline">
            Blender worker
          </Link>
          <Link href="/voices" className="text-leaf-300 underline">
            Voices
          </Link>
        </div>
      </header>

      <section id="pip" className="scroll-mt-8 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-3xl font-bold">PIP</h2>
        <p className="mt-1 text-sm text-sun-400">CHAR_PIP_001 · {pip.id}</p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
          <li>Character model upload</li>
          <li>Texture upload</li>
          <li>Rig validation</li>
          <li>Facial-control validation / mapping</li>
          <li>Reference-image upload</li>
          <li>Reference approval</li>
          <li>Character-lock validation</li>
          <li>Production-ready approval</li>
        </ol>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <UploadDropzone
            entityCode="CHAR_PIP_001"
            kind="PRIMARY_CANONICAL_REFERENCE"
            accept="image/jpeg,image/jpg,image/png,.jpg,.jpeg,.png"
            label="PRIMARY CANONICAL REFERENCE (JPEG) — not a 3D model"
          />
          <UploadDropzone entityCode="CHAR_PIP_001" accept=".blend,.glb,.gltf,.fbx" label="1. Pip production model (.blend preferred)" />
          <UploadDropzone entityCode="CHAR_PIP_001" kind="TEXTURE" accept="image/*,.png,.jpg,.exr" label="2. Pip textures" />
          <UploadDropzone entityCode="CHAR_PIP_001" kind="TURNAROUND" accept="image/*" label="Turnaround views (FRONT/SIDE/BACK — optional)" />
          <UploadDropzone entityCode="CHAR_PIP_001" kind="EXPRESSION_SHEET" accept="image/*" label="Expression sheet (optional)" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href={`/facial-mapping/${FOUNDING_CODES.PIP}`} className="font-semibold text-leaf-300 underline">
            Facial mapping
          </Link>
          <Link href={`/references/approve/${FOUNDING_CODES.PIP}`} className="font-semibold text-leaf-300 underline">
            Reference approval
          </Link>
          <Link href={`/character-test/${FOUNDING_CODES.PIP}`} className="font-semibold text-leaf-300 underline">
            Character test stage
          </Link>
        </div>
        <div className="mt-6">
          <SlotList title="Pip intake slots" rows={forEntity(pip.id)} />
        </div>
      </section>

      <section id="goat" className="scroll-mt-8 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
        <h2 className="font-display text-3xl font-bold">GOAT</h2>
        <p className="mt-1 text-sm text-sun-400">CHAR_GOAT_001 · {goat.id}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <UploadDropzone
            entityCode="CHAR_GOAT_001"
            kind="PRIMARY_CANONICAL_REFERENCE"
            accept="image/jpeg,image/jpg,image/png,.jpg,.jpeg,.png"
            label="PRIMARY CANONICAL REFERENCE (JPEG) — not a 3D model"
          />
          <UploadDropzone entityCode="CHAR_GOAT_001" accept=".blend,.glb,.gltf,.fbx" label="1. Goat production model (.blend preferred)" />
          <UploadDropzone entityCode="CHAR_GOAT_001" kind="TEXTURE" accept="image/*,.png,.jpg,.exr" label="2. Goat textures" />
          <UploadDropzone entityCode="CHAR_GOAT_001" kind="TURNAROUND" accept="image/*" label="Turnaround views (FRONT/SIDE/BACK — optional)" />
          <UploadDropzone entityCode="CHAR_GOAT_001" kind="EXPRESSION_SHEET" accept="image/*" label="Expression sheet (optional)" />
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href={`/facial-mapping/${FOUNDING_CODES.GOAT}`} className="font-semibold text-leaf-300 underline">
            Facial mapping
          </Link>
          <Link href={`/references/approve/${FOUNDING_CODES.GOAT}`} className="font-semibold text-leaf-300 underline">
            Reference approval
          </Link>
          <Link href={`/character-test/${FOUNDING_CODES.GOAT}`} className="font-semibold text-leaf-300 underline">
            Character test stage
          </Link>
        </div>
        <div className="mt-6">
          <SlotList title="Goat intake slots" rows={forEntity(goat.id)} />
        </div>
      </section>

      <section id="meadow" className="scroll-mt-8 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
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

      <section id="props" className="scroll-mt-8 rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
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

      <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-6">
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
