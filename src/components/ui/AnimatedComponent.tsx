import React, { useEffect, useRef, ReactNode } from 'react'

interface AnimationConfig {
  duration?: number
  easing?: string
  delay?: number
}

interface AnimatedComponentProps {
  children: ReactNode
  className?: string
  animation?: 'fadeIn' | 'slideUp' | 'scaleIn' | 'slideLeft'
  config?: AnimationConfig
  trigger?: boolean
}

// Lightweight CSS-based animations for common use cases
const animations = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: 'opacity'
  },
  slideUp: {
    initial: { opacity: 0, transform: 'translateY(20px)' },
    animate: { opacity: 1, transform: 'translateY(0)' },
    transition: 'opacity, transform'
  },
  scaleIn: {
    initial: { opacity: 0, transform: 'scale(0.9)' },
    animate: { opacity: 1, transform: 'scale(1)' },
    transition: 'opacity, transform'
  },
  slideLeft: {
    initial: { opacity: 0, transform: 'translateX(20px)' },
    animate: { opacity: 1, transform: 'translateX(0)' },
    transition: 'opacity, transform'
  }
}

export const AnimatedComponent: React.FC<AnimatedComponentProps> = ({
  children,
  className = '',
  animation = 'fadeIn',
  config = {},
  trigger = true
}) => {
  const elementRef = useRef<HTMLDivElement>(null)
  const { duration = 300, easing = 'ease-out', delay = 0 } = config

  useEffect(() => {
    if (!trigger || !elementRef.current) return

    const element = elementRef.current
    const animConfig = animations[animation]

    // Apply initial styles
    Object.assign(element.style, animConfig.initial)
    element.style.transition = `${animConfig.transition} ${duration}ms ${easing}`
    element.style.transitionDelay = `${delay}ms`

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      Object.assign(element.style, animConfig.animate)
    })

    return () => {
      // Cleanup if component unmounts during animation
      element.style.transition = ''
      element.style.transitionDelay = ''
    }
  }, [trigger, animation, duration, easing, delay])

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  )
}

// Hook for programmatic animations
export const useSimpleAnimation = (
  elementRef: React.RefObject<HTMLElement>,
  animation: keyof typeof animations,
  config: AnimationConfig = {}
) => {
  const animate = () => {
    if (!elementRef.current) return

    const element = elementRef.current
    const animConfig = animations[animation]
    const { duration = 300, easing = 'ease-out', delay = 0 } = config

    Object.assign(element.style, animConfig.initial)
    element.style.transition = `${animConfig.transition} ${duration}ms ${easing}`
    element.style.transitionDelay = `${delay}ms`

    requestAnimationFrame(() => {
      Object.assign(element.style, animConfig.animate)
    })
  }

  return animate
}