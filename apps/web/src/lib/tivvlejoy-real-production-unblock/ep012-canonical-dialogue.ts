import { sha256Canonical } from '@/lib/tivvlejoy-production-studio/hash';

export const EP012_CANONICAL_DIALOGUE_SCHEMA = 'TIVVLEJOY_EP012_CANONICAL_DIALOGUE_V1' as const;
export const EP012_CANONICAL_DIALOGUE_SHA256 = 'f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4' as const;

export type Ep012CanonicalSpeaker = 'PIP' | 'GOAT' | 'PIP_AND_GOAT';
export type Ep012CanonicalSegmentSpeaker = 'PIP' | 'GOAT';

export type Ep012CanonicalSubsegment = {
  segmentId: string;
  speaker: Ep012CanonicalSegmentSpeaker;
  canonicalText: string;
  order: number;
  textSha256: string;
  segmentSha256: string;
};

export type Ep012CanonicalDialogueLine = {
  dialogueRef:
    | 'DL_HOOK_01'
    | 'DL_DISCOVERY_01'
    | 'DL_DECISION_01'
    | 'DL_ACTION_01'
    | 'DL_COMPLICATION_01'
    | 'DL_PAYOFF_01'
    | 'DL_BUTTON_01';
  speaker: Ep012CanonicalSpeaker;
  canonicalText: string;
  textSha256: string;
  lineSha256: string;
  subsegments: readonly Ep012CanonicalSubsegment[];
};

