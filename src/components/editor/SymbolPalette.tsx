/**
 * SymbolPalette — bottom toolbar panel for LaTeX symbols (Overleaf-style).
 *
 * Opens as a bottom toolbar with navbar tabs: Greek, Arrows, Operations, Relations, Misc.
 * Clicking a symbol inserts the LaTeX command at the cursor.
 */

import React, { useState, useEffect } from 'react'

interface SymbolPaletteProps {
  open: boolean
  onClose: () => void
  onInsert: (latex: string) => void
}

interface SymbolEntry {
  display: string
  latex: string
  label: string
}

const TABS = ['Greek', 'Arrows', 'Operations', 'Relations', 'Misc'] as const
type TabId = typeof TABS[number]

const SYMBOLS: Record<TabId, SymbolEntry[]> = {
  Greek: [
    // Lowercase Greek
    { display: '\u03B1', latex: '\\alpha', label: 'alpha' },
    { display: '\u03B2', latex: '\\beta', label: 'beta' },
    { display: '\u03B3', latex: '\\gamma', label: 'gamma' },
    { display: '\u03B4', latex: '\\delta', label: 'delta' },
    { display: '\u03B5', latex: '\\epsilon', label: 'epsilon' },
    { display: '\u03B6', latex: '\\zeta', label: 'zeta' },
    { display: '\u03B7', latex: '\\eta', label: 'eta' },
    { display: '\u03B8', latex: '\\theta', label: 'theta' },
    { display: '\u03B9', latex: '\\iota', label: 'iota' },
    { display: '\u03BA', latex: '\\kappa', label: 'kappa' },
    { display: '\u03BB', latex: '\\lambda', label: 'lambda' },
    { display: '\u03BC', latex: '\\mu', label: 'mu' },
    { display: '\u03BD', latex: '\\nu', label: 'nu' },
    { display: '\u03BE', latex: '\\xi', label: 'xi' },
    { display: '\u03C0', latex: '\\pi', label: 'pi' },
    { display: '\u03C1', latex: '\\rho', label: 'rho' },
    { display: '\u03C3', latex: '\\sigma', label: 'sigma' },
    { display: '\u03C4', latex: '\\tau', label: 'tau' },
    { display: '\u03C5', latex: '\\upsilon', label: 'upsilon' },
    { display: '\u03C6', latex: '\\phi', label: 'phi' },
    { display: '\u03C7', latex: '\\chi', label: 'chi' },
    { display: '\u03C8', latex: '\\psi', label: 'psi' },
    { display: '\u03C9', latex: '\\omega', label: 'omega' },
    { display: '\u03D1', latex: '\\vartheta', label: 'vartheta' },
    { display: '\u03D5', latex: '\\varphi', label: 'varphi' },
    { display: '\u03D6', latex: '\\varpi', label: 'varpi' },
    { display: '\u03F1', latex: '\\varrho', label: 'varrho' },
    { display: '\u03C2', latex: '\\varsigma', label: 'varsigma' },
    // Uppercase Greek
    { display: '\u0391', latex: 'A', label: 'Alpha' },
    { display: '\u0392', latex: 'B', label: 'Beta' },
    { display: '\u0393', latex: '\\Gamma', label: 'Gamma' },
    { display: '\u0394', latex: '\\Delta', label: 'Delta' },
    { display: '\u0395', latex: 'E', label: 'Epsilon' },
    { display: '\u0396', latex: 'Z', label: 'Zeta' },
    { display: '\u0397', latex: 'H', label: 'Eta' },
    { display: '\u0398', latex: '\\Theta', label: 'Theta' },
    { display: '\u0399', latex: 'I', label: 'Iota' },
    { display: '\u039A', latex: 'K', label: 'Kappa' },
    { display: '\u039B', latex: '\\Lambda', label: 'Lambda' },
    { display: '\u039C', latex: 'M', label: 'Mu' },
    { display: '\u039D', latex: 'N', label: 'Nu' },
    { display: '\u039E', latex: '\\Xi', label: 'Xi' },
    { display: '\u03A0', latex: '\\Pi', label: 'Pi' },
    { display: '\u03A1', latex: 'P', label: 'Rho' },
    { display: '\u03A3', latex: '\\Sigma', label: 'Sigma' },
    { display: '\u03A4', latex: 'T', label: 'Tau' },
    { display: '\u03A5', latex: '\\Upsilon', label: 'Upsilon' },
    { display: '\u03A6', latex: '\\Phi', label: 'Phi' },
    { display: '\u03A7', latex: 'X', label: 'Chi' },
    { display: '\u03A8', latex: '\\Psi', label: 'Psi' },
    { display: '\u03A9', latex: '\\Omega', label: 'Omega' },
  ],
  Arrows: [
    // Basic arrows
    { display: '\u2190', latex: '\\leftarrow', label: 'left arrow' },
    { display: '\u2192', latex: '\\rightarrow', label: 'right arrow' },
    { display: '\u2191', latex: '\\uparrow', label: 'up arrow' },
    { display: '\u2193', latex: '\\downarrow', label: 'down arrow' },
    { display: '\u2194', latex: '\\leftrightarrow', label: 'left-right arrow' },
    { display: '\u2195', latex: '\\updownarrow', label: 'up-down arrow' },
    // Double arrows
    { display: '\u21D0', latex: '\\Leftarrow', label: 'double left arrow' },
    { display: '\u21D2', latex: '\\Rightarrow', label: 'double right arrow' },
    { display: '\u21D1', latex: '\\Uparrow', label: 'double up arrow' },
    { display: '\u21D3', latex: '\\Downarrow', label: 'double down arrow' },
    { display: '\u21D4', latex: '\\Leftrightarrow', label: 'double left-right' },
    { display: '\u21D5', latex: '\\Updownarrow', label: 'double up-down' },
    // Long arrows
    { display: '\u27F5', latex: '\\longleftarrow', label: 'long left arrow' },
    { display: '\u27F6', latex: '\\longrightarrow', label: 'long right arrow' },
    { display: '\u27F7', latex: '\\longleftrightarrow', label: 'long left-right' },
    { display: '\u27F8', latex: '\\Longleftarrow', label: 'long double left' },
    { display: '\u27F9', latex: '\\Longrightarrow', label: 'long double right' },
    { display: '\u27FA', latex: '\\Longleftrightarrow', label: 'long double left-right' },
    // Diagonal arrows
    { display: '\u2197', latex: '\\nearrow', label: 'northeast arrow' },
    { display: '\u2198', latex: '\\searrow', label: 'southeast arrow' },
    { display: '\u2199', latex: '\\swarrow', label: 'southwest arrow' },
    { display: '\u2196', latex: '\\nwarrow', label: 'northwest arrow' },
    // Special arrows
    { display: '\u21A6', latex: '\\mapsto', label: 'maps to' },
    { display: '\u21A9', latex: '\\hookleftarrow', label: 'hook left' },
    { display: '\u21AA', latex: '\\hookrightarrow', label: 'hook right' },
    { display: '\u21B0', latex: '\\curvearrowleft', label: 'curve left' },
    { display: '\u21B1', latex: '\\curvearrowright', label: 'curve right' },
    { display: '\u21B6', latex: '\\circlearrowleft', label: 'circle left' },
    { display: '\u21B7', latex: '\\circlearrowright', label: 'circle right' },
    { display: '\u21C0', latex: '\\rightharpoonup', label: 'rightharpoon up' },
    { display: '\u21C1', latex: '\\rightharpoondown', label: 'rightharpoon down' },
    { display: '\u21C2', latex: '\\leftharpoonup', label: 'leftharpoon up' },
    { display: '\u21C3', latex: '\\leftharpoondown', label: 'leftharpoon down' },
    { display: '\u21C4', latex: '\\rightleftharpoons', label: 'right-left harpoons' },
    { display: '\u21C6', latex: '\\leftrightharpoons', label: 'left-right harpoons' },
    { display: '\u21CB', latex: '\\leftrightarrows', label: 'left-right arrows' },
    { display: '\u21CC', latex: '\\rightleftarrows', label: 'right-left arrows' },
    { display: '\u21E0', latex: '\\dashleftarrow', label: 'dash left' },
    { display: '\u21E2', latex: '\\dashrightarrow', label: 'dash right' },
  ],
  Operations: [
    // Basic operations
    { display: '\u00B1', latex: '\\pm', label: 'plus-minus' },
    { display: '\u2213', latex: '\\mp', label: 'minus-plus' },
    { display: '\u00D7', latex: '\\times', label: 'times' },
    { display: '\u00F7', latex: '\\div', label: 'divide' },
    { display: '\u22C5', latex: '\\cdot', label: 'center dot' },
    { display: '\u2217', latex: '\\ast', label: 'asterisk' },
    { display: '\u2218', latex: '\\circ', label: 'circle' },
    { display: '\u2219', latex: '\\bullet', label: 'bullet' },
    { display: '\u22C6', latex: '\\star', label: 'star' },
    // Set operations
    { display: '\u2295', latex: '\\oplus', label: 'oplus' },
    { display: '\u2296', latex: '\\ominus', label: 'ominus' },
    { display: '\u2297', latex: '\\otimes', label: 'otimes' },
    { display: '\u2298', latex: '\\oslash', label: 'oslash' },
    { display: '\u2299', latex: '\\odot', label: 'odot' },
    { display: '\u22A1', latex: '\\boxplus', label: 'boxplus' },
    { display: '\u22A2', latex: '\\boxminus', label: 'boxminus' },
    { display: '\u22A0', latex: '\\boxtimes', label: 'boxtimes' },
    // Sums and integrals
    { display: '\u2211', latex: '\\sum', label: 'sum' },
    { display: '\u220F', latex: '\\prod', label: 'product' },
    { display: '\u222B', latex: '\\int', label: 'integral' },
    { display: '\u222C', latex: '\\iint', label: 'double integral' },
    { display: '\u222D', latex: '\\iiint', label: 'triple integral' },
    { display: '\u222E', latex: '\\oint', label: 'contour integral' },
    { display: '\u222F', latex: '\\oiint', label: 'double contour integral' },
    { display: '\u2230', latex: '\\oiiint', label: 'triple contour integral' },
    // Calculus
    { display: '\u2202', latex: '\\partial', label: 'partial' },
    { display: '\u2207', latex: '\\nabla', label: 'nabla' },
    { display: '\u221A', latex: '\\sqrt{}', label: 'square root' },
    { display: '\u221B', latex: '\\sqrt[3]{}', label: 'cube root' },
    { display: '\u221C', latex: '\\sqrt[4]{}', label: 'fourth root' },
    // Other operations
    { display: '\u221E', latex: '\\infty', label: 'infinity' },
    { display: '\u2205', latex: '\\emptyset', label: 'empty set' },
    { display: '\u2208', latex: '\\in', label: 'element of' },
    { display: '\u2209', latex: '\\notin', label: 'not element of' },
    { display: '\u220A', latex: '\\ni', label: 'contains as member' },
    { display: '\u220B', latex: '\\notni', label: 'not contains' },
    { display: '\u2229', latex: '\\cap', label: 'intersection' },
    { display: '\u222A', latex: '\\cup', label: 'union' },
    { display: '\u2216', latex: '\\setminus', label: 'set minus' },
    { display: '\u2293', latex: '\\sqcap', label: 'square cap' },
    { display: '\u2294', latex: '\\sqcup', label: 'square cup' },
    { display: '\u228E', latex: '\\uplus', label: 'multiset union' },
    { display: '\u2291', latex: '\\sqsubseteq', label: 'square subset or equal' },
    { display: '\u2292', latex: '\\sqsupseteq', label: 'square superset or equal' },
    { display: '\u229E', latex: '\\boxdot', label: 'box dot' },
    { display: '\u22A3', latex: '\\vdash', label: 'turnstile' },
    { display: '\u22A4', latex: '\\dashv', label: 'dashv' },
    { display: '\u22A5', latex: '\\perp', label: 'perpendicular' },
    { display: '\u22A8', latex: '\\models', label: 'models' },
    { display: '\u22C4', latex: '\\diamond', label: 'diamond' },
    { display: '\u22C7', latex: '\\divideontimes', label: 'divide on times' },
    { display: '\u22C8', latex: '\\bowtie', label: 'bowtie' },
    { display: '\u22C9', latex: '\\ltimes', label: 'left times' },
    { display: '\u22CA', latex: '\\rtimes', label: 'right times' },
    { display: '\u22CB', latex: '\\leftthreetimes', label: 'left three times' },
    { display: '\u22CC', latex: '\\rightthreetimes', label: 'right three times' },
  ],
  Relations: [
    // Comparison
    { display: '\u2264', latex: '\\leq', label: 'less or equal' },
    { display: '\u2265', latex: '\\geq', label: 'greater or equal' },
    { display: '\u226A', latex: '\\ll', label: 'much less' },
    { display: '\u226B', latex: '\\gg', label: 'much greater' },
    { display: '\u2272', latex: '\\lesssim', label: 'less sim' },
    { display: '\u2273', latex: '\\gtrsim', label: 'greater sim' },
    { display: '\u2276', latex: '\\lessgtr', label: 'less greater' },
    { display: '\u2277', latex: '\\gtrless', label: 'greater less' },
    { display: '\u227A', latex: '\\prec', label: 'precedes' },
    { display: '\u227B', latex: '\\succ', label: 'succeeds' },
    { display: '\u227C', latex: '\\preceq', label: 'precedes or equal' },
    { display: '\u227D', latex: '\\succeq', label: 'succeeds or equal' },
    { display: '\u227E', latex: '\\precapprox', label: 'precedes approx' },
    { display: '\u227F', latex: '\\succapprox', label: 'succeeds approx' },
    // Equality
    { display: '\u003D', latex: '=', label: 'equals' },
    { display: '\u2260', latex: '\\neq', label: 'not equal' },
    { display: '\u2261', latex: '\\equiv', label: 'equivalent' },
    { display: '\u2248', latex: '\\approx', label: 'approximately' },
    { display: '\u2243', latex: '\\simeq', label: 'simeq' },
    { display: '\u2245', latex: '\\cong', label: 'congruent' },
    { display: '\u2249', latex: '\\not\\approx', label: 'not approximately' },
    { display: '\u2242', latex: '\\eqsim', label: 'eqsim' },
    { display: '\u2244', latex: '\\not\\simeq', label: 'not simeq' },
    { display: '\u2246', latex: '\\eqapprox', label: 'eqapprox' },
    { display: '\u2247', latex: '\\not\\cong', label: 'not congruent' },
    // Set relations
    { display: '\u2282', latex: '\\subset', label: 'subset' },
    { display: '\u2283', latex: '\\supset', label: 'superset' },
    { display: '\u2286', latex: '\\subseteq', label: 'subset or equal' },
    { display: '\u2287', latex: '\\supseteq', label: 'superset or equal' },
    { display: '\u2288', latex: '\\not\\subseteq', label: 'not subset or equal' },
    { display: '\u2289', latex: '\\not\\supseteq', label: 'not superset or equal' },
    { display: '\u228A', latex: '\\subsetneq', label: 'subset not equal' },
    { display: '\u228B', latex: '\\supsetneq', label: 'superset not equal' },
    { display: '\u228F', latex: '\\sqsubset', label: 'square subset' },
    { display: '\u2290', latex: '\\sqsupset', label: 'square superset' },
    // Other relations
    { display: '\u221D', latex: '\\propto', label: 'proportional' },
    { display: '\u223C', latex: '\\sim', label: 'similar' },
    { display: '\u223D', latex: '\\backsim', label: 'backsim' },
    { display: '\u223E', latex: '\\thicksim', label: 'thicksim' },
    { display: '\u223F', latex: '\\backsim', label: 'backsim' },
    { display: '\u2240', latex: '\\wr', label: 'wreath product' },
    { display: '\u2241', latex: '\\not\\sim', label: 'not similar' },
    { display: '\u2225', latex: '\\parallel', label: 'parallel' },
    { display: '\u2226', latex: '\\nparallel', label: 'not parallel' },
    { display: '\u22A5', latex: '\\perp', label: 'perpendicular' },
    { display: '\u22A6', latex: '\\vdash', label: 'turnstile' },
    { display: '\u22A7', latex: '\\dashv', label: 'dashv' },
    { display: '\u22A8', latex: '\\models', label: 'models' },
    { display: '\u22A9', latex: '\\vDash', label: 'vDash' },
    { display: '\u22AA', latex: '\\Vdash', label: 'Vdash' },
    { display: '\u22AB', latex: '\\Vvdash', label: 'Vvdash' },
    { display: '\u22AC', latex: '\\nvdash', label: 'not turnstile' },
    { display: '\u22AD', latex: '\\nvDash', label: 'not vDash' },
    { display: '\u22AE', latex: '\\nVdash', label: 'not Vdash' },
    { display: '\u22AF', latex: '\\nVDash', label: 'not Vvdash' },
  ],
  Misc: [
    // Quantifiers
    { display: '\u2200', latex: '\\forall', label: 'for all' },
    { display: '\u2203', latex: '\\exists', label: 'exists' },
    { display: '\u2204', latex: '\\nexists', label: 'not exists' },
    { display: '\u2205', latex: '\\emptyset', label: 'empty set' },
    // Logic
    { display: '\u00AC', latex: '\\neg', label: 'negation' },
    { display: '\u2227', latex: '\\land', label: 'logical and' },
    { display: '\u2228', latex: '\\lor', label: 'logical or' },
    { display: '\u22A2', latex: '\\vdash', label: 'turnstile' },
    { display: '\u22A3', latex: '\\dashv', label: 'dashv' },
    { display: '\u22A8', latex: '\\models', label: 'models' },
    { display: '\u22A4', latex: '\\top', label: 'top' },
    { display: '\u22A5', latex: '\\bot', label: 'bottom' },
    // Dots and ellipsis
    { display: '\u2026', latex: '\\ldots', label: 'ellipsis' },
    { display: '\u22EF', latex: '\\cdots', label: 'center dots' },
    { display: '\u22F1', latex: '\\ddots', label: 'diagonal dots' },
    { display: '\u22EE', latex: '\\vdots', label: 'vertical dots' },
    // Special symbols
    { display: '\u210F', latex: '\\hbar', label: 'h-bar' },
    { display: '\u2113', latex: '\\ell', label: 'ell' },
    { display: '\u2135', latex: '\\aleph', label: 'aleph' },
    { display: '\u2136', latex: '\\beth', label: 'beth' },
    { display: '\u2137', latex: '\\gimel', label: 'gimel' },
    { display: '\u2138', latex: '\\daleth', label: 'daleth' },
    { display: '\u2207', latex: '\\nabla', label: 'nabla' },
    { display: '\u2202', latex: '\\partial', label: 'partial' },
    { display: '\u221E', latex: '\\infty', label: 'infinity' },
    { display: '\u00A7', latex: '\\S', label: 'section' },
    { display: '\u00B6', latex: '\\P', label: 'paragraph' },
    { display: '\u2020', latex: '\\dagger', label: 'dagger' },
    { display: '\u2021', latex: '\\ddagger', label: 'double dagger' },
    // Brackets and delimiters (visual only)
    { display: '\u27E6', latex: '\\llbracket', label: 'double left bracket' },
    { display: '\u27E7', latex: '\\rrbracket', label: 'double right bracket' },
    { display: '\u2308', latex: '\\lceil', label: 'left ceiling' },
    { display: '\u2309', latex: '\\rceil', label: 'right ceiling' },
    { display: '\u230A', latex: '\\lfloor', label: 'left floor' },
    { display: '\u230B', latex: '\\rfloor', label: 'right floor' },
    // Angles
    { display: '\u2220', latex: '\\angle', label: 'angle' },
    { display: '\u2221', latex: '\\measuredangle', label: 'measured angle' },
    { display: '\u2222', latex: '\\sphericalangle', label: 'spherical angle' },
    // Other
    { display: '\u2111', latex: '\\Im', label: 'imaginary part' },
    { display: '\u211C', latex: '\\Re', label: 'real part' },
    { display: '\u2102', latex: '\\mathbb{C}', label: 'complex numbers' },
    { display: '\u2115', latex: '\\mathbb{N}', label: 'natural numbers' },
    { display: '\u2119', latex: '\\mathbb{P}', label: 'prime numbers' },
    { display: '\u211A', latex: '\\mathbb{Q}', label: 'rational numbers' },
    { display: '\u211D', latex: '\\mathbb{R}', label: 'real numbers' },
    { display: '\u2124', latex: '\\mathbb{Z}', label: 'integers' },
  ],
}

