from __future__ import annotations

ROLE_HINTS = {
    "BODY": ("body", "mesh", "goat", "pip"),
    "HEAD": ("head",),
    "EYES": ("eye",),
    "MOUTH": ("mouth", "jaw", "beak"),
    "HORNS": ("horn",),
    "EARS": ("ear",),
    "COLLAR": ("collar",),
    "TAG": ("tag", "nameplate"),
    "SCARF": ("scarf",),
    "WINGS": ("wing",),
    "CREST": ("crest", "feather"),
    "BACKPACK": ("backpack", "pack"),
    "STRAP": ("strap",),
    "ACCESSORY": ("spiral", "copper"),
}


def map_object_name(name: str) -> str:
    lowered = name.lower()
    for role, hints in ROLE_HINTS.items():
        if any(hint in lowered for hint in hints):
            return role
    return "UNKNOWN"
