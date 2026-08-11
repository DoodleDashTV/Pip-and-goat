import { NextResponse } from 'next/server';
import {
  performanceDashboardService,
  resolvePerformanceConfig,
  autoRenderConcurrency,
  detectHardware,
  detectBlenderDevices,
  dirtyShotPlanner,
  shotRenderCacheService,
  VERTICAL_SLICE_EPISODE_ID,
} from '@doodle-dash/production';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'dashboard';
  if (action === 'config') {
    const config = resolvePerformanceConfig();
    return NextResponse.json({
      config,
      concurrency: autoRenderConcurrency(config),
      hardware: detectHardware(),
      blenderDevice: detectBlenderDevices(),
    });
  }
  if (action === 'dirty-plan') {
    const episodeId = searchParams.get('episodeId') || VERTICAL_SLICE_EPISODE_ID;
    const profileCode = searchParams.get('profileCode') || 'DRAFT_FAST';
    const plan = await dirtyShotPlanner.planEpisode({
      episodeId,
      profileCode,
      buildFingerprint: (shotId, code) => shotRenderCacheService.buildFingerprint(shotId, code),
    });
    return NextResponse.json(plan);
  }
  const dashboard = await performanceDashboardService.build();
  return NextResponse.json(dashboard);
}
