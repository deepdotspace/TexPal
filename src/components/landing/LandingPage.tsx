import React, { useState, useEffect, useRef, useCallback } from 'react'

const TOTAL_FRAMES = 282
const PIXELS_PER_FRAME = 22
const CONCURRENCY = 10

function getFrameUrl(index: number): string {
  const num = String(index).padStart(3, '0')
  return `https://cdn.jsdelivr.net/gh/Harsh-Kathiriya/latex@main/latex/ezgif-frame-${num}.png`
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

interface LandingPageProps {
  onOpenEditor: () => void
}

export default function LandingPage({ onOpenEditor }: LandingPageProps) {
  const [loading, setLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [frameImages, setFrameImages] = useState<HTMLImageElement[]>([])
  const [scrollFraction, setScrollFraction] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const currentFrameRef = useRef(0)

  const loadAllFrames = useCallback(async () => {
    const frames: (HTMLImageElement | null)[] = new Array(TOTAL_FRAMES).fill(null)
    let loaded = 0

    const queue = Array.from({ length: TOTAL_FRAMES }, (_, i) => i + 1)
    let queueIdx = 0

    async function worker() {
      while (queueIdx < queue.length) {
        const idx = queueIdx++
        const frameNum = queue[idx]
        try {
          const img = await loadImage(getFrameUrl(frameNum))
          frames[idx] = img
        } catch {
          // skip failed frames
        }
        loaded++
        setLoadProgress(Math.round((loaded / TOTAL_FRAMES) * 100))
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker())
    await Promise.all(workers)

    const validFrames = frames.filter((f): f is HTMLImageElement => f !== null)
    setFrameImages(validFrames)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAllFrames()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [loadAllFrames])

  const drawFrame = useCallback(
    (index: number) => {
      const canvas = canvasRef.current
      if (!canvas || frameImages.length === 0) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const frame = frameImages[Math.min(index, frameImages.length - 1)]
      if (!frame) return

      const el = scrollRef.current
      const vpW = el ? el.clientWidth : window.innerWidth
      const vpH = el ? el.clientHeight : window.innerHeight

      if (canvas.width !== vpW || canvas.height !== vpH) {
        canvas.width = vpW
        canvas.height = vpH
      }

      ctx.clearRect(0, 0, vpW, vpH)

      const srcRatio = frame.naturalWidth / frame.naturalHeight
      const vpRatio = vpW / vpH
      let drawW: number, drawH: number, drawX: number, drawY: number

      if (srcRatio > vpRatio) {
        drawH = vpH
        drawW = vpH * srcRatio
        drawX = (vpW - drawW) / 2
        drawY = 0
      } else {
        drawW = vpW
        drawH = vpW / srcRatio
        drawX = 0
        drawY = (vpH - drawH) / 2
      }

      ctx.drawImage(frame, drawX, drawY, drawW, drawH)
    },
    [frameImages],
  )

  useEffect(() => {
    if (frameImages.length > 0) {
      drawFrame(0)
    }
  }, [frameImages, drawFrame])

  useEffect(() => {
    if (frameImages.length === 0) return
    const handleResize = () => drawFrame(currentFrameRef.current)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [frameImages, drawFrame])

  useEffect(() => {
    if (frameImages.length === 0) return
    const el = scrollRef.current
    if (!el) return

    const handleScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const scrollTop = el.scrollTop
        const maxScroll = el.scrollHeight - el.clientHeight
        if (maxScroll <= 0) return

        const fraction = Math.min(1, Math.max(0, scrollTop / maxScroll))
        const frameIndex = Math.min(
          frameImages.length - 1,
          Math.floor(fraction * (frameImages.length - 1)),
        )

        currentFrameRef.current = frameIndex
        setScrollFraction(fraction)
        drawFrame(frameIndex)
      })
    }

    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', handleScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [frameImages, drawFrame])

  const spacerHeight = frameImages.length > 0
    ? frameImages.length * PIXELS_PER_FRAME
    : 0

  if (loading) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${2 * Math.PI * 28}`}
                strokeDashoffset={`${2 * Math.PI * 28 * (1 - loadProgress / 100)}`}
                strokeLinecap="round"
                className="text-accent transition-all duration-300"
              />
            </svg>
          </div>
          <div className="text-content font-medium text-sm">Loading</div>
        </div>
      </div>
    )
  }

  if (frameImages.length === 0) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-4">
          <p className="text-content-secondary text-sm">Could not load frames.</p>
          <button
            onClick={onOpenEditor}
            className="px-6 py-3 rounded-xl bg-accent text-white text-base font-semibold
                       hover:bg-accent-hover transition-all duration-200 shadow-xl"
          >
            Open the Editor
          </button>
        </div>
      </div>
    )
  }

  const isNearEnd = scrollFraction > 0.92
  const ctaOpacity = isNearEnd
    ? Math.min(1, (scrollFraction - 0.92) / 0.06)
    : 0

  return (
    <div
      ref={scrollRef}
      className="landing-scroll-host absolute inset-0 overflow-y-auto overflow-x-hidden"
      style={{ scrollbarWidth: 'none' }}
    >
      <style>{`
        .landing-scroll-host::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="sticky top-0 left-0 w-full" style={{ height: '100vh', zIndex: 0 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full bg-black"
        />
      </div>

      <div
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/45 to-black/70" />
      </div>

      <div style={{ height: `${spacerHeight}px` }} aria-hidden="true" />

      <div
        className="fixed top-0 left-0 right-0 flex items-center justify-end px-6 py-4"
        style={{ zIndex: 40 }}
      >
        <button
          onClick={onOpenEditor}
          className="landing-btn-glow landing-open-editor-top px-5 py-2.5 rounded-lg
                     text-sm font-semibold transition-all duration-200"
        >
          Open Editor
        </button>
      </div>

      <div
        className="fixed inset-0 flex flex-col items-center justify-center px-6"
        style={{
          zIndex: 20,
          opacity: ctaOpacity,
          pointerEvents: 'none',
          transition: 'opacity 0.15s ease-out',
        }}
      >
        <div className="landing-cta-panel pointer-events-auto backdrop-blur-md rounded-2xl px-10 py-8 flex flex-col items-center gap-5">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center drop-shadow-xl">
            Ready to get started?
          </h2>
          <button
            onClick={onOpenEditor}
            className="landing-btn-cta landing-open-editor-main px-8 py-3.5 rounded-xl
                       text-base font-semibold transition-all duration-200
                       hover:shadow-2xl hover:scale-105"
          >
            Open the Editor
          </button>
        </div>
      </div>

      <div
        className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        style={{
          zIndex: 30,
          opacity: scrollFraction < 0.03 ? 1 : Math.max(0, 1 - scrollFraction * 15),
          transition: 'opacity 0.3s ease',
        }}
      >
        <span className="text-white/60 text-xs font-medium tracking-wider uppercase">
          Scroll to explore
        </span>
        <div className="w-6 h-10 rounded-full border-2 border-white/40 flex items-start justify-center p-1.5">
          <div className="landing-scroll-dot w-1.5 h-1.5 rounded-full bg-white/70" />
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 h-1 bg-white/10"
        style={{ zIndex: 30 }}
      >
        <div
          className="h-full bg-accent"
          style={{ width: `${scrollFraction * 100}%`, transition: 'width 75ms linear' }}
        />
      </div>
    </div>
  )
}
