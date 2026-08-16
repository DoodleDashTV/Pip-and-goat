/**
 * Step 26 — Least-privilege access (deny by default).
 *
 * Does not change OS or cloud permissions. Policy evaluation only.
 */
import { createHash } from 'node:crypto';
import { PREPRODUCTION_SUBSYSTEM_VERSIONS } from '../versions';
import { stamp } from './labels';

export const ACCESS_RESOURCES = [
  'STORY',
  'CONTINUITY',
  'STORYBOARD',
  'ANIMATIC',
  'QC',
  'REPAIR',
  'RENDERING',
  'DEPLOYMENT',
  'CHARACTER_ASSETS',
  'VOICE_ASSETS',
  'PRODUCTION_LIBRARY',
  'PERSISTENCE',
  'ADMINISTRATION',
  'BILLING',
  'PAID_RESOURCES',
] as const;
export type AccessResource = (typeof ACCESS_RESOURCES)[number];

export const ACCESS_ACTIONS = [
  'read',
  'propose',
  'write',
  'approve',
  'promote',
  'render',
  'deploy',
  'administer',
] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export const ACCESS_ROLES = [
  'TEST',
  'AUTOMATED_GENERATOR',
  'AUTOMATED_APPROVER',
  'DRAFT_PLANNER',
  'ADMIN_BLOCKED',
] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

const ALLOWED: Partial<Record<AccessRole, Partial<Record<AccessResource, AccessAction[]>>>> = {
  DRAFT_PLANNER: {
    STORY: ['read', 'propose'],
    CONTINUITY: ['read', 'propose'],
    STORYBOARD: ['read', 'propose'],
    ANIMATIC: ['read', 'propose'],
    QC: ['read'],
    REPAIR: ['read', 'propose'],
    PERSISTENCE: ['read'],
  },
  AUTOMATED_GENERATOR: {
    STORY: ['propose'],
    CONTINUITY: ['propose'],
    STORYBOARD: ['propose'],
    ANIMATIC: ['propose'],
    QC: ['read'],
    REPAIR: ['propose'],
  },
  AUTOMATED_APPROVER: {
    QC: ['read'],
  },
  TEST: {
    STORY: ['read'],
    CONTINUITY: ['read'],
    STORYBOARD: ['read'],
    ANIMATIC: ['read'],
    QC: ['read'],
  },
  ADMIN_BLOCKED: {},
};

const PROTECTED: AccessResource[] = [
  'RENDERING',
  'DEPLOYMENT',
  'CHARACTER_ASSETS',
  'VOICE_ASSETS',
  'PRODUCTION_LIBRARY',
  'ADMINISTRATION',
  'BILLING',
  'PAID_RESOURCES',
];

export function evaluateAccess(input: {
  role: AccessRole;
  resource: AccessResource;
  action: AccessAction;
  canonical?: boolean;
}): {
  allowed: false | true;
  denied: boolean;
  reason: string;
  audited: true;
} {
  if (PROTECTED.includes(input.resource)) {
    return {
      allowed: false,
      denied: true,
      reason: `Refuse: ${input.role} cannot ${input.action} protected ${input.resource}.`,
      audited: true,
    };
  }
  if (input.role === 'TEST' && (input.action === 'write' || input.action === 'approve' || input.action === 'promote' || input.action === 'deploy' || input.action === 'administer')) {
    return {
      allowed: false,
      denied: true,
      reason: 'Refuse: TEST role cannot obtain production access.',
      audited: true,
    };
  }
  if (input.canonical && (input.action === 'approve' || input.action === 'promote')) {
    return {
      allowed: false,
      denied: true,
      reason: 'Refuse: automated or draft roles cannot approve or promote canonical output.',
      audited: true,
    };
  }
  const allowedActions = ALLOWED[input.role]?.[input.resource] ?? [];
  if (!allowedActions.includes(input.action)) {
    return {
      allowed: false,
      denied: true,
      reason: `Deny by default: ${input.role} cannot ${input.action} ${input.resource}.`,
      audited: true,
    };
  }
  return { allowed: true, denied: false, reason: 'Draft propose/read only.', audited: true };
}

export function assertGeneratorCannotApprove(): {
  generatorApprove: boolean;
  approverGenerate: boolean;
} {
  const generatorApprove = evaluateAccess({
    role: 'AUTOMATED_GENERATOR',
    resource: 'STORY',
    action: 'approve',
    canonical: true,
  });
  const approverGenerate = evaluateAccess({
    role: 'AUTOMATED_APPROVER',
    resource: 'STORY',
    action: 'write',
    canonical: true,
  });
  return {
    generatorApprove: generatorApprove.allowed === true,
    approverGenerate: approverGenerate.allowed === true,
  };
}

export function compileAccessPolicyEvidence() {
  const samples = [
    evaluateAccess({ role: 'TEST', resource: 'PRODUCTION_LIBRARY', action: 'write' }),
    evaluateAccess({ role: 'AUTOMATED_GENERATOR', resource: 'STORY', action: 'approve', canonical: true }),
    evaluateAccess({ role: 'DRAFT_PLANNER', resource: 'STORY', action: 'propose' }),
    evaluateAccess({ role: 'TEST', resource: 'BILLING', action: 'administer' }),
    evaluateAccess({ role: 'ADMIN_BLOCKED', resource: 'DEPLOYMENT', action: 'deploy' }),
  ];
  const separation = assertGeneratorCannotApprove();
  return stamp({
    denyByDefault: true as const,
    osPermissionsChanged: false as const,
    cloudPermissionsChanged: false as const,
    samples,
    separation,
    cacheKey: createHash('sha256').update(JSON.stringify({ samples, separation })).digest('hex'),
    version: PREPRODUCTION_SUBSYSTEM_VERSIONS.access,
  });
}
