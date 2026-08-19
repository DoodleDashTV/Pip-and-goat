import { BLENDER_SCRIPT_SCHEMA, UNRESOLVED } from './types';
import type { BlenderOperation } from './types';
import type { ShotAssemblyManifest } from './operations';

function pyString(value: unknown): string {
  return JSON.stringify(value ?? UNRESOLVED);
}

export function generateBlenderScript(input: {
  manifest: ShotAssemblyManifest;
  operations: BlenderOperation[];
  planDependencySha256: string;
}): string {
  const { manifest, operations, planDependencySha256 } = input;
  const lines: string[] = [
    '# =============================================================================',
    `# ${BLENDER_SCRIPT_SCHEMA}`,
    `# shotId=${manifest.shotId}`,
    `# assemblyDependencySha256=${manifest.assemblyDependencySha256}`,
    `# planDependencySha256=${planDependencySha256}`,
    '# generatedForDryRun=true',
    '# executionAuthorized=false',
    '# commercialAssetsAllowed=false',
    '# characterAssetsAllowed=false',
    '# DO NOT EXECUTE WITHOUT A VALID EXECUTION AUTHORIZATION RECEIPT',
    '# SOURCE assets are immutable. Use link, append, instance, or duplicate-for-derivative.',
    '# Never open, modify, or save over original purchased bytes.',
    '# =============================================================================',
    'import bpy',
    '',
    `SHOT_ID = ${pyString(manifest.shotId)}`,
    `EPISODE_ID = ${pyString(manifest.episodeId)}`,
    `ASSEMBLY_SHA = ${pyString(manifest.assemblyDependencySha256)}`,
    `PLAN_SHA = ${pyString(planDependencySha256)}`,
    'IDEMPOTENCY_MODE = "CREATE_IF_MISSING"',
    '',
    'def ensure_collection(name, parent=None):',
    '    col = bpy.data.collections.get(name)',
    '    if col is None:',
    '        col = bpy.data.collections.new(name)',
    '        if parent is None:',
    '            bpy.context.scene.collection.children.link(col)',
    '        else:',
    '            parent.children.link(col)',
    '    return col',
    '',
    'def ensure_object(name, data):',
    '    existing = bpy.data.objects.get(name)',
    '    if existing is not None:',
    '        return existing',
    '    obj = bpy.data.objects.new(name, data)',
    '    bpy.context.scene.collection.objects.link(obj)',
    '    return obj',
    '',
    'def attach_metadata(owner, values):',
    '    for key, value in values.items():',
    '        owner[key] = value',
    '',
  ];

  for (const operation of operations) {
    lines.push(`# ${operation.operationId} ${operation.operationType} status=${operation.status}`);
    if (operation.operationType === 'CREATE_COLLECTION' || operation.operationType === 'CREATE_CHILD_COLLECTION') {
      const name = String(operation.parameters.name ?? operation.target.split('/').at(-1));
      const parent = operation.parameters.parent;
      if (parent && parent !== null) {
        const parentName = String(parent).split('/').at(-1);
        lines.push(`parent_${name} = ensure_collection(${pyString(parentName)})`);
        lines.push(`${name} = ensure_collection(${pyString(name)}, parent_${name})`);
      } else {
        lines.push(`${name === operation.target ? 'ROOT' : name} = ensure_collection(${pyString(name === operation.target ? operation.target : name)})`);
      }
    } else if (operation.operationType === 'CREATE_CAMERA') {
      lines.push(`cam_data = bpy.data.cameras.get(${pyString(operation.target)}) or bpy.data.cameras.new(${pyString(operation.target)})`);
      lines.push(`cam_obj = ensure_object(${pyString(operation.target)}, cam_data)`);
    } else if (operation.operationType === 'CONFIGURE_CAMERA') {
      lines.push(`cam_data.sensor_fit = ${pyString(operation.parameters.sensorFit)}`);
      lines.push(`cam_data.sensor_width = ${operation.parameters.sensorWidth}`);
      lines.push(`cam_data.clip_start = ${operation.parameters.clipStart}`);
      lines.push(`cam_data.clip_end = ${operation.parameters.clipEnd}`);
      lines.push(`# plannedLens=${pyString(operation.parameters.plannedLens)} plannedTransform=${pyString(operation.parameters.plannedTransform)}`);
      lines.push(`# pipGoatPixelMeasurements=${pyString(UNRESOLVED)}`);
    } else if (operation.operationType === 'SET_ACTIVE_CAMERA') {
      lines.push('bpy.context.scene.camera = cam_obj');
      lines.push('bpy.context.scene.render.resolution_x = 1080');
      lines.push('bpy.context.scene.render.resolution_y = 1920');
    } else if (operation.operationType === 'CREATE_LIGHT') {
      const role = String(operation.parameters.role);
      lines.push(`light_${role} = bpy.data.lights.get(${pyString(operation.target)}) or bpy.data.lights.new(${pyString(operation.target)}, "AREA")`);
      lines.push(`light_obj_${role} = ensure_object(${pyString(operation.target)}, light_${role})`);
    } else if (operation.operationType === 'INSTANCE_CHARACTER') {
      lines.push(`# INSTANCE_CHARACTER ${operation.parameters.characterId} BLOCKED_UNRESOLVED_PRODUCTION_RIG`);
    } else if (operation.operationType === 'INSTANCE_ASSET' || operation.operationType === 'INSTANCE_STORY_PROP') {
      if (operation.status === 'PLANNED') {
        lines.push(`empty_${operation.operationId} = bpy.data.objects.get(${pyString(operation.target)})`);
        lines.push(`if empty_${operation.operationId} is None:`);
        lines.push(`    empty_${operation.operationId} = bpy.data.objects.new(${pyString(operation.target)}, None)`);
        lines.push(`    bpy.context.scene.collection.objects.link(empty_${operation.operationId})`);
        lines.push(`empty_${operation.operationId}["tj_asset_class"] = "SCENE_INSTANCE"`);
      } else {
        lines.push(`# skipped instance ${operation.target} status=${operation.status}`);
      }
    } else if (operation.operationType === 'ATTACH_METADATA') {
      const values = operation.parameters.values as Record<string, unknown>;
      lines.push('attach_metadata(ROOT if "ROOT" in dir() else bpy.context.scene, {');
      for (const [key, value] of Object.entries(values)) {
        lines.push(`    ${pyString(key)}: ${pyString(value)},`);
      }
      lines.push('})');
    } else if (operation.operationType === 'PREPARE_OUTPUT_SCENE') {
      lines.push('# dryRun=true executionAuthorized=false workspace unresolved');
    } else {
      lines.push(`# planned ${operation.operationType} on ${operation.target}`);
    }
    lines.push('');
  }

  lines.push('# End of generated dry-run script. No source overwrite. No commercial read.');
  lines.push('');
  return lines.join('\n');
}
