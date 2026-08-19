import { LOCATION_WORLD_NODES } from '@/lib/tivvlejoy-episode-scene-planner';
import {
  ARCHETYPE_IDS,
  DISTRICTS,
  EXISTING_LOCATIONS,
  type ArchetypeId,
  type District,
  type ExistingLocationId,
} from './types';

export const EXISTING_LOCATION_ARCHETYPE: Record<ExistingLocationId, ArchetypeId> = {
  home_village: 'VILLAGE_SQUARE',
  main_street: 'MARKET_STREET',
  bakery: 'BAKERY_EXTERIOR',
  map_shop: 'SHOP_EXTERIOR',
  forest_exit: 'FOREST_PATH',
  river_road: 'RIVERBANK',
  amusement_entrance: 'AMUSEMENT_PLAZA',
};

export const DISTRICT_FOR_WORLD_NODE: Record<string, District> = {
  HOME_NEIGHBORHOOD: 'HOME_DISTRICT',
  ENCHANTED_OUTSKIRTS: 'FOREST_EDGE',
  WATERFRONT_DISTRICT: 'RIVER_DISTRICT',
  AMUSEMENT_PARK: 'AMUSEMENT_DISTRICT',
  SKY_GATE: 'MAGICAL_ZONE',
  CITY_IN_THE_SKY: 'MAGICAL_ZONE',
};

export type ArchetypeMeta = {
  id: ArchetypeId;
  biome: string;
  locationType: 'EXTERIOR' | 'INTERIOR' | 'PATH' | 'WATER' | 'WILD';
  district: District;
  terrainType: string;
  pathType: string | null;
  waterType: string | null;
  interior: boolean;
  nativeProcedural: true;
  libraryLocation?: ExistingLocationId;
  landmarks: string[];
};

const meta = (
  id: ArchetypeId,
  biome: string,
  locationType: ArchetypeMeta['locationType'],
  district: District,
  terrainType: string,
  extras: Partial<ArchetypeMeta> = {},
): ArchetypeMeta => ({
  id,
  biome,
  locationType,
  district,
  terrainType,
  pathType: extras.pathType ?? null,
  waterType: extras.waterType ?? null,
  interior: locationType === 'INTERIOR',
  nativeProcedural: true,
  libraryLocation: extras.libraryLocation,
  landmarks: extras.landmarks ?? [],
});

