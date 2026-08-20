import { BLENDER_ANIMATION_OPS, type BlenderAnimationOp } from './types';

export type FutureBlenderAnimationDriver = {
  schema: 'TIVVLEJOY_FUTURE_BLENDER_ANIMATION_DRIVER_V1';
  operations: BlenderAnimationOp[];
  generatedExecutionAuthorized: false;
  blenderExecuted: false;
  commercialCharacterBytesRead: false;
  notes: string;
};

export function futureBlenderAnimationDriver(): FutureBlenderAnimationDriver {
  return {
    schema: 'TIVVLEJOY_FUTURE_BLENDER_ANIMATION_DRIVER_V1',
    operations: [...BLENDER_ANIMATION_OPS],
    generatedExecutionAuthorized: false,
    blenderExecuted: false,
    commercialCharacterBytesRead: false,
    notes: 'Contract only. A future adapter may consume these operations after a real production rig is admitted.',
  };
}

export function blenderExecutionAuthorized(): false {
  return false;
}
