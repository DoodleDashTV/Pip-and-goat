import { DraftReviewClient } from '@/components/DraftReviewClient';

export const dynamic = 'force-dynamic';

export default async function DraftReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DraftReviewClient episodeId={id} />;
}
