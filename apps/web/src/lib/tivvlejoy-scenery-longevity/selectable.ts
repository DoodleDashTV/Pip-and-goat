import { receiptsComplete } from '@/lib/tivvlejoy-approved-asset-registry/registry';
import type { ApprovedAssetRegistry, ApprovedEnvironmentAsset } from '@/lib/tivvlejoy-approved-asset-registry/types';

export function isSelectableApprovedAsset(asset: ApprovedEnvironmentAsset, conflictedGroups: readonly string[] = []): boolean {
  if (asset.approvalState !== 'APPROVED') return false;
  if (!asset.worldBuilderEligible || !asset.shotAssemblyEligible) return false;
  if (asset.canonicalState === 'DUPLICATE' || asset.canonicalState === 'ARCHIVAL') return false;
  if (!receiptsComplete(asset)) return false;
  if (asset.provenanceState !== 'RESOLVED') return false;
  if (asset.licenseState !== 'APPROVED_INTERNAL') return false;
  if (asset.styleCompatibility === 'INCOMPATIBLE') return false;
  if (asset.blenderCompatibility === 'INCOMPATIBLE') return false;
  if (asset.provider === 'BOTANIQ_IF_APPROVED' && asset.botaniqActivated) return false;
  if (asset.provider === 'BOTANIQ_IF_APPROVED') return false;
  if (conflictedGroups.includes(asset.canonicalGroupId) && asset.canonicalState === 'PRIMARY') return false;
  return true;
}

export function selectableApprovedAssets(registry?: ApprovedAssetRegistry): ApprovedEnvironmentAsset[] {
  if (!registry) return [];
  return registry.assets.filter((asset) => isSelectableApprovedAsset(asset, registry.conflictedCanonicalGroups));
}

export function uniqueCanonicalGroups(assets: ApprovedEnvironmentAsset[]): string[] {
  return [...new Set(assets.map((asset) => asset.canonicalGroupId))].sort();
}

export function assetsWithRole(assets: ApprovedEnvironmentAsset[], role: string): ApprovedEnvironmentAsset[] {
  return assets.filter((asset) => asset.semanticRoles.includes(role as ApprovedEnvironmentAsset['semanticRoles'][number]));
}

export function assetsWithCategory(assets: ApprovedEnvironmentAsset[], category: string): ApprovedEnvironmentAsset[] {
  return assets.filter((asset) => asset.coverageCategories.includes(category as ApprovedEnvironmentAsset['coverageCategories'][number]));
}
