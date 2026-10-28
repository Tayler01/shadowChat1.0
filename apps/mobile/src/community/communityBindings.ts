import Constants from 'expo-constants';
import { resolveAppConfiguration } from '../lib/appConfiguration';
import {
  createCommunityRuntime,
  resolveCommunityRegistry,
  type CommunityContext,
  type CommunityDefinition,
} from './communityRuntime';
import { createCommunityStartup } from './communityStartup';

export const baseAppRuntime = resolveAppConfiguration(Constants.expoConfig?.extra);
const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const extra = Constants.expoConfig?.extra?.communities as
  | {
      demoEnabled?: unknown;
      demo?: { origin?: unknown; projectRef?: unknown; supabaseUrl?: unknown; publicKey?: unknown };
    }
  | undefined;
export const communityRegistry = (() => {
  try {
    return resolveCommunityRegistry({
      member: {
        origin: baseAppRuntime.origin,
        projectRef: new URL(projectUrl).hostname.split('.')[0],
        supabaseUrl: projectUrl,
        publicKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      },
      demoEnabled: extra?.demoEnabled,
      demo: extra?.demo,
    });
  } catch {
    return null;
  }
})();
export const communityController = communityRegistry
  ? createCommunityRuntime(communityRegistry)
  : null;
export const initializeCommunity = createCommunityStartup();
let revision = 0;
let helperRevision = 0;
const listeners = new Set<() => void>();
const pending = new Map<CommunityContext, Set<Promise<unknown>>>();
const cleanups = new Map<CommunityContext, Set<() => Promise<void>>>();
export const announceCommunityChange = () => {
  revision++;
  for (const listener of listeners) listener();
};
export const subscribeCommunity = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const communityRevision = () => revision;
export const communityHelperRevision = () => helperRevision;
export const announceHelperReset = () => {
  helperRevision++;
  announceCommunityChange();
};
export const activeCommunity = () => communityController?.capture() ?? null;
export const requireCommunity = () => {
  const context = activeCommunity();
  if (!context) throw new Error('Choose a community before continuing.');
  return context;
};
export const isCurrentCommunity = (context: CommunityContext) =>
  communityController?.isCurrent(context) === true;
export const runCommunityOperation = <T>(
  context: CommunityContext,
  operation: () => Promise<T>
): Promise<T> => {
  if (!isCurrentCommunity(context))
    return Promise.reject(new Error('This community is no longer active.'));
  const set = pending.get(context) ?? new Set<Promise<unknown>>();
  pending.set(context, set);
  const work = Promise.resolve().then(() => {
    if (!isCurrentCommunity(context)) throw new Error('This community is no longer active.');
    return operation();
  });
  set.add(work);
  void work
    .finally(() => {
      set.delete(work);
    })
    .catch(() => undefined);
  return work;
};
export const addCommunityCleanup = (context: CommunityContext, cleanup: () => Promise<void>) => {
  const set = cleanups.get(context) ?? new Set<() => Promise<void>>();
  cleanups.set(context, set);
  set.add(cleanup);
  return () => {
    set.delete(cleanup);
    if (!set.size) cleanups.delete(context);
  };
};
export const drainCommunity = async (context: CommunityContext) => {
  for (const cleanup of cleanups.get(context) ?? []) await cleanup();
  while (pending.get(context)?.size) await Promise.allSettled([...(pending.get(context) ?? [])]);
  pending.delete(context);
};
export type InstallationIdentity = {
  installationKey: string;
  userId: string;
  credential: string;
  enrollmentPending?: boolean;
};
const identities = new Map<string, InstallationIdentity>();
export const rememberInstallation = (
  community: CommunityDefinition,
  value: InstallationIdentity | null
) => {
  if (value) identities.set(community.projectRef, value);
  else identities.delete(community.projectRef);
};
export const rememberedInstallation = (community: CommunityDefinition) =>
  identities.get(community.projectRef) ?? null;
export const readTransportScope = (data: unknown): Record<string, unknown> | null => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  let scope = (data as Record<string, unknown>).communityScope;
  try {
    if (typeof scope === 'string' && scope.length <= 1024) scope = JSON.parse(scope);
  } catch {
    return null;
  }
  return scope && typeof scope === 'object' && !Array.isArray(scope)
    ? (scope as Record<string, unknown>)
    : null;
};
export const scopeMatchesInstallation = (
  community: CommunityDefinition,
  identity: InstallationIdentity | null,
  data: unknown
) => {
  const scope = readTransportScope(data);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return Boolean(
    identity &&
    !identity.enrollmentPending &&
    uuid.test(identity.userId ?? '') &&
    uuid.test(identity.installationKey ?? '') &&
    /^[0-9a-f]{64}$/i.test(identity.credential ?? '') &&
    scope?.version === 1 &&
    scope.projectRef === community.projectRef &&
    scope.userId === identity.userId &&
    scope.installationKey === identity.installationKey
  );
};
export const currentTransportScope = () => {
  const context = activeCommunity();
  if (!context) return null;
  const identity = rememberedInstallation(context.community);
  if (!identity || identity.enrollmentPending) return null;
  return {
    version: 1,
    projectRef: context.community.projectRef,
    userId: identity.userId,
    installationKey: identity.installationKey,
  };
};
