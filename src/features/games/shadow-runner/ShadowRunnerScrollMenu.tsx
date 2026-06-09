import React from 'react'
import { SHADOW_RUNNER_ASSETS } from './assets/manifest'

export interface ShadowRunnerScrollMenuAction {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  tone?: 'default' | 'danger'
}

interface ShadowRunnerScrollMenuProps {
  title: string
  subtitle?: string
  actions: ShadowRunnerScrollMenuAction[]
}

export function ShadowRunnerScrollMenu({
  title,
  subtitle,
  actions,
}: ShadowRunnerScrollMenuProps) {
  return (
    <div
      className="shadow-runner-no-select absolute inset-0 z-40 flex items-center justify-center bg-black/60 px-3 py-2 text-[#150e07] backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onContextMenu={event => event.preventDefault()}
    >
      <div className="relative h-[min(94dvh,36rem)] w-[min(58vw,23rem)] min-w-[17rem] max-w-[calc(100vw-1.25rem)]">
        <img
          src={SHADOW_RUNNER_ASSETS.home.optionsScroll}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-fill drop-shadow-[0_28px_70px_rgba(0,0,0,0.78)]"
          draggable={false}
        />

        <div className="absolute bottom-[7%] left-[14%] right-[14%] top-[22%] flex flex-col">
          <div className="shrink-0 text-center">
            <p className="text-[0.74rem] font-black uppercase leading-none tracking-[0.18em] drop-shadow-[0_1px_0_rgba(255,239,183,0.55)] min-[740px]:text-sm">
              {title}
            </p>
            {subtitle && (
              <p className="mx-auto mt-1 max-w-[14rem] text-[0.48rem] font-black uppercase leading-tight tracking-[0.12em] text-[#3d2710] min-[740px]:text-[0.58rem]">
                {subtitle}
              </p>
            )}
          </div>

          <div className="mt-1.5 flex flex-1 flex-col justify-center gap-1.5">
            {actions.map(action => (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className={`relative h-8 overflow-hidden rounded-[0.35rem] border border-transparent bg-transparent text-left transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#120d07]/45 min-[740px]:h-9 ${
                  action.tone === 'danger' ? 'text-[#4b1420]' : 'text-[#150e07]'
                }`}
              >
                <img
                  src={SHADOW_RUNNER_ASSETS.home.optionsMenuButton}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full object-fill"
                  draggable={false}
                />
                <span className="relative z-10 flex h-full items-center justify-center gap-2 px-3 drop-shadow-[0_1px_0_rgba(255,239,183,0.5)]">
                  {action.icon && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                      {action.icon}
                    </span>
                  )}
                  <span className="truncate text-[0.58rem] font-black uppercase leading-none tracking-[0.1em] min-[740px]:text-[0.68rem]">
                    {action.label}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
