# TIVVLEJOY_CHARACTER_RIG_CONTRACT_V1

Generic rig capability contract. Identity is hash-based.

Required identity fields:

- `characterId`
- `rigId`
- `rigVersion`
- `rigDependencySha256`
- `sourceReceiptRef` / `sourceSha256`
- `rigApprovalReceiptRef` / `rigApprovalSha256`
- `blenderVersionCompatibility`

Capabilities are **families**, not seller bone names:

`ROOT_MOTION`, `BODY_CENTER`, `CHEST`, `NECK`, `HEAD`, `EYE_LEFT`, `EYE_RIGHT`, `EYE_AIM`, `EYELID_LEFT`, `EYELID_RIGHT`, `MOUTH_OR_BEAK_UPPER`, `MOUTH_OR_BEAK_LOWER`, `FACE_EXPRESSION`, `ARM_OR_WING_LEFT`, `ARM_OR_WING_RIGHT`, `LEG_LEFT`, `LEG_RIGHT`, `FOOT_LEFT`, `FOOT_RIGHT`, `TOE_OR_DIGIT_CONTROLS`, `ACCESSORY_CONTROLS`, `PROP_ATTACHMENT_POINTS`.

## Pip required profile

Required semantic controls include head, neck, eyes, eyelids, upper/lower beak (`BEAK_OPEN`), long wings, legs, three-toed feet, root/body/chest, prop attachment, scarf, backpack, both straps, and copper spiral.

Desirable: rear hallux.

Optional: crest secondary motion.

## Goat required profile

Required: head, neck, eyes, jaw/mouth, face expression, legs, hooves, body, chest, root motion, prop interaction, collar, round tag.

Desirable: eyelids if the rig has them.

Optional: ears, sitting.

Do not hard-code freelancer bone names. Character-specific controls may extend the generic families.