const lines: readonly Ep012CanonicalDialogueLine[] = [
  {
    dialogueRef: 'DL_HOOK_01',
    speaker: 'PIP_AND_GOAT',
    canonicalText: 'Pip: “Goat, wait—that flour trail is shaped like our map!” Goat: “Then breakfast just became a clue.”',
    textSha256: '02a25a5c079208f804c9d1344a75943aa15e4ab5951c6e35551274ce47377acb',
    lineSha256: '70196a9fad5dc00948458f4151eed61949b1a7f1642f5f063b7c839e8a473ae9',
    subsegments: [
      {
        segmentId: 'DL_HOOK_01__PIP',
        speaker: 'PIP',
        canonicalText: 'Goat, wait—that flour trail is shaped like our map!',
        order: 1,
        textSha256: 'ff4df675be23f5833ce97c78c540609cb3b16ea156780201446e6a9d59d255f8',
        segmentSha256: '76942a7f58de5a68bbd1c9a60fa8df963f30d79f7d6147b96517f630024ecd55',
      },
      {
        segmentId: 'DL_HOOK_01__GOAT',
        speaker: 'GOAT',
        canonicalText: 'Then breakfast just became a clue.',
        order: 2,
        textSha256: '11fbb069ea2493ad01db8e9f4172a4400c13b2d8ab0f937de621e41978a00031',
        segmentSha256: 'ca1798ea39a7c78889e18e13fce3e3276ce8f4dfc8a85232798da18718316304',
      },
    ],
  },
  {
    dialogueRef: 'DL_DISCOVERY_01',
    speaker: 'PIP',
    canonicalText: 'Look! The trail leads behind the bakery shelves. Someone wanted us to find this.',
    textSha256: '49b0e9d5867e640e409954a71d08505f0377644c5c46884ddc9ef87716df3d1a',
    lineSha256: '81a99d8754da8767f835455560a37f88c3c04cfeedfd469e5286fadd5eb119d7',
    subsegments: [
      {
        segmentId: 'DL_DISCOVERY_01__PIP',
        speaker: 'PIP',
        canonicalText: 'Look! The trail leads behind the bakery shelves. Someone wanted us to find this.',
        order: 1,
        textSha256: '49b0e9d5867e640e409954a71d08505f0377644c5c46884ddc9ef87716df3d1a',
        segmentSha256: '4da057216cb3d694b017f6820655f0baca793b898e8a53bd52a50dc88b300c81',
      },
    ],
  },
  {
    dialogueRef: 'DL_DECISION_01',
    speaker: 'GOAT',
    canonicalText: 'Then we follow it before the baker sweeps our clue away.',
    textSha256: '212c2a4cbff0a2caa36dab655ef4a5a52c9d6070162a1fe1220c3311982a5767',
    lineSha256: '6aa1a696ea673d2a0983c3c1a8b7a78dc15eec43934141819518e8c509bacc07',
    subsegments: [
      {
        segmentId: 'DL_DECISION_01__GOAT',
        speaker: 'GOAT',
        canonicalText: 'Then we follow it before the baker sweeps our clue away.',
        order: 1,
        textSha256: '212c2a4cbff0a2caa36dab655ef4a5a52c9d6070162a1fe1220c3311982a5767',
        segmentSha256: '44b84817819857bdecd56e78cdc51d0af547f44a69518921251d89fce4da3d94',
      },
    ],
  },
  {
    dialogueRef: 'DL_ACTION_01',
    speaker: 'PIP_AND_GOAT',
    canonicalText: 'Pip: “I’ll check the shelves.” Goat: “I’ll check the oven—carefully.”',
    textSha256: 'ff8a96e0b418a9dc5e37e82917249ccc28378a031e242d3548b152a14cc090b8',
    lineSha256: '81f42d65c30ca319c99515644b54c999d29e6e0792260fc09f2c6f6e7f933cff',
    subsegments: [
      {
        segmentId: 'DL_ACTION_01__PIP',
        speaker: 'PIP',
        canonicalText: 'I’ll check the shelves.',
        order: 1,
        textSha256: '6bda3e0ce1d9d6b26a1387516b1fa0c56a1b43a2b4e3f227e2223761eac0b155',
        segmentSha256: 'd33628abd981f7a9771ee605c422daeb2bbeb4dd6b15469045583eca73cd65b3',
      },
      {
        segmentId: 'DL_ACTION_01__GOAT',
        speaker: 'GOAT',
        canonicalText: 'I’ll check the oven—carefully.',
        order: 2,
        textSha256: '3811310c43dc813432a05000c7d5fc3f73635813e8d660a9ef233a502c36882d',
        segmentSha256: 'a27eee9ca722a82c509f64c92e32a915553b266b28e091c37abbd9cb153851cf',
      },
    ],
  },
  {
    dialogueRef: 'DL_COMPLICATION_01',
    speaker: 'PIP_AND_GOAT',
    canonicalText: 'Goat: “Nothing here. Just crumbs.” Pip: “Crumbs don’t sparkle. Lift that tray!”',
    textSha256: 'b34dae62afbeec5c25a67f8dbb414e8d75b61036d5a5ac185eaa551a47372038',
    lineSha256: 'a1dc169047728d6d68d22d2a5aae992bbc020f9892261f7b1c5025fb8c80bd47',
    subsegments: [
      {
        segmentId: 'DL_COMPLICATION_01__GOAT',
        speaker: 'GOAT',
        canonicalText: 'Nothing here. Just crumbs.',
        order: 1,
        textSha256: '8f0846213448993ef628ea461b031d87264210e161cf9df7d5543a0f31ba9f23',
        segmentSha256: '0672b748525a3207f254764037a4dd7cfc34ade2335c25474c0bcd15b6ccaa19',
      },
      {
        segmentId: 'DL_COMPLICATION_01__PIP',
        speaker: 'PIP',
        canonicalText: 'Crumbs don’t sparkle. Lift that tray!',
        order: 2,
        textSha256: 'c92069f568056e0de029816cc7eab6748c1b1607c74b49728f95066abda7763d',
        segmentSha256: 'a7efa1effd45c74c87651d463ade8e8dddb4d5aae9f359eb4dbbb34b6d995730',
      },
    ],
  },
  {
    dialogueRef: 'DL_PAYOFF_01',
    speaker: 'PIP',
    canonicalText: 'It’s a missing map piece! The bakery was hiding part of the trail.',
    textSha256: '5bf94a8256719c31cd6e2eaaffad46f68dbf7d0e7b9f0b1c35ba90030777e79e',
    lineSha256: '741bc2803729c7c5ce1e4d20941f5e4d4401f9994060ab26e4644f56af3a8d0e',
    subsegments: [
      {
        segmentId: 'DL_PAYOFF_01__PIP',
        speaker: 'PIP',
        canonicalText: 'It’s a missing map piece! The bakery was hiding part of the trail.',
        order: 1,
        textSha256: '5bf94a8256719c31cd6e2eaaffad46f68dbf7d0e7b9f0b1c35ba90030777e79e',
        segmentSha256: '10a89762f27b12803618fc62085e1ecd68b9c9ec959f60ba5360bafd7d92c979',
      },
    ],
  },
  {
    dialogueRef: 'DL_BUTTON_01',
    speaker: 'PIP_AND_GOAT',
    canonicalText: 'Goat: “Mystery solved. Bun time?” Pip: “One bun. Then we follow the map.”',
    textSha256: 'c2f6b62b5a079b7decc5445b864e85f2442094ba5a1478b4b26091df2ca0b69e',
    lineSha256: 'faa3282924a5eff73a9589fbfa5d8c01414dcfad19cb81c4ab2cabd8dd19140d',
    subsegments: [
      {
        segmentId: 'DL_BUTTON_01__GOAT',
        speaker: 'GOAT',
        canonicalText: 'Mystery solved. Bun time?',
        order: 1,
        textSha256: '71ba061fdb42a24b786e9004214c4a6212a7423c200b0151fce12e33136d1837',
        segmentSha256: 'bbe41b86d3ec8a224b730de46ce5ec0905e246e87feab4e5da0bfa6c9b374b68',
      },
      {
        segmentId: 'DL_BUTTON_01__PIP',
        speaker: 'PIP',
        canonicalText: 'One bun. Then we follow the map.',
        order: 2,
        textSha256: '17a8270d957e6c6cc02fc7f52fb0b7500f325d543e9201532ad3f5328c63864b',
        segmentSha256: '76bf702a0e9a554b0f9fe6d23bd55d06f3f79b1f73a4410e00ad847042b9989a',
      },
    ],
  },
] as const;

