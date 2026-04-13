import { useRef, useState, useEffect, RefObject } from 'react'

interface ScrollRevealOptions {
  threshold?: number
  rootMargin?: string
  root?: RefObject<HTMLElement | null>
}

export function useScrollReveal(options: ScrollRevealOptions = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      {
        root: options.root?.current ?? null,
        threshold: options.threshold ?? 0.12,
        rootMargin: options.rootMargin ?? '0px 0px -18% 0px',
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [options.threshold, options.rootMargin, options.root])

  return { ref, isVisible }
}
