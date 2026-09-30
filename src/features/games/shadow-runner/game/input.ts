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

export function releaseShadowRunnerInputs(state: ShadowRunnerInputState) {
  // Event counters stay monotonic across pause, blur and pointer cancellation.
  for (const action of SHADOW_RUNNER_ACTIONS) state[action] = false
}

export function setShadowRunnerAction(state: ShadowRunnerInputState, action: ShadowRunnerAction, pressed: boolean) {
  if (pressed && !state[action]) {
    if (action === 'jump') {
      state.crouch = false
      state.jumpPresses += 1
    }
    if (action === 'attack') state.attackPresses += 1
  }
  state[action] = pressed
}
