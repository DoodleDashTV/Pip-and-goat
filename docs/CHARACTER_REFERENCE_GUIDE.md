# Character Reference Guide

Approved visual references become **immutable** production locks for Pip and Goat.

## Rules

- Upload real reference images first (Asset / References surfaces).
- Approve via `POST /api/production/references` only when an uploaded asset exists.
- After approval, references are immutable versioned production records.
- AI pipelines that support reference conditioning **must** use the approved reference.
- If reference conditioning fails or the provider lacks reference support → **FAIL THE GENERATION JOB**.
- Never silently fall back to text-only Pip/Goat recreation.

## Lock fields

- Primary character reference
- Secondary references
- Expression references
- Approved color palette
- Proportions
- Silhouette
- Clothing / accessories
- Forbidden visual changes
- Model-version association

## What you need to provide next

1. Primary turnaround sheet for Pip (front/side/back)  
2. Primary turnaround sheet for Goat  
3. Expression sheet for each  
4. Written palette + proportion notes (or attach as JSON in approve call)  
5. Explicit forbidden-change notes (silhouette, palette, costume locks)  
