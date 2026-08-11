import { EpisodeReadinessClient } from '@/components/EpisodeReadinessClient';

export const dynamic = 'force-dynamic';

export default async function EpisodeReadinessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EpisodeReadinessClient episodeId={id} />;
}
