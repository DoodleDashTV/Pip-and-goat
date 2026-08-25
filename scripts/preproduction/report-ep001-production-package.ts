/**
 * Deterministic, zero-cost EP001 production-package report.
 * This command performs no network calls, media generation, or storage writes.
 */
import { compileEp001ProductionPackage } from '../../apps/web/src/lib/tivvlejoy-ep001-production-package';

const compiled = compileEp001ProductionPackage();

process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: compiled.schemaVersion,
      episodeId: compiled.episodeId,
      workingTitle: compiled.workingTitle,
      classification: compiled.classification,
      pipelineClass: compiled.pipelineClass,
      packageSha256: compiled.packageSha256,
      format: compiled.format,
      story: {
        logline: compiled.story.logline,
        theme: compiled.story.theme,
        hook: compiled.story.hook,
        payoff: compiled.story.payoff,
        button: compiled.story.button,
      },
      counts: {
        shots: compiled.shots.length,
        dialogueLines: compiled.dialogue.length,
        captions: compiled.captions.length,
        sceneryBindings: compiled.sceneryBindings.length,
        semanticCharacterPlans: compiled.animation.plans.length,
      },
      timeline: {
        totalFrames: compiled.editorial.totalFrames,
        captionQcPassed: compiled.captionQc.passed,
        shotIds: compiled.shots.map((shot) => shot.shotId),
      },
      readiness: compiled.readiness,
      productionPacket: {
        readiness: compiled.productionPacket.readiness,
        productionPacketSha256: compiled.productionPacket.productionPacketSha256,
        blockingDependencies: compiled.productionPacket.reasons
          .filter((reason) => reason.blocksRealProduction)
          .map((reason) => reason.key),
      },
      safety: compiled.safety,
    },
    null,
    2,
  )}\n`,
);
