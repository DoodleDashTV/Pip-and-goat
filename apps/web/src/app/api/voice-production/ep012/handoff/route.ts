import { NextResponse } from "next/server";
import "@/lib/voice-production/durable-voice-ledger-postgres";
import {
  runEp012VoiceProductionHandoff,
  unavailableEp012VoiceProductionHandoff,
} from "@/lib/tivvlejoy-real-production-unblock/ep012-voice-production-handoff";

export async function GET() {
  try {
    return NextResponse.json(await runEp012VoiceProductionHandoff());
  } catch {
    return NextResponse.json(unavailableEp012VoiceProductionHandoff());
  }
}
