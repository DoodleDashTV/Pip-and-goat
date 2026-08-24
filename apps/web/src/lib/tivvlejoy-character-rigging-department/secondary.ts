export type SecondaryControl = {
  id: string;
  presentIf: string;
  method: 'DETERMINISTIC_CONTROL' | 'OPTIONAL_SIMULATION';
  requiredForGoat: boolean;
};

export const SECONDARY_CONTROLS: readonly SecondaryControl[] = [
  { id: 'ears', presentIf: 'ear geometry exists', method: 'DETERMINISTIC_CONTROL', requiredForGoat: false },
  { id: 'horns', presentIf: 'horn movement is stylistically appropriate', method: 'DETERMINISTIC_CONTROL', requiredForGoat: false },
  { id: 'collar', presentIf: 'collar accessory exists', method: 'DETERMINISTIC_CONTROL', requiredForGoat: true },
  { id: 'round_tag', presentIf: 'round Goat tag exists', method: 'DETERMINISTIC_CONTROL', requiredForGoat: true },
  { id: 'scarf', presentIf: 'scarf exists in delivered asset', method: 'DETERMINISTIC_CONTROL', requiredForGoat: false },
  { id: 'fur', presentIf: 'fur islands need follow-through', method: 'DETERMINISTIC_CONTROL', requiredForGoat: false },
];

export function simulationMandatory(): false {
  return false;
}
