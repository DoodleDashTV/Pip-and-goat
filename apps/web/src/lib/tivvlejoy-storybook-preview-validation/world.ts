import {
  DRESSING_ANCHORS,
  DRESSING_CATEGORIES,
  MATERIAL_CLASSES,
  SIGN_TEMPLATES,
  type MaterialClass,
} from '@/lib/tivvlejoy-storybook-environment';
import { PREVIEW_VALIDATION_SCHEMA, PREVIEW_VALIDATION_SEED } from './types';

export type SyntheticPrimitive = {
  id: string;
  kind: 'box' | 'plane' | 'cylinder' | 'quad' | 'instance-cluster';
  role: string;
  materialClass: MaterialClass;
  position: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  triangles: number;
};

export type SyntheticBuilding = {
  id: string;
  kind: 'bakery-storefront' | 'map-shop-storefront' | 'cottage-facade';
  productionApproved: false;
  primitives: SyntheticPrimitive[];
};

function primitive(
  id: string,
  kind: SyntheticPrimitive['kind'],
  role: string,
  materialClass: MaterialClass,
  position: SyntheticPrimitive['position'],
  size: SyntheticPrimitive['size'],
  triangles: number,
): SyntheticPrimitive {
  return { id, kind, role, materialClass, position, size, triangles };
}

