# Voice Setup Guide

Provider-independent voice configuration lives at `/voices` and `VoiceProductionConfig`.

## Rules

- Do **not** invent provider voice IDs.
- Configure provider + voice ID yourself after creating voices in your TTS vendor.
- Run an audition workflow; capture notes.
- Pip and Goat voices cannot enter final production until **explicitly approved**.
- Final pipeline stage `VOICE_GENERATION` blocks until both founding characters are approved.

## Fields per character

- provider
- voice ID
- voice version
- speed / pitch / stability (where supported)
- pronunciation dictionary
- emotional delivery parameters
- approval status

## What you need to provide next

1. Choose a TTS provider (ElevenLabs, Azure, etc.)  
2. Create / select a real Pip voice → paste Voice ID  
3. Create / select a real Goat voice → paste Voice ID  
4. Audition both in-studio; write audition notes  
5. Click **Approve after audition** for each  
6. Optional: pronunciation dictionary JSON for names/places  