function expectedLineHash(line: Ep012CanonicalDialogueLine): string {
  return sha256Canonical({
    dialogueRef: line.dialogueRef,
    speaker: line.speaker,
    canonicalText: line.canonicalText,
    subsegments: line.subsegments.map((segment) => ({
      segmentId: segment.segmentId,
      speaker: segment.speaker,
      canonicalText: segment.canonicalText,
      order: segment.order,
    })),
  });
}

export function verifyEp012CanonicalDialogueLock(): true {
  for (const line of lines) {
    if (sha256Canonical(line.canonicalText) !== line.textSha256) {
      throw new Error(`EP012_CANONICAL_TEXT_HASH_MISMATCH:${line.dialogueRef}`);
    }
    if (expectedLineHash(line) !== line.lineSha256) {
      throw new Error(`EP012_CANONICAL_LINE_HASH_MISMATCH:${line.dialogueRef}`);
    }
    for (const segment of line.subsegments) {
      if (sha256Canonical(segment.canonicalText) !== segment.textSha256) {
        throw new Error(`EP012_CANONICAL_SEGMENT_TEXT_HASH_MISMATCH:${segment.segmentId}`);
      }
      if (
        sha256Canonical({
          segmentId: segment.segmentId,
          speaker: segment.speaker,
          canonicalText: segment.canonicalText,
          order: segment.order,
        }) !== segment.segmentSha256
      ) {
        throw new Error(`EP012_CANONICAL_SEGMENT_HASH_MISMATCH:${segment.segmentId}`);
      }
    }
  }

  const dialogueSha256 = sha256Canonical({
    schemaVersion: EP012_CANONICAL_DIALOGUE_SCHEMA,
    episodeId: 'EP012',
    title: 'The Bakery Map',
    lines: lines.map((line) => ({
      dialogueRef: line.dialogueRef,
      speaker: line.speaker,
      canonicalText: line.canonicalText,
      lineSha256: line.lineSha256,
    })),
  });
  if (dialogueSha256 !== EP012_CANONICAL_DIALOGUE_SHA256) {
    throw new Error('EP012_CANONICAL_DIALOGUE_HASH_MISMATCH');
  }
  return true;
}

verifyEp012CanonicalDialogueLock();

export const EP012_CANONICAL_DIALOGUE_LOCK = {
  schemaVersion: EP012_CANONICAL_DIALOGUE_SCHEMA,
  episodeId: 'EP012',
  title: 'The Bakery Map',
  lines,
  lineCount: 7,
  utteranceSegmentCount: 11,
  dialogueSha256: EP012_CANONICAL_DIALOGUE_SHA256,
  voiceGenerationPerformed: false,
  commercialBytesDownloaded: 0,
} as const;

export function getEp012CanonicalLine(dialogueRef: Ep012CanonicalDialogueLine['dialogueRef']): Ep012CanonicalDialogueLine {
  const line = EP012_CANONICAL_DIALOGUE_LOCK.lines.find((item) => item.dialogueRef === dialogueRef);
  if (!line) throw new Error(`EP012_CANONICAL_LINE_NOT_FOUND:${dialogueRef}`);
  return line;
}