export function SymbolPalette({ open, onClose, onInsert }: SymbolPaletteProps) {
  const [activeTab, setActiveTab] = useState<TabId>('Greek')

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  if (!open) return null

  const symbols = SYMBOLS[activeTab]

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface-elevated border-t border-border shadow-lg z-50 animate-slide-up">
      <div className="flex flex-col h-64 max-h-[40vh]">
        {/* Navbar tabs */}
        <div className="flex items-center border-b border-border bg-surface-sidebar shrink-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'text-accent border-b-2 border-accent bg-surface-elevated'
                  : 'text-content-secondary hover:text-content hover:bg-surface-inset'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
          <div className="flex-1" />
          <button
            className="toolbar-btn shrink-0 mx-2"
            onClick={onClose}
            title="Close symbol palette (Esc)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Symbol grid */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid gap-1.5 max-w-full" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(2.5rem, 1fr))' }}>
            {symbols.map(sym => (
              <button
                key={sym.latex}
                className="flex items-center justify-center h-10 min-w-[2.5rem] rounded-button text-lg
                  text-content hover:bg-accent-light hover:text-accent transition-colors
                  active:bg-accent-light/80"
                title={`${sym.label} (${sym.latex})`}
                onClick={() => {
                  onInsert(sym.latex)
                }}
              >
                {sym.display}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
