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
