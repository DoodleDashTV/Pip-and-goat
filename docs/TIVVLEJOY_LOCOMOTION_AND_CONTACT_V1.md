# TIVVLEJOY_LOCOMOTION_AND_CONTACT_V1

Locomotion plans stay in **normalized / symbolic** units until real rig measurements exist.

Supported classes: stationary, walk, fast walk, run, jump, land, turn, approach, depart.

Outputs: path tokens, phase, speed class, contact timing, turn timing, arrival settle.

## Contact

Tracks left/right foot plants, Pip hallux support, Goat hoof contact, symbolic ground, and a zero unexplained-slide policy.

QC must catch:

- unexplained foot slide
- double-floating contact
- ground penetration evidence
- teleporting contact
- impossible speed changes

No real geometry is required for planning.
