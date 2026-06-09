import React, { useState, useEffect, useRef, useCallback, createContext, useContext, RefObject } from 'react'
import { useScrollReveal } from '../../hooks/useScrollReveal'

interface LandingPageV2Props {
  onOpenEditor: () => void
}

const ScrollRootContext = createContext<RefObject<HTMLDivElement | null>>({ current: null })

// ─── Reveal wrapper ─────────────────────────────────────────────────────────

function Reveal({
  children,
  className = '',
  variant = 'up',
  delay,
  stagger,
}: {
  children: React.ReactNode
  className?: string
  variant?: 'up' | 'left' | 'right' | 'scale'
  delay?: number
  stagger?: number
}) {
  const scrollRoot = useContext(ScrollRootContext)
  const { ref, isVisible } = useScrollReveal({ root: scrollRoot })
  const baseClass =
    variant === 'left'
      ? 'lp2-reveal-left'
      : variant === 'right'
        ? 'lp2-reveal-right'
        : variant === 'scale'
          ? 'lp2-reveal-scale'
          : 'lp2-reveal'

  const totalDelay = (delay ?? 0) + (stagger ?? 0)

  return (
    <div
      ref={ref}
      className={`${baseClass} ${isVisible ? 'visible' : ''} ${className}`}
      style={totalDelay > 0 ? { transitionDelay: `${totalDelay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

function Nav({ scrollContainerRef }: { scrollContainerRef: React.RefObject<HTMLDivElement | null> }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handler = () => setScrolled(el.scrollTop > 40)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [scrollContainerRef])

  return (
    <nav className={`lp2-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="lp2-nav-logo">
        TeXPal
      </div>
    </nav>
  )
}

// ─── Hero ───────────────────────────────────────────────────────────────────

const EQUATION_PARTS: { text: string; cls?: string; children?: { text: string; cls?: string }[] }[] = [
  {
    text: 'e',
    cls: 'ch-base ch-italic',
    children: [
      { text: 'i', cls: 'ch-italic' },
      { text: 'π', cls: '' },
    ],
  },
  { text: '\u2009+\u2009' },
  { text: '1' },
  { text: '\u2009=\u2009' },
  { text: '0' },
]

function AnimatedHero({ onOpenEditor }: { onOpenEditor: () => void }) {
  const [visibleCount, setVisibleCount] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'attribution' | 'cta' | 'done'>('typing')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalSymbols = EQUATION_PARTS.length

  const advanceTyping = useCallback(() => {
    setVisibleCount((prev) => {
      const next = prev + 1
      if (next >= totalSymbols) {
        timerRef.current = setTimeout(() => setPhase('attribution'), 400)
        return totalSymbols
      }
      timerRef.current = setTimeout(advanceTyping, 180 + Math.random() * 120)
      return next
    })
  }, [totalSymbols])

  useEffect(() => {
    timerRef.current = setTimeout(advanceTyping, 600)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [advanceTyping])

  useEffect(() => {
    if (phase === 'attribution') {
      timerRef.current = setTimeout(() => setPhase('cta'), 800)
    } else if (phase === 'cta') {
      timerRef.current = setTimeout(() => setPhase('done'), 600)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [phase])

  const showAttribution = phase === 'attribution' || phase === 'cta' || phase === 'done'
  const showCta = phase === 'cta' || phase === 'done'

  return (
    <section className="lp2-hero-animated">
      <div className="lp2-eq-glow lp2-hero-glow-anim" />

      <div className="lp2-equation" aria-label="Euler's identity: e to the i pi plus one equals zero">
        {EQUATION_PARTS.map((sym, i) => (
          <span
            key={i}
            className={`lp2-eq-char ${sym.cls || ''} ${i < visibleCount ? 'lp2-typed-in' : 'lp2-typed-hidden'}`}
          >
            {sym.text}
            {sym.children && (
              <span className="lp2-eq-superscript">
                {sym.children.map((child, j) => (
                  <span key={j} className={child.cls || ''}>{child.text}</span>
                ))}
              </span>
            )}
          </span>
        ))}
      </div>

      <p className={`lp2-eq-attribution ${showAttribution ? 'lp2-fade-in' : 'lp2-typed-hidden'}`}>
        Five constants, one equation, pure elegance.
      </p>

      <div className={`lp2-hero-cta-group ${showCta ? 'lp2-fade-in' : 'lp2-typed-hidden'}`} style={{ marginTop: 48 }}>
        <h2 className="lp2-cinematic-headline">
          The first AI-native LaTeX editor.
        </h2>
        <p className="lp2-cinematic-sub">
          Beautiful math deserves a beautiful editor.
        </p>
      </div>

      <button
        className={`lp2-btn-primary lp2-hero-open-btn ${showCta ? 'lp2-fade-in' : 'lp2-typed-hidden'}`}
        onClick={onOpenEditor}
        style={{ marginTop: 40 }}
      >
        Open Editor
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3.5 8h9m0 0L9 4.5M12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  )
}

// ─── Video ──────────────────────────────────────────────────────────────────

function VideoSection() {
  return (
    <section className="lp2-section lp2-video-section" id="demo">
      <Reveal variant="scale">
        <div className="lp2-video-embed">
          <iframe
            src="https://www.youtube.com/embed/DFOM5vGB_jo?rel=0&modestbranding=1"
            title="TeXPal Demo"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </Reveal>
    </section>
  )
}

// ─── Problem ────────────────────────────────────────────────────────────────

function ProblemSection() {
  return (
    <section className="lp2-section lp2-problem">
      <Reveal>
        <h2>The last LaTeX editor you'll need.</h2>
      </Reveal>
      <Reveal delay={180}>
        <p>
          No local install. No dependency hell. No "works on my machine."
          Open a browser, pick a template, and start writing — with AI that
          actually understands your document and collaborators who can edit
          alongside you in real time.
        </p>
      </Reveal>
    </section>
  ) 
}

// ─── Features ───────────────────────────────────────────────────────────────

function FeatureAIChatVisual() {
  return (
    <div className="lp2-feature-visual">
      <div className="lp2-feature-visual-inner">
        <div className="lp2-chat-mock">
          <div className="lp2-chat-bubble user">
            Add a theorem environment for the central limit theorem with a proof sketch
          </div>
          <div className="lp2-chat-bubble ai">
            <div className="ai-label">DeepSpace AI</div>
            Done. I've added a <code style={{ color: '#A8B4A0', fontSize: 12 }}>\begin&#123;theorem&#125;</code> block
            with the CLT statement and a proof sketch using <code style={{ color: '#A8B4A0', fontSize: 12 }}>\begin&#123;proof&#125;</code>.
            The citation to Billingsley (1995) has been wired to your .bib file.
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureTemplatesVisual() {
  const templates = [
    { name: 'IEEE Conference', tag: 'ieee' },
    { name: 'ACM Article', tag: 'acm' },
    { name: 'arXiv Preprint', tag: 'arxiv' },
    { name: 'PhD Thesis', tag: 'thesis' },
    { name: 'Homework', tag: 'hw' },
    { name: 'Beamer Slides', tag: 'slides' },
  ]
  return (
    <div className="lp2-feature-visual">
      <div className="lp2-feature-visual-inner">
        <div className="lp2-templates-mock">
          {templates.map((t) => (
            <div key={t.tag} className="lp2-template-card-mock">
              <div className="lp2-template-card-lines">
                <div style={{ width: '60%', height: 6 }} />
                <div style={{ width: '80%', height: 4 }} />
                <div style={{ width: '45%', height: 4 }} />
                <div style={{ width: '70%', height: 4 }} />
              </div>
              <span className="lp2-template-card-name">{t.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FeatureCollabVisual() {
  return (
    <div className="lp2-feature-visual">
      <div className="lp2-feature-visual-inner">
        <div className="lp2-collab-mock">
          {/* Avatars row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ display: 'flex' }}>
              {['#8B8B9E', '#7A7A8A', '#6B6B7A'].map((color, i) => (
                <div
                  key={color}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: color,
                    border: '2px solid var(--lp2-surface)', 
                    marginLeft: i > 0 ? -8 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#fff',
                  }}
                >
                  {['Y', 'S', 'A'][i]}
                </div>
              ))}
            </div>
            <span style={{ fontSize: 12, color: 'var(--lp2-text-muted)' }}>3 collaborators editing</span>
          </div>
          {/* Simulated doc lines */}
          <div className="lp2-collab-line" style={{ width: '92%', height: 10 }} />
          <div className="lp2-collab-line" style={{ width: '78%', height: 10 }} />
                    <div className="lp2-collab-line" style={{ width: '85%', height: 10, background: 'rgba(139,139,158,0.18)', borderLeft: '2px solid #8B8B9E' }} />
          <div className="lp2-collab-line" style={{ width: '60%', height: 10 }} />
          <div className="lp2-collab-line" style={{ width: '88%', height: 10, background: 'rgba(122,122,138,0.18)', borderLeft: '2px solid #7A7A8A' }} />
          <div className="lp2-collab-line" style={{ width: '72%', height: 10 }} />
          <div className="lp2-collab-line" style={{ width: '50%', height: 10 }} />
        </div>
      </div>
    </div>
  )
}

function FeaturesSection() {
  return (
    <section className="lp2-section lp2-features" id="features">
      {/* Feature 1: AI Chat */}
      <div className="lp2-feature-block">
        <Reveal variant="left">
          <div>
            <div className="lp2-feature-label">AI-Native Editing</div>
            <h3>Tell it what you need. It writes the LaTeX.</h3>
            <p>
              The built-in AI assistant doesn't just autocomplete — it understands
              LaTeX deeply. Ask it to create theorem environments, format tables,
              fix compilation errors, or restructure your entire document.
              It edits your files directly, no copy-pasting required.
            </p>
          </div>
        </Reveal>
        <Reveal variant="right" delay={200}>
          <FeatureAIChatVisual />
        </Reveal>
      </div>

      {/* Feature 2: Templates */}
      <div className="lp2-feature-block reverse">
        <Reveal variant="right">
          <div>
            <div className="lp2-feature-label">Template Library</div>
            <h3>Start from a real template, not a blank page.</h3>
            <p>
              IEEE, ACM, arXiv, thesis, homework, Beamer — pick a template and
              start writing immediately. Full multi-file project support with
              .bib, .cls, and asset files included out of the box.
            </p>
          </div>
        </Reveal>
        <Reveal variant="left" delay={200}>
          <FeatureTemplatesVisual />
        </Reveal>
      </div>

      {/* Feature 3: Collaboration */}
      <div className="lp2-feature-block">
        <Reveal variant="left">
          <div>
            <div className="lp2-feature-label">Real-Time Collaboration</div>
            <h3>Work together without the merge conflicts.</h3>
            <p>
              Invite co-authors and edit the same document simultaneously.
              Changes sync instantly across everyone's screen. No more
              emailing .tex files back and forth or resolving Git conflicts
              on bibliography entries.
            </p>
          </div>
        </Reveal>
        <Reveal variant="right" delay={200}>
          <FeatureCollabVisual />
        </Reveal>
      </div>
    </section>
  )
}

// ─── Final CTA ──────────────────────────────────────────────────────────────

function FinalCTA({ onOpenEditor }: { onOpenEditor: () => void }) {
  return (
    <section className="lp2-section lp2-final-cta">
      <div className="lp2-final-cta-glow" />
      <Reveal>
        <h2>Start writing better LaTeX today.</h2>
      </Reveal>
      <Reveal delay={180}>
        <p>No credit card. No setup. No friction.</p>
      </Reveal>
      <Reveal delay={360}>
        <button className="lp2-btn-primary" onClick={onOpenEditor}>
          Open the Editor
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8h9m0 0L9 4.5M12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Reveal>
    </section>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

export default function LandingPageV2({ onOpenEditor }: LandingPageV2Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <ScrollRootContext.Provider value={scrollRef}>
      <div
        ref={scrollRef}
        data-testid="landing-page"
        className="lp2"
        style={{ overflowY: 'auto', overflowX: 'hidden', height: '100vh' }}
      >
        <Nav scrollContainerRef={scrollRef} />
        <AnimatedHero onOpenEditor={onOpenEditor} />
        <VideoSection />
        <ProblemSection />
        <FeaturesSection />
        <FinalCTA onOpenEditor={onOpenEditor} />
      </div>
    </ScrollRootContext.Provider>
  )
}
