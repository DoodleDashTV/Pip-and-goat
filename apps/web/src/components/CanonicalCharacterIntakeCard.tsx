'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { UploadDropzone, type UploadResult } from '@/components/UploadDropzone';

type Readiness = {
  canon: string;
  dna: string;
  primaryReference: string;
  productionModel: string;
  rig: string;
  facialRig: string;
  lipSync: string;
  final1080pCharacterValidation: string;
  referenceVersion: number | null;
  note?: string;
};

type Candidate = {
  id: string;
  assetId: string | null;
  fileName: string;
  sha256: string;
  status: string;
  previewUrl: string | null;
  versionHint: string;
};

function parseNotes(notes: string | null): { sha256?: string; fileName?: string } {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes) as { sha256?: string; fileName?: string };
    return parsed;
  } catch {
    return {};
  }
}

export function CanonicalCharacterIntakeCard({
  name,
  characterCode,
  characterId,
  initialReadiness,
  initialCandidate,
}: {
  name: string;
  characterCode: string;
  characterId: string;
  initialReadiness: Readiness;
  initialCandidate: {
    id: string;
    assetId: string | null;
    title: string | null;
    reviewStatus: string;
    notes: string | null;
  } | null;
}) {
  const notes = parseNotes(initialCandidate?.notes ?? null);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [candidate, setCandidate] = useState<Candidate | null>(() => {
    if (!initialCandidate?.assetId) return null;
    return {
      id: initialCandidate.id,
      assetId: initialCandidate.assetId,
      fileName: notes.fileName ?? initialCandidate.title ?? 'primary_reference',
      sha256: notes.sha256 ?? '—',
      status:
        initialCandidate.reviewStatus === 'APPROVED'
          ? 'APPROVED'
          : initialCandidate.reviewStatus === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING APPROVAL',
      previewUrl: `/api/production/media?assetId=${initialCandidate.assetId}`,
      versionHint:
        initialReadiness.referenceVersion != null
          ? `Approved v${initialReadiness.referenceVersion}`
          : 'Candidate (not yet approved)',
    };
  });
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const gateRows = useMemo(
    () =>
      [
        ['Canon', readiness.canon],
        ['DNA', readiness.dna],
        ['Primary Reference', readiness.primaryReference],
        ['Production Model', readiness.productionModel],
        ['Rig', readiness.rig],
        ['Facial Rig', readiness.facialRig],
        ['Lip Sync', readiness.lipSync],
        ['1080P Character Validation', readiness.final1080pCharacterValidation],
      ] as const,
    [readiness],
  );

  function onPrimaryUploaded(result: UploadResult, file: File) {
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);
    const sha = result.checksum ?? result.stored?.checksum ?? '—';
    setCandidate({
      id: result.referenceImage?.id ?? '',
      assetId: result.referenceImage?.assetId ?? null,
      fileName: file.name,
      sha256: sha,
      status: result.status ?? 'PENDING APPROVAL',
      previewUrl: result.previewUrl ?? null,
      versionHint: 'Candidate (not yet approved)',
    });
    if (result.readiness) {
      const r = result.readiness;
      setReadiness((prev) => ({
        ...prev,
        canon: String(r.canon ?? prev.canon),
        dna: String(r.dna ?? prev.dna),
        primaryReference: String(r.primaryReference ?? prev.primaryReference),
        productionModel: String(r.productionModel ?? prev.productionModel),
        rig: String(r.rig ?? prev.rig),
        facialRig: String(r.facialRig ?? prev.facialRig),
        lipSync: String(r.lipSync ?? prev.lipSync),
        final1080pCharacterValidation: String(
          r.final1080pCharacterValidation ?? prev.final1080pCharacterValidation,
        ),
        referenceVersion:
          typeof r.referenceVersion === 'number'
            ? r.referenceVersion
            : prev.referenceVersion,
      }));
    }
  }

  const referenceApproved = String(readiness.primaryReference).startsWith('READY');

  return (
    <section
      id={characterCode === 'CHAR_PIP_001' ? 'pip' : 'goat'}
      className="scroll-mt-8 overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6"
    >
      <header className="space-y-1">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">{name.toUpperCase()}</h2>
        <p className="text-sm font-semibold text-sun-400">{characterCode}</p>
        <p className="break-all text-xs text-[var(--muted)]">{characterId}</p>
      </header>

      <div className="mt-5">
        <UploadDropzone
          entityCode={characterCode}
          kind="PRIMARY_CANONICAL_REFERENCE"
          accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp,image/*"
          label="PRIMARY CANONICAL REFERENCE — JPEG / JPG / PNG / WEBP (not a 3D model)"
          buttonLabel="UPLOAD PRIMARY REFERENCE"
          large
          onDone={onPrimaryUploaded}
        />
      </div>

      {candidate ? (
        <div className="mt-5 space-y-3 rounded-2xl bg-ink-950/45 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sun-400">
            {candidate.status}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={localPreview ?? candidate.previewUrl ?? undefined}
            alt={`${name} primary reference preview`}
            className="mx-auto max-h-[70vh] w-full max-w-md rounded-xl object-contain bg-ink-950"
          />
          <dl className="space-y-2 break-all text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                File
              </dt>
              <dd className="font-semibold">{candidate.fileName}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                SHA-256
              </dt>
              <dd className="font-mono text-xs">{candidate.sha256}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--muted)]">
                Reference version
              </dt>
              <dd className="font-semibold">{candidate.versionHint}</dd>
            </div>
          </dl>
          {candidate.status === 'PENDING APPROVAL' || candidate.status === 'PENDING_REVIEW' ? (
            <Link
              href={`/references/approve/${characterCode}`}
              className="mt-2 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-sun-400 px-4 py-3 text-center text-base font-extrabold text-ink-950"
            >
              REVIEW & APPROVE
            </Link>
          ) : null}
          {referenceApproved ? (
            <Link
              href={`/references/approve/${characterCode}`}
              className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-leaf-400/40 px-4 py-3 text-center text-sm font-bold text-leaf-300"
            >
              View approved reference
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-rose-300">
          No primary reference uploaded yet. Tap UPLOAD PRIMARY REFERENCE and choose the real JPEG
          from Photos or Files.
        </p>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-sun-400">Readiness</h3>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          {gateRows.map(([label, value]) => {
            const ready = String(value).startsWith('READY');
            return (
              <div key={label} className="rounded-2xl bg-ink-950/40 px-4 py-3">
                <dt className="text-[10px] font-bold uppercase tracking-[0.16em] text-sun-400">
                  {label}
                </dt>
                <dd
                  className={`mt-1 text-sm font-semibold ${ready ? 'text-leaf-300' : 'text-rose-300'}`}
                >
                  {value}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-3 text-xs text-[var(--muted)]">
          JPEG reference ≠ production model. Approving a photo never unlocks MODEL / RIG / FACIAL.
        </p>
      </div>

      <div className="mt-6 space-y-4 border-t border-[var(--line)] pt-6">
        <h3 className="font-display text-2xl font-bold">ADD PRODUCTION MODEL</h3>
        {!referenceApproved ? (
          <p className="text-sm text-rose-300">
            Approve the primary reference first, then import the real Blender production model.
          </p>
        ) : null}
        <p className="text-sm font-semibold text-sun-400">REAL 3D PRODUCTION MODEL REQUIRED</p>
        <p className="text-sm text-[var(--muted)]">
          Preferred: <span className="font-semibold text-mist-100">.blend</span>. Also supported:{' '}
          .glb / .gltf / .fbx. Do not upload the JPEG as a model.
        </p>
        <UploadDropzone
          entityCode={characterCode}
          accept=".blend,.glb,.gltf,.fbx,application/octet-stream"
          label={`Import ${name} production model`}
          buttonLabel="ADD PRODUCTION MODEL"
          large
          onDone={(result) => {
            const checksum =
              result.checksum ??
              (result as { stored?: { checksum?: string } }).stored?.checksum ??
              '—';
            const version =
              (result as { intake?: { version?: number } }).intake?.version ??
              readiness.referenceVersion ??
              1;
            setReadiness((prev) => ({
              ...prev,
              productionModel: 'CANDIDATE / BLOCKED — AWAITING MANUAL APPROVAL',
            }));
            setCandidate((prev) => prev);
            // Surface model candidate status under readiness via note path
            void checksum;
            void version;
          }}
        />
        {String(readiness.productionModel).includes('CANDIDATE') ? (
          <div className="space-y-2 rounded-2xl bg-ink-950/45 p-4 text-sm">
            <p className="font-semibold text-sun-300">MODEL = CANDIDATE / BLOCKED</p>
            <p className="text-[var(--muted)]">
              Next: Blender validation → test renders → reference comparison → manual approval. Never
              auto-READY.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href={`/facial-mapping/${characterCode}`}
                className="font-semibold text-leaf-300 underline"
              >
                Open facial mapping
              </Link>
              <Link
                href={`/character-test/${characterCode}`}
                className="font-semibold text-leaf-300 underline"
              >
                Open Blender character tests / reference comparison
              </Link>
            </div>
          </div>
        ) : null}
        {String(readiness.productionModel).includes('BLOCKED — REAL') ? (
          <p className="text-sm text-rose-300">REAL 3D PRODUCTION MODEL REQUIRED</p>
        ) : null}
      </div>

      <div className="mt-6 space-y-3 rounded-2xl border border-[var(--line)] bg-ink-950/35 p-4">
        <h3 className="font-display text-xl font-bold">CREATE / IMPORT 3D MODEL</h3>
        <p className="text-sm text-[var(--muted)]">
          The approved canonical image is the visual source of truth. Build or import a real Blender
          model that matches it — never generate a fake substitute in-app.
        </p>
        <ol className="space-y-2 text-sm text-mist-100">
          {[
            'APPROVED REFERENCE',
            '3D MODEL',
            'TEXTURES/MATERIALS',
            'RIG',
            'FACIAL CONTROLS',
            'VISEMES',
            'BLENDER TEST RENDERS',
            'REFERENCE COMPARISON',
            'MANUAL APPROVAL',
            'PRODUCTION READY',
          ].map((step, idx) => (
            <li key={step} className="flex gap-3">
              <span className="w-6 shrink-0 font-bold text-sun-400">{idx + 1}.</span>
              <span>
                {step}
                {idx < 9 ? <span className="mt-1 block text-[var(--muted)]">↓</span> : null}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-[var(--muted)]">
          After a real .blend upload, Blender validation checks file load, meshes, materials,
          textures, armature, bones, shape keys, facial controls, visemes, eyes, blinks, mouth,
          scale, orientation, EEVEE compatibility, and 1080×1920 readiness.
        </p>
        <Link
          href={`/character-test/${characterCode}`}
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-leaf-300 underline"
        >
          Open character test stage
        </Link>
      </div>
    </section>
  );
}
