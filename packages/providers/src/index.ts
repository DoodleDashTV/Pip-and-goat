/**
 * Optional video provider interface — implementations come later.
 * Native 3D production must not depend on these providers.
 */
export interface VideoProvider {
  generateScene(input: unknown): Promise<unknown>;
  getCapabilities(): Promise<unknown>;
  estimateCost(input: unknown): Promise<unknown>;
  checkStatus(jobId: string): Promise<unknown>;
  downloadResult(jobId: string): Promise<unknown>;
  supportsReferenceImages(): boolean;
  supportsAudio(): boolean;
}
