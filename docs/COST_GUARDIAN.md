# Cost Guardian

Before any paid external generation:

1. Identify provider + model  
2. Estimate usage + cost  
3. Record reason external generation is needed  
4. Require explicit **APPROVE / CANCEL / USE BLENDER INSTEAD**

Never silently spend API money. Blender failure → **BLOCK**, not AI fallback.

AI video (Sora/Seedance/etc.) remains optional specialty. For Pip/Goat appearance, approved reference conditioning is mandatory; failure → fail closed.

Thresholds are configurable in Production Settings (`paidGenerationApprovalThresholdUsd`).