export function syntheticVillageWorld(seed = PREVIEW_VALIDATION_SEED) {
  const bakery: SyntheticBuilding = {
    id: 'FACADE_BAKERY',
    kind: 'bakery-storefront',
    productionApproved: false,
    primitives: [
      primitive('bakery-wall', 'box', 'facade', 'wall', { x: -4, y: 2, z: 0 }, { x: 6, y: 4, z: 0.4 }, 12),
      primitive('bakery-roof', 'box', 'roof', 'roof', { x: -4, y: 4.4, z: 0 }, { x: 6.4, y: 1.2, z: 2.2 }, 16),
      primitive('bakery-door', 'box', 'door', 'door', { x: -5.2, y: 1.1, z: 0.22 }, { x: 1.1, y: 2.2, z: 0.08 }, 12),
      primitive('bakery-window', 'quad', 'window', 'window', { x: -3.1, y: 2.1, z: 0.22 }, { x: 1.4, y: 1.4, z: 0.04 }, 2),
      primitive('bakery-glass', 'quad', 'glass', 'glass', { x: -3.1, y: 2.1, z: 0.23 }, { x: 1.2, y: 1.2, z: 0.01 }, 2),
      primitive('bakery-wood', 'box', 'trim', 'wood', { x: -4, y: 0.2, z: 0.2 }, { x: 6, y: 0.3, z: 0.3 }, 12),
      primitive('bakery-sign', 'quad', 'sign', 'sign', { x: -4, y: 3.4, z: 0.28 }, { x: 1.8, y: 0.7, z: 0.04 }, 2),
    ],
  };
  const mapShop: SyntheticBuilding = {
    id: 'FACADE_MAP_SHOP',
    kind: 'map-shop-storefront',
    productionApproved: false,
    primitives: [
      primitive('map-wall', 'box', 'facade', 'wall', { x: 3, y: 2, z: 0 }, { x: 5.4, y: 4, z: 0.4 }, 12),
      primitive('map-metal', 'box', 'awning-frame', 'metal', { x: 3, y: 3.1, z: 0.7 }, { x: 4.6, y: 0.08, z: 1.2 }, 12),
      primitive('map-cloth', 'box', 'awning', 'cloth', { x: 3, y: 3, z: 0.7 }, { x: 4.6, y: 0.12, z: 1.2 }, 12),
      primitive('map-door', 'box', 'door', 'door', { x: 1.8, y: 1.1, z: 0.22 }, { x: 1.1, y: 2.2, z: 0.08 }, 12),
      primitive('map-window', 'quad', 'window', 'window', { x: 3.8, y: 2, z: 0.22 }, { x: 1.6, y: 1.5, z: 0.04 }, 2),
      primitive('map-sign', 'cylinder', 'sign', 'sign', { x: 3, y: 3.7, z: 0.4 }, { x: 0.9, y: 0.9, z: 0.06 }, 48),
    ],
  };
  const cottage: SyntheticBuilding = {
    id: 'FACADE_COTTAGE',
    kind: 'cottage-facade',
    productionApproved: false,
    primitives: [
      primitive('cottage-stone', 'box', 'base', 'stone', { x: 9.2, y: 0.6, z: 0 }, { x: 4.8, y: 1.2, z: 0.5 }, 12),
      primitive('cottage-wall', 'box', 'facade', 'wall', { x: 9.2, y: 2.4, z: 0 }, { x: 4.8, y: 2.4, z: 0.4 }, 12),
      primitive('cottage-roof', 'box', 'roof', 'roof', { x: 9.2, y: 4.1, z: 0 }, { x: 5.2, y: 1.1, z: 2 }, 16),
      primitive('cottage-window', 'quad', 'window', 'window', { x: 9.2, y: 2.6, z: 0.22 }, { x: 1.1, y: 1.1, z: 0.04 }, 2),
    ],
  };

  const street: SyntheticPrimitive[] = [
    primitive('road', 'plane', 'road', 'road_path', { x: 2, y: 0, z: 4.2 }, { x: 22, y: 0.04, z: 4 }, 2),
    primitive('sidewalk', 'plane', 'sidewalk', 'ground', { x: 2, y: 0.02, z: 1.6 }, { x: 22, y: 0.04, z: 1.6 }, 2),
    primitive('fountain', 'cylinder', 'water', 'water', { x: 12, y: 0.2, z: 5.4 }, { x: 1.4, y: 0.3, z: 1.4 }, 48),
  ];

  const dressing: SyntheticPrimitive[] = [
    primitive('flower-box-l', 'box', 'WINDOW_BOX', 'flower', { x: -3.1, y: 1.2, z: 0.4 }, { x: 1.3, y: 0.3, z: 0.3 }, 12),
    primitive('bench', 'box', 'SIDEWALK', 'wood', { x: -1, y: 0.35, z: 1.5 }, { x: 1.4, y: 0.4, z: 0.45 }, 24),
    primitive('crate', 'box', 'SHOP_FRONT', 'prop', { x: -5.8, y: 0.25, z: 0.7 }, { x: 0.5, y: 0.5, z: 0.5 }, 12),
    primitive('basket', 'cylinder', 'SHOP_FRONT', 'prop', { x: -5.2, y: 0.18, z: 0.8 }, { x: 0.35, y: 0.25, z: 0.35 }, 32),
    primitive('lantern', 'cylinder', 'CORNER', 'metal', { x: -7, y: 2.4, z: 1.2 }, { x: 0.16, y: 0.5, z: 0.16 }, 24),
    primitive('fence', 'box', 'PATH_EDGE', 'wood', { x: 11, y: 0.5, z: 2.4 }, { x: 3.2, y: 0.9, z: 0.08 }, 12),
    primitive('foliage', 'instance-cluster', 'BACKGROUND', 'foliage', { x: 0, y: 1.6, z: -3.5 }, { x: 18, y: 3, z: 2 }, 180),
    primitive('flowers', 'instance-cluster', 'GARDEN', 'flower', { x: 8.4, y: 0.2, z: 2.1 }, { x: 2, y: 0.4, z: 1.2 }, 60),
  ];

  const signs = [
    { id: 'SIGN_BAKERY_HANGING', template: 'TJ_SIGN_HANGING' as const, icon: 'bakery', text: 'OVEN' },
    { id: 'SIGN_MAP_ROUND', template: 'TJ_SIGN_ROUND' as const, icon: 'book_map', text: 'MAPS' },
    { id: 'SIGN_COTTAGE_WALL', template: 'TJ_SIGN_WALL' as const, icon: 'home', text: 'HOME' },
  ];

  const primitives = [...bakery.primitives, ...mapShop.primitives, ...cottage.primitives, ...street, ...dressing];
  const materialsUsed = Array.from(new Set(primitives.map((item) => item.materialClass))).sort();

  return {
    schemaVersion: PREVIEW_VALIDATION_SCHEMA,
    locationId: 'main_street' as const,
    displayName: 'Synthetic TivvleJoy village main street',
    seed,
    productionApproved: false as const,
    licensedSource: false as const,
    botaniq: false as const,
    geoScatter: false as const,
    commercialBytes: false as const,
    buildings: [bakery, mapShop, cottage],
    street,
    dressing,
    signs,
    reusableSignTemplates: signs.map((item) => item.template),
    availableSignTemplates: SIGN_TEMPLATES,
    dressingAnchors: DRESSING_ANCHORS,
    dressingCategories: DRESSING_CATEGORIES,
    primitives,
    materialsUsed,
    requiredMaterialClasses: MATERIAL_CLASSES,
    triangleEstimate: primitives.reduce((sum, item) => sum + item.triangles, 0),
  };
}

export function worldCoversRequiredMaterials(world = syntheticVillageWorld()): boolean {
  return MATERIAL_CLASSES.every((item) => world.materialsUsed.includes(item));
}
