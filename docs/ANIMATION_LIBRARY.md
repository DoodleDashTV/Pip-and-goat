# Animation Library

Semantic categories (initial): IDLE, WALK, RUN, JUMP, LAND, TURN, WAVE, POINT, NOD, SHAKE_HEAD, LOOK, TALK, LISTEN, THINK, LAUGH, CRY, SURPRISED, SCARED, HAPPY, SAD, EXCITED, PICK_UP, PUT_DOWN, HOLD, PUSH, PULL, SIT, STAND, CELEBRATE — plus custom.

## Tracked fields

animation ID, name, version, character/rig compatibility, duration, loopable, root motion, facial component, tags, quality status, approval, source, usage count, last used, notes.

## Reuse decision order

1. EXACT REUSE  
2. REUSE + RETARGET  
3. REUSE + MODIFY  
4. PROCEDURAL COMPOSITION (Motion Composer layers)  
5. NEW NATIVE ANIMATION  
6. OPTIONAL AI ASSISTANCE  

Reuse may apply timing/speed/mirror/blend/facial/eye/gesture variation so episodes do not look robotic.

## Motion Composer layers

base body · upper-body gesture · head · eyes · facial expression · lip sync · prop interaction
