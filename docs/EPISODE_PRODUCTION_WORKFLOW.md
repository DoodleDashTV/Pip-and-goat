# Episode Production Workflow

Normal user path (no raw Blender/FFmpeg/DB interaction required):

1. **NEW EPISODE** (`/new-episode`) — idea + 15/30/45/60s  
2. Generate story → Review → Approve  
3. Generate storyboard/shots → Review  
4. **BUILD EPISODE** (readiness gates under STRICT_CHARACTER_LOCK)  
5. Draft render (**DRAFT_FAST** → review → **DRAFT_HD**)  
6. Rerender only changed shots  
7. Approve Final  
8. **FINAL_1080P** EEVEE render  
9. Audio / captions  
10. Export YouTube package  

Dashboard (`/`) highlights: NEW EPISODE, CONTINUE EPISODE, ASSETS, ANIMATIONS, RENDER QUEUE, READINESS, COSTS.

Production Settings: `/production-settings`.
