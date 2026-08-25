from __future__ import annotations

ROLE_HINTS = {
    "WINGS": ("wing",),
    "CREST": ("crest", "feather"),
    "BACKPACK": ("backpack",),
    "STRAP": ("strap",),
    "ACCESSORY": ("spiral", "copper"),
    "FUR": ("fur",),
    "HORNS": ("horn",),
    "EARS": ("ear",),
    "COLLAR": ("collar",),
    "TAG": ("tag", "nameplate", "compass"),
    "SCARF": ("scarf",),
    "EYES": ("eye",),
    "MOUTH": ("mouth", "jaw", "beak"),
    "HEAD": ("head",),
    "BODY": ("body",),
}


def map_object_name(name: str) -> str:
    lowered = name.lower()
    for role, hints in ROLE_HINTS.items():
        if any(hint in lowered for hint in hints):
            return role
    return "UNKNOWN"
