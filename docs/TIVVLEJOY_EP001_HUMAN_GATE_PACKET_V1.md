# TIVVLEJOY_EP001_HUMAN_GATE_PACKET_V1

This packet is read-only planning and review infrastructure. It does not issue approvals, spend money, contact providers, launch Blender, mutate Production, or replace human judgment.

## Purpose

Bind every EP001 human decision to the exact subject SHA-256 that was reviewed so approvals cannot silently transfer to regenerated audio, changed rigs, altered scenery, different playblasts, revised story packages, or different paid-render execution plans.

## Decision classes

- 7 episode-admission gates inherited from the EP001 evidence admission board.
- 8 per-line voice-performance reviews, one for each canonical dialogue line.
- 8 scenery source/dependency reviews, covering every deep-inspection item.

Total: 23 pending human decision rows.

## Receipt requirements

Each future decision receipt must contain the decision ID, binding SHA-256, APPROVED or REJECTED decision, reviewer identity, review timestamp, and immutable receipt SHA-256.

## Fail-closed behavior

- No automatic approval.
- Approval does not transfer across changed hashes.
- Real audio must exist before voice approval.
- License/provenance plus deep-inspection evidence must exist before scenery approval.
- Exact rig SHA, technical inspection, deformation media, and test-pose review must exist before rig approval.
- Final visual approval waits for a real-rig playblast that reflects approved rigs, admitted scenery, and real voice timing.
- Paid final-render authorization remains an independent final spending gate.
