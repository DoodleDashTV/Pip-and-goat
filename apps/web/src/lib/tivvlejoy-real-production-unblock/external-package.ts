import type { ExternalDependency } from './types';

export function compileFirstEpisodeExternalDependencies(): ExternalDependency[] {
  return [
    {
      category: 'FROM RIGGER',
      items: [
        'One hashed Pip Blender source. FBX or GLB only if that is the source they actually built.',
        'One hashed Goat Blender source, same rule.',
        'Textures only if they are not already packed in the Blender file.',
        'A short note of the Blender 4.2 version they used.',
        'Optional test-pose stills. Do not send extra wrapper archives.',
      ],
    },
    {
      category: 'FROM VOICE SYSTEM',
      items: [
        'Exact spoken text for the seven EP012 lines. The plan currently has dialogue IDs only.',
        'Real Pip and Goat audio receipts after Justin approves the spend.',
        'At least line timing with the audio. Word timing if the vendor already returns it.',
        'Do not generate placeholder voices and later call them real.',
      ],
    },
    {
      category: 'FROM SCENERY REVIEW',
      items: [
        'A yes/no on whether to download the small first-read scenery set. Cost is not proven zero.',
        'Human visual approval of any inspected bakery, forest, path, sky, and story-map candidates.',
        'No Botaniq, no huge landscape packs, no auto-approval from a listing.',
      ],
    },
    {
      category: 'FROM BLENDER ENVIRONMENT',
      items: [
        'A trusted Blender 4.2.2 install after the official SHA-256 is pinned.',
        'Factory-startup synthetic smoke only. No purchased files until every commercial inspection gate is true.',
      ],
    },
    {
      category: 'FROM USER',
      items: [
        'Keep this stack draft. Do not merge and do not mark ready.',
        'Approve any spend before scenery GET, voice generation, or GPU render.',
        'Send the rigger the file list above. Review test poses yourself. No auto approval.',
      ],
    },
    {
      category: 'FROM PAID RENDER LATER',
      items: [
        'Do not launch RunPod or any GPU now.',
        'After rigs, voices, scenery approval, and Blender are real, Justin can authorize one paid render separately.',
      ],
    },
  ];
}
