export const SHADOW_RUNNER_ACTIONS = ['left', 'right', 'jump', 'attack', 'crouch'] as const

export type ShadowRunnerAction = typeof SHADOW_RUNNER_ACTIONS[number]

export interface ShadowRunnerInputState extends Record<ShadowRunnerAction, boolean> {
  jumpPresses: number
  attackPresses: number
}

export interface ShadowRunnerInputRef {
  current: ShadowRunnerInputState
}

export function createShadowRunnerInputState(): ShadowRunnerInputState {
  return {
    left: false,
    right: false,
    jump: false,
    attack: false,
    crouch: false,
    jumpPresses: 0,
    attackPresses: 0,
  }
}
