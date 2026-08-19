import type { ArchetypeId, Season, TimeOfDay, Weather, WorldBuilderInput } from './types';

function recipe(
  name: string,
  locationId: string,
  archetypeId: ArchetypeId,
  season: Season,
  weather: Weather,
  timeOfDay: TimeOfDay,
  storyPurpose: string,
  extras: Partial<WorldBuilderInput> = {},
): WorldBuilderInput & { name: string } {
  return {
    name,
    locationId,
    archetypeId,
    season,
    weather,
    timeOfDay,
    storyPurpose,
    qualityTarget: extras.qualityTarget ?? 'HERO',
    seed: extras.seed ?? 4170179,
    storyPropIds: extras.storyPropIds,
    storyPropStates: extras.storyPropStates,
    cameraTemplateId: extras.cameraTemplateId,
    focalTarget: extras.focalTarget,
    lightingPresetId: extras.lightingPresetId,
    requiredHeroRoles: extras.requiredHeroRoles,
  };
}

export const ENVIRONMENT_RECIPES = [
  recipe('Sunny Bakery Morning', 'bakery', 'BAKERY_EXTERIOR', 'SUMMER', 'CLEAR', 'MORNING_WARM', 'open on the bakery'),
  recipe('Rainy Main Street', 'main_street', 'RAINY_STREET', 'AUTUMN', 'RAIN', 'RAINY_COZY', 'walk through rain'),
  recipe('Autumn Forest Trail', 'forest_exit', 'AUTUMN_FOREST', 'AUTUMN', 'PARTLY_CLOUDY', 'DAY_ADVENTURE', 'follow a forest trail'),
  recipe('Magical Night Clearing', 'forest_exit', 'MAGICAL_NIGHT_CLEARING', 'SUMMER', 'MAGICAL_SPARKLE', 'MAGICAL_NIGHT', 'reveal a glowing grove'),
  recipe('Spring Flower Meadow', 'home_village', 'SPRING_MEADOW', 'SPRING', 'CLEAR', 'MORNING_WARM', 'picnic approach'),
  recipe('Cozy Bakery Interior', 'bakery', 'BAKERY_INTERIOR', 'AUTUMN', 'OVERCAST', 'MORNING_WARM', 'counter conversation'),
  recipe('Foggy River Road', 'river_road', 'RIVERBANK', 'AUTUMN', 'FOG', 'OVERCAST_SOFT', 'travel along the river'),
  recipe('Festival Village Evening', 'home_village', 'FESTIVAL_VILLAGE', 'SUMMER', 'CLEAR', 'EVENING_FESTIVAL', 'festival gathering'),
  recipe('Snowy Village Morning', 'home_village', 'SNOW_VILLAGE', 'WINTER', 'LIGHT_SNOW', 'MORNING_WARM', 'quiet winter street'),
  recipe('Golden Hour Hilltop', 'forest_exit', 'HILLTOP', 'AUTUMN', 'CLEAR', 'GOLDEN_HOUR', 'lookout beat'),
  recipe('Map Shop Afternoon', 'map_shop', 'SHOP_EXTERIOR', 'SUMMER', 'CLEAR', 'MIDDAY', 'find the map shop'),
  recipe('Forest River Crossing', 'river_road', 'RIVER_CROSSING', 'SPRING', 'PARTLY_CLOUDY', 'DAY_ADVENTURE', 'cross the stream'),
  recipe('Summer Picnic Meadow', 'home_village', 'PICNIC_AREA', 'SUMMER', 'CLEAR', 'DAY_ADVENTURE', 'picnic rest'),
  recipe('Windy Country Road', 'river_road', 'COUNTRY_ROAD', 'SUMMER', 'WINDY', 'DAY_ADVENTURE', 'travel beat'),
  recipe('Nighttime Amusement Entrance', 'amusement_entrance', 'AMUSEMENT_PLAZA', 'SUMMER', 'CLEAR', 'NIGHT_COZY', 'arrive at lights'),
  recipe('Cozy Home Interior', 'home_village', 'COZY_HOME_INTERIOR', 'WINTER', 'OVERCAST', 'NIGHT_COZY', 'home beat'),
  recipe('Deep Forest Path', 'forest_exit', 'DEEP_FOREST', 'SUMMER', 'PARTLY_CLOUDY', 'DAY_ADVENTURE', 'get a little lost'),
  recipe('Beach Morning', 'river_road', 'BEACH', 'SUMMER', 'CLEAR', 'DAWN', 'shoreline look'),
  recipe('Cave Entrance Dusk', 'forest_exit', 'CAVE_ENTRANCE', 'AUTUMN', 'OVERCAST', 'SUNSET', 'threshold beat'),
  recipe('Cave Interior Placeholder', 'forest_exit', 'CAVE_INTERIOR', 'AUTUMN', 'FOG', 'BLUE_HOUR', 'explore the cave'),
  recipe('Market Street Midday', 'main_street', 'MARKET_STREET', 'SUMMER', 'CLEAR', 'MIDDAY', 'crowd-free street'),
  recipe('Residential Lane Spring', 'home_village', 'RESIDENTIAL_LANE', 'SPRING', 'CLEAR', 'MORNING_WARM', 'leave home'),
  recipe('Lake Edge Fog', 'river_road', 'LAKE_EDGE', 'SPRING', 'FOG', 'DAWN', 'quiet water'),
  recipe('Rocky Trail Climb', 'forest_exit', 'ROCKY_TRAIL', 'SUMMER', 'CLEAR', 'DAY_ADVENTURE', 'climb'),
  recipe('Mountain Overlook Sunset', 'forest_exit', 'MOUNTAIN_OVERLOOK', 'AUTUMN', 'CLEAR', 'SUNSET', 'wide look'),
  recipe('Amusement Path Day', 'amusement_entrance', 'AMUSEMENT_PATH', 'SUMMER', 'CLEAR', 'DAY_ADVENTURE', 'walk in'),
  recipe('Snow Field Sparkle', 'home_village', 'SNOW_FIELD', 'WINTER', 'SNOW', 'MIDDAY', 'open snow'),
  recipe('Pond Reeds Morning', 'river_road', 'POND', 'SPRING', 'CLEAR', 'MORNING_WARM', 'pond look'),
  recipe('Night Village Lamps', 'home_village', 'NIGHT_VILLAGE', 'SUMMER', 'CLEAR', 'NIGHT_COZY', 'walk home'),
  recipe('Farm Edge Wind', 'home_village', 'FARM_EDGE', 'SUMMER', 'WINDY', 'GOLDEN_HOUR', 'edge of town'),
] as const;

export function recipeByName(name: string) {
  return ENVIRONMENT_RECIPES.find((item) => item.name === name);
}

export function recipeCount() {
  return ENVIRONMENT_RECIPES.length;
}
