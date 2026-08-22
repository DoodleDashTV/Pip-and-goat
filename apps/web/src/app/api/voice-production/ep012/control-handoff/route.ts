import { NextResponse } from "next/server";
import "@/lib/voice-production/durable-voice-ledger-postgres";
import {
  fallbackFirstEpisodeVoiceHandoffModel,
  projectEp012VoiceHandoffForProductionControl,
} from "@/lib/tivvlejoy-real-production-unblock/console-model";
import { runEp012VoiceProductionHandoff } from "@/lib/tivvlejoy-real-production-unblock/ep012-voice-production-handoff";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      projectEp012VoiceHandoffForProductionControl(
        await runEp012VoiceProductionHandoff(),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(fallbackFirstEpisodeVoiceHandoffModel(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
