import { RigArrivalConsole } from '@/components/preview/RigArrivalConsole';
import { compileRealInputConvergence } from '@/lib/tivvlejoy-real-input-convergence/compile';
import { buildRigArrivalConsoleModel } from '@/lib/tivvlejoy-real-input-convergence/console-model';
import { compileRigArrivalChecklist } from '@/lib/tivvlejoy-real-production-unblock/rig-checklist';
import { compileRigHandoffPackage } from '@/lib/tivvlejoy-real-production-unblock/rig-handoff';

export const dynamic = 'force-dynamic';

export default async function RigArrivalPage() {
  const report = await compileRealInputConvergence({ authorizeReads: false });
  const model = buildRigArrivalConsoleModel(report);
  const handoff = compileRigHandoffPackage();
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <RigArrivalConsole model={model} handoff={handoff} checklist={compileRigArrivalChecklist()} />
    </main>
  );
}
