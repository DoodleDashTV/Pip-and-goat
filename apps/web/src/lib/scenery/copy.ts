import { assertNoLegacyBrand } from './types';

export const SCENERY_COPY = {
  kicker: 'Scenery',
  title: 'TivvleJoy Scenery Builder',
  instruction:
    'Review registered collections, generate a deterministic scene plan, and inspect validation. Preview Only. No Render.',
  previewOnly: 'Preview Only',
  noRender: 'No Render',
  planCreated: 'Scene plan created. Nothing was rendered.',
  missingSources: 'Purchased scenery files are not in this workspace and have not been inspected.',
  blenderNotRun: 'Real Blender execution was not run.',
  dashboardTitle: 'TivvleJoy Scenery',
  dashboardBody: 'Preview Only. Plan scenery from recipes. No Render.',
  openScenery: 'Open Scenery',
  seedLabel: 'Deterministic seed',
  generatePlan: 'Generate scene plan',
  estimatedComplexity: 'Estimated complexity',
  missingPrerequisites: 'Missing prerequisites',
  validationResults: 'Validation results',
  registeredAssets: 'Registered fixture assets',
  normalizedAssets: 'Normalized purchased assets',
  quarantinedAssets: 'Quarantined assets',
  approvedAssets: 'Approved purchased assets',
  intakeTitle: 'Preview Only Scenery Asset Intake',
  intakeInstruction:
    'Select the purchased TivvleJoy scenery files and upload them directly to private storage. Upload does not mean asset approval.',
  uploadNotApproval: 'Upload does not mean asset approval.',
  studioSession: 'Authorized TivvleJoy studio session',
  studioTokenLabel: 'Studio session token',
  studioTokenHelp:
    'Enter the TivvleJoy scenery intake token configured for this Preview. The token stays in this browser session and is never written into storage credentials, bucket controls, or the page snapshot.',
  unauthorizedMutations:
    'Unauthorized browsers cannot create, sign, complete, query, resume, or abort upload sessions.',
  directToStorage:
    'Large scenery files travel from this browser to signed private-storage URLs. They do not pass through a Vercel request body.',
  softwareFoundation: 'Software foundation',
  realAssetReadiness: 'Real asset readiness',
  storageConfiguration: 'Storage configuration',
  expectedFiles: 'Expected files',
  uploadedFiles: 'Uploaded files',
  verifiedFiles: 'Verified files',
  inspectionReadyFiles: 'Inspection-ready files',
  inspectedFiles: 'Inspected files',
} as const;

for (const value of Object.values(SCENERY_COPY)) {
  assertNoLegacyBrand(value);
}