export const ARCHETYPES: Record<ArchetypeId, ArchetypeMeta> = {
  VILLAGE_SQUARE: meta('VILLAGE_SQUARE', 'village', 'EXTERIOR', 'VILLAGE_CENTER', 'flat village ground', {
    pathType: 'village street',
    libraryLocation: 'home_village',
    landmarks: ['village clock'],
  }),
  VILLAGE_SIDE_STREET: meta('VILLAGE_SIDE_STREET', 'village', 'EXTERIOR', 'HOME_DISTRICT', 'flat village ground', {
    pathType: 'stone path',
  }),
  MARKET_STREET: meta('MARKET_STREET', 'village', 'EXTERIOR', 'VILLAGE_CENTER', 'flat village ground', {
    pathType: 'village street',
    libraryLocation: 'main_street',
  }),
  RESIDENTIAL_LANE: meta('RESIDENTIAL_LANE', 'village', 'EXTERIOR', 'HOME_DISTRICT', 'flat village ground', {
    pathType: 'garden path',
    libraryLocation: 'home_village',
  }),
  BAKERY_EXTERIOR: meta('BAKERY_EXTERIOR', 'village', 'EXTERIOR', 'SHOP_DISTRICT', 'flat village ground', {
    pathType: 'village street',
    libraryLocation: 'bakery',
    landmarks: ['bakery sign'],
  }),
  BAKERY_INTERIOR: meta('BAKERY_INTERIOR', 'village', 'INTERIOR', 'SHOP_DISTRICT', 'flat village ground', {
    libraryLocation: 'bakery',
  }),
  SHOP_EXTERIOR: meta('SHOP_EXTERIOR', 'village', 'EXTERIOR', 'SHOP_DISTRICT', 'flat village ground', {
    pathType: 'village street',
    libraryLocation: 'map_shop',
    landmarks: ['map shop sign'],
  }),
  SHOP_INTERIOR: meta('SHOP_INTERIOR', 'village', 'INTERIOR', 'SHOP_DISTRICT', 'flat village ground', {
    libraryLocation: 'map_shop',
  }),
  COZY_HOME_INTERIOR: meta('COZY_HOME_INTERIOR', 'village', 'INTERIOR', 'HOME_DISTRICT', 'flat village ground'),
  FOREST_PATH: meta('FOREST_PATH', 'forest', 'PATH', 'FOREST_EDGE', 'forest floor', {
    pathType: 'forest trail',
    libraryLocation: 'forest_exit',
  }),
  FOREST_CLEARING: meta('FOREST_CLEARING', 'forest', 'WILD', 'FOREST_INTERIOR', 'forest floor'),
  DEEP_FOREST: meta('DEEP_FOREST', 'forest', 'WILD', 'FOREST_INTERIOR', 'forest floor'),
  MAGICAL_FOREST: meta('MAGICAL_FOREST', 'forest', 'WILD', 'MAGICAL_ZONE', 'forest floor', {
    landmarks: ['giant tree'],
  }),
  RIVERBANK: meta('RIVERBANK', 'river', 'WATER', 'RIVER_DISTRICT', 'riverbank', {
    pathType: 'river road',
    waterType: 'river',
    libraryLocation: 'river_road',
  }),
  RIVER_CROSSING: meta('RIVER_CROSSING', 'river', 'WATER', 'RIVER_DISTRICT', 'riverbank', {
    pathType: 'bridge approach',
    waterType: 'stream',
    landmarks: ['bridge'],
  }),
  BRIDGE: meta('BRIDGE', 'river', 'PATH', 'RIVER_DISTRICT', 'road shoulder', {
    pathType: 'bridge approach',
    waterType: 'river',
    landmarks: ['bridge'],
  }),
  MEADOW: meta('MEADOW', 'meadow', 'WILD', 'COUNTRYSIDE', 'rolling meadow'),
  FLOWER_FIELD: meta('FLOWER_FIELD', 'meadow', 'WILD', 'COUNTRYSIDE', 'rolling meadow'),
  HILLTOP: meta('HILLTOP', 'meadow', 'WILD', 'COUNTRYSIDE', 'gentle hills', {
    landmarks: ['hill overlook'],
  }),
  COUNTRY_ROAD: meta('COUNTRY_ROAD', 'countryside', 'PATH', 'COUNTRYSIDE', 'road shoulder', {
    pathType: 'dirt trail',
  }),
  FARM_EDGE: meta('FARM_EDGE', 'countryside', 'EXTERIOR', 'COUNTRYSIDE', 'rolling meadow', {
    pathType: 'dirt trail',
  }),
  PICNIC_AREA: meta('PICNIC_AREA', 'meadow', 'WILD', 'COUNTRYSIDE', 'rolling meadow', {
    pathType: 'garden path',
  }),
  POND: meta('POND', 'water', 'WATER', 'RIVER_DISTRICT', 'riverbank', { waterType: 'pond' }),
  LAKE_EDGE: meta('LAKE_EDGE', 'water', 'WATER', 'RIVER_DISTRICT', 'riverbank', { waterType: 'lake edge' }),
  ROCKY_TRAIL: meta('ROCKY_TRAIL', 'mountain', 'PATH', 'COUNTRYSIDE', 'rocky trail', { pathType: 'dirt trail' }),
  MOUNTAIN_OVERLOOK: meta('MOUNTAIN_OVERLOOK', 'mountain', 'WILD', 'COUNTRYSIDE', 'mountain overlook', {
    landmarks: ['hill overlook'],
  }),
  CAVE_ENTRANCE: meta('CAVE_ENTRANCE', 'cave', 'WILD', 'MAGICAL_ZONE', 'rocky trail'),
  CAVE_INTERIOR: meta('CAVE_INTERIOR', 'cave', 'INTERIOR', 'MAGICAL_ZONE', 'cave floor'),
  BEACH: meta('BEACH', 'coast', 'WATER', 'RIVER_DISTRICT', 'beach', { waterType: 'lake edge' }),
  COASTAL_PATH: meta('COASTAL_PATH', 'coast', 'PATH', 'RIVER_DISTRICT', 'beach', { pathType: 'dirt trail' }),
  SNOW_FIELD: meta('SNOW_FIELD', 'snow', 'WILD', 'COUNTRYSIDE', 'snow ground'),
  SNOW_VILLAGE: meta('SNOW_VILLAGE', 'snow', 'EXTERIOR', 'VILLAGE_CENTER', 'snow ground', {
    pathType: 'village street',
    libraryLocation: 'home_village',
  }),
  AUTUMN_FOREST: meta('AUTUMN_FOREST', 'forest', 'WILD', 'FOREST_INTERIOR', 'forest floor'),
  SPRING_MEADOW: meta('SPRING_MEADOW', 'meadow', 'WILD', 'COUNTRYSIDE', 'rolling meadow'),
  RAINY_STREET: meta('RAINY_STREET', 'village', 'EXTERIOR', 'VILLAGE_CENTER', 'flat village ground', {
    pathType: 'village street',
    libraryLocation: 'main_street',
  }),
  FESTIVAL_VILLAGE: meta('FESTIVAL_VILLAGE', 'village', 'EXTERIOR', 'VILLAGE_CENTER', 'flat village ground', {
    pathType: 'village street',
    libraryLocation: 'home_village',
  }),
  NIGHT_VILLAGE: meta('NIGHT_VILLAGE', 'village', 'EXTERIOR', 'VILLAGE_CENTER', 'flat village ground', {
    pathType: 'village street',
    libraryLocation: 'home_village',
  }),
  MAGICAL_NIGHT_CLEARING: meta('MAGICAL_NIGHT_CLEARING', 'forest', 'WILD', 'MAGICAL_ZONE', 'forest floor', {
    landmarks: ['giant tree'],
  }),
  AMUSEMENT_PATH: meta('AMUSEMENT_PATH', 'amusement', 'PATH', 'AMUSEMENT_DISTRICT', 'flat village ground', {
    pathType: 'amusement path',
    libraryLocation: 'amusement_entrance',
  }),
  AMUSEMENT_PLAZA: meta('AMUSEMENT_PLAZA', 'amusement', 'EXTERIOR', 'AMUSEMENT_DISTRICT', 'flat village ground', {
    pathType: 'amusement path',
    libraryLocation: 'amusement_entrance',
    landmarks: ['amusement entrance'],
  }),
  BACKSTAGE_SERVICE_PATH: meta('BACKSTAGE_SERVICE_PATH', 'amusement', 'PATH', 'AMUSEMENT_DISTRICT', 'flat village ground', {
    pathType: 'amusement path',
  }),
  GENERIC_INTERIOR_ROOM: meta('GENERIC_INTERIOR_ROOM', 'interior', 'INTERIOR', 'HOME_DISTRICT', 'flat village ground'),
};

export function archetypeMeta(id: ArchetypeId): ArchetypeMeta {
  return ARCHETYPES[id];
}

export function existingWorldNode(locationId: string) {
  if ((EXISTING_LOCATIONS as readonly string[]).includes(locationId)) {
    return LOCATION_WORLD_NODES[locationId as ExistingLocationId];
  }
  return null;
}

export function districtForLocation(locationId: string, archetypeId: ArchetypeId): District {
  const node = existingWorldNode(locationId);
  if (node && DISTRICT_FOR_WORLD_NODE[node]) return DISTRICT_FOR_WORLD_NODE[node]!;
  return ARCHETYPES[archetypeId].district;
}

export function allArchetypeIds() {
  return [...ARCHETYPE_IDS];
}

export { DISTRICTS };
