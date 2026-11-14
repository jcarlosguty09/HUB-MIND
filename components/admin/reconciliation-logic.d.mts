import type { PendingCheckin, MemberCandidate, ReconciliationAction } from './ReconciliationQueue';
export function filterCheckins(checkins: PendingCheckin[], query: string, source: 'all' | 'manual' | 'biometric'): PendingCheckin[];
export function validateAction(input: { selected: PendingCheckin | null; busy: boolean; decision: ReconciliationAction['decision']; targetUserId: string; reason: string; members: MemberCandidate[] }): string | null;
export function buildAction(input: { selected: PendingCheckin; decision: ReconciliationAction['decision']; targetUserId: string; reason: string }): ReconciliationAction;
