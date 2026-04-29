# DESIGN.md — GeezWord

> Single source of truth for the visual language across geezword.com, geezsoft.com, and every app in the GeezWord/GeezSoft portfolio. Drop this file at the repo root. Claude Code, human developers, and external freelancers all read from here.

---

## 1. Brand Philosophy

**GeezWord builds for the Ethiopian and Eritrean diaspora.** Educational apps, games, and companion software for Tigrinya, Amharic, and the Ge'ez script. The audience is split roughly half Muslim, half Christian — the brand stays inclusive across that line. Religious-specific content lives in a separate property (Kidase Tutor) and uses its own stricter visual mode defined below.

**Voice.** Warm, scholarly, rooted. The aesthetic peer is a well-bound textbook, not a SaaS landing page. Confidence comes from cultural specificity, not from clean lines or whitespace alone.

**Anti-patterns — never produce these.**
- Inter, Roboto, Arial, Space Grotesk, system-ui, or any generic "modern sans" as the brand face
- Purple → blue gradients on white or near-black backgrounds
- Generic "African" iconography that isn't Ethiopian/Eritrean (kente cloth, Maasai shuka, baobab silhouettes, generic safari)
- All-caps treatments of Ethiopic script (the script has no case)
- Pastel-heavy "duolingo green" palettes — we are not them
- Stock-photo smiling diaspora faces — only real community imagery, used sparingly

---

## 2. Sub-brand Modes

The portfolio splits into four modes. Each inherits the foundational tokens below but tunes intensity, palette weighting, and motion. **A property must declare its mode in its own CLAUDE.md or `package.json` description.**

| Mode | Properties | Feel |
|---|---|---|
| **Learn** | beginner.geezword.com, stories.geezword.com, tracing.geezword.com, Lissan, Amharic/Tigrinya Tutor | Calm, instructional, parchment-leaning, restrained motion |
| **Play** | Fidel Bento, Fidel Quest, Fidel Words, Fidel Bubble Shooter, Fidel Legends | Saturated, motion-rich, bolder fills, sharper geometry |
| **Liturgy** | Kidase Tutor (and only Kidase Tutor) | Reverent, deep red + gold, manuscript-inspired, no playful motion |
| **Hub** | geezword.com, geezsoft.com, GeezInterest | Bridges the three above; editorial, gallery-like |

---

## 3. Color System

### 3a. Foundational palette (brand-wide)

These are the only colors used for chrome, navigation, layout, and marketing surfaces. The per-character color-music encoding (§3b) is reserved for content, not chrome.

```css
:root {
  /* Parchment & ink — the manuscript base */
  --gz-parchment:        #F4ECD8;  /* primary light background */
  --gz-parchment-deep:   #E8DCC0;  /* card/section background on light */
  --gz-ink:              #1A1614;  /* primary text, near-black with warm bias */
  --gz-ink-soft:         #3D332E;  /* secondary text */

  /* Saffron — the Ethiopic visual signature */
  --gz-saffron:          #D4A027;  /* primary accent */
  --gz-saffron-deep:     #A87918;  /* hover/pressed */
  --gz-saffron-pale:     #F0D88A;  /* highlighted bg */

  /* Indigo — manuscript ink, used as the "primary cool" */
  --gz-indigo:           #1F2A5C;  /* primary dark surface */
  --gz-indigo-deep:      #0F1838;  /* deep background, dark mode base */

  /* Rubrication red — used SPARINGLY, like a manuscript scribe would */
  --gz-rubric:           #9B2A1F;  /* punctuation moments only */

  /* Earth — supporting neutrals */
  --gz-clay:             #B86F4A;  /* warm secondary */
  --gz-moss:             #5A6B3A;  /* organic accent */
}
```

### 3b. Color-music encoding (content palette)

GeezWord's native palette is not a 5-swatch brand system — it's a **311-color generative system** where each Ge'ez character has a unique signature.

- 37 consonant families → 37 distinct hues, distributed around the wheel
- 7 vowel orders → 7 lightness/chroma steps within each family
- Result: 311 unique colors (37 × 7, minus redundancies for non-vocalic forms)

The full mapping lives in `geezword_master_reference.md` and `geezword_visual_map.html`. **Pull from that file — never invent character colors at the component level.**

**Where to use it:** per-character UI in games, syllable-audio sync highlighting, fidel keyboard key tints, character flashcard backgrounds, the GeezInterest tag system.

**Where NOT to use it:** marketing pages, navigation, body text, button fills, status states. Chrome stays in the §3a foundational palette.

### 3c. Mode-specific weighting

- **Learn**: parchment dominant, saffron accent, indigo for headings only
- **Play**: indigo or near-black background, saffron + character colors as fills, more rubric red allowed
- **Liturgy**: indigo-deep background, saffron borders, rubric red for ornamentation, NO character-color encoding (it's secular)
- **Hub**: parchment with indigo + saffron, gallery-style imagery dominant

### 3d. Dark mode

Dark mode is `--gz-indigo-deep` background with `--gz-parchment` text. Saffron stays the same; rubric red shifts to `#C24938` for legibility. Dark mode is **default for Play mode**, optional elsewhere.

---

## 4. Typography

### 4a. Ethiopic (the primary script)

```css
--gz-font-ethiopic-ui:    "Noto Sans Ethiopic", "Abyssinica SIL", sans-serif;
--gz-font-ethiopic-text:  "Noto Serif Ethiopic", "Abyssinica SIL", serif;
```

- Both available free from Google Fonts and well-supported on Android/iOS via Capacitor
- **Minimum body size: 18px.** Vowel-order diacritics blur below this. 16px is acceptable only for inline labels with visual context.
- **Line-height: 1.7** for paragraphs. Ethiopic glyphs are tall; tight leading clashes.
- **Letter-spacing: 0.** Never tracked. Ethiopic is calligraphic; tracking destroys it.
- Never display Ethiopic in italics. The script has no italic tradition; browser-faked italics are slanted geometry, not letterforms.

### 4b. Latin

```css
--gz-font-display: "Fraunces", "Cormorant Garamond", serif;
--gz-font-body:    "Newsreader", "Source Serif 4", Georgia, serif;
--gz-font-mono:    "JetBrains Mono", "Berkeley Mono", monospace;
```

- **Fraunces** (variable) is the display face — its soft contrast and slight quirk pair visually with Ethiopic curves better than any geometric sans
- **Newsreader** for long-form (lessons, story content) — drawn for screens, holds at small sizes
- **JetBrains Mono** for transliteration, code, and any Latin/Ethiopic interlinear gloss

**Pairing rule.** When Ethiopic and Latin sit on the same line at the same point size, Ethiopic visually outweighs Latin. Compensate by using Latin one weight heavier than feels natural (e.g., Latin 500 next to Ethiopic 400). Test at 16px and 24px before shipping.

### 4c. Type scale

```css
--gz-text-xs:   0.875rem;  /* 14px — captions, footer, never Ethiopic */
--gz-text-sm:   1rem;      /* 16px — UI labels */
--gz-text-base: 1.125rem;  /* 18px — body, MIN for Ethiopic */
--gz-text-lg:   1.25rem;   /* 20px — emphasized body */
--gz-text-xl:   1.5rem;    /* 24px — sub-headings */
--gz-text-2xl:  2rem;      /* 32px — section headings */
--gz-text-3xl:  2.75rem;   /* 44px — page headings */
--gz-text-4xl:  4rem;      /* 64px — display, marketing only */
```

---

## 5. Spacing & Layout

Base unit **4px**. Scale: `4, 8, 12, 16, 24, 32, 48, 64, 96, 128`.

```css
--gz-space-1: 0.25rem;  /* 4 */
--gz-space-2: 0.5rem;   /* 8 */
--gz-space-3: 0.75rem;  /* 12 */
--gz-space-4: 1rem;     /* 16 */
--gz-space-6: 1.5rem;   /* 24 */
--gz-space-8: 2rem;     /* 32 */
--gz-space-12: 3rem;    /* 48 */
--gz-space-16: 4rem;    /* 64 */
--gz-space-24: 6rem;    /* 96 */
--gz-space-32: 8rem;    /* 128 */
```

**Content widths.**
- Prose (lessons, stories): `max-width: 65ch`
- App shells (games, dashboards): `max-width: 1200px`
- Marketing hero: full-bleed, content centered to 1200px
- **Capacitor mobile**: respect iOS safe areas (`env(safe-area-inset-*)`), Android nav bar inset

**Layout principle.** Generous, textbook-like margins. Asymmetric layouts are welcome but never at the expense of Ethiopic readability — script always sits on a clear, calm field.

---

## 6. Components

### 6a. Buttons

- Radius: `6px` (Learn, Hub), `4px` (Play — sharper), `2px` or square (Liturgy)
- Primary fill: `--gz-saffron` with `--gz-ink` text
- Secondary: `--gz-ink` outline on parchment, no fill until hover
- Never use shadows for elevation on Learn or Liturgy. Play mode may use them.
- Button height: 44px minimum (touch target, Capacitor)

### 6b. Cards

| Mode | Background | Border | Shadow | Radius |
|---|---|---|---|---|
| Learn | `--gz-parchment-deep` | none | `0 1px 0 rgba(26,22,20,0.08)` | 8px |
| Play | `--gz-indigo` | none | `0 4px 12px rgba(0,0,0,0.25)` | 4px |
| Liturgy | `--gz-indigo-deep` | `1px solid --gz-saffron` | none | 0 |
| Hub | parchment, image-led | none | none | 8px |

### 6c. Forms

- Inputs: 1px bottom border in `--gz-ink-soft`, no full box outline (textbook aesthetic)
- Focus state: bottom border thickens to 2px and shifts to `--gz-saffron`
- Labels: above the field, never floating-label patterns
- Error: `--gz-rubric` text, never red glow or shake

### 6d. Fidel keyboard

A first-class component, not an afterthought. Lives in its own package, consumed by every app.
- Each key tinted with its character-color encoding (§3b) at 15% opacity
- Active state lifts the tint to 80%
- Diacritic vowel-order shown above the consonant in `--gz-font-mono` at 0.75× size
- Touch target: 48px minimum

---

## 7. Motion

**Principle: calligraphic, not springy.** Ge'ez letters have stroke order. Reveals, transitions, and tracing animations should feel like a pen moving — measured, weighted, with a clear lift at the end. Bouncy spring physics belongs in consumer apps; we are scholarly.

```css
--gz-ease-pen:    cubic-bezier(0.32, 0.08, 0.24, 1);   /* default — pen-lift curve */
--gz-ease-rubric: cubic-bezier(0.65, 0, 0.35, 1);      /* punctuation moments */
--gz-duration-quick:   180ms;
--gz-duration-default: 260ms;
--gz-duration-slow:    480ms;
```

**Page transitions:** 220–280ms. Slightly slower than typical SaaS (150ms) — matches the scholarly tone.

**Stroke reveals (tracing app, character cards):** Animate `stroke-dashoffset` along the character's actual stroke path, not a generic fade. Reveal time scales with stroke length (≈ 12ms per pixel of path length).

**Avoid:** parallax layers behind Ethiopic body text (interferes with reading), continuous loop animations near the script, scroll-jacking.

**Play mode** can be more expressive — game feedback, confetti on level complete, character bounces. Just keep the brand chrome calm.

---

## 8. Iconography & Imagery

### 8a. Icons

- Line icons, 1.5px stroke, rounded caps
- Set: Lucide is the baseline (already in your Capacitor stack)
- Custom icons must be drawn by hand, not AI-generated, when they reference cultural objects (krar, masinko, processional cross, injera mesob)

### 8b. Decorative motifs

Pull from authentic sources, abstracted:
- **Ethiopian manuscript margin ornaments** — ḥarag (የሐረግ ጌጥ) patterns, abstracted to monoline
- **Aksumite stelae** — geometric proportions and step motifs
- **Traditional textile patterns** — tilet (ጥለት) embroidery edges, simplified
- **Ge'ez characters as imagery** — large set fidel, treated as visual objects, not just text

### 8c. Photography

- Real diaspora community where appropriate (community events, family contexts)
- Ethiopian/Eritrean landscape sparingly — Lalibela, Asmara colonial architecture, highlands — never as travel-postcard hero shots
- **Never:** stock smiling-faces, hands-on-keyboard tech photos, "African villager" tropes, celebrity look-alikes

### 8d. Hard prohibitions

- No kente (West African — wrong region)
- No Maasai imagery (Kenyan/Tanzanian — wrong region)
- No Egyptian motifs in Ge'ez context (different script tradition)
- No Christian-specific iconography in inclusive properties — that lives in Liturgy mode only
- No AI-generated images of people, ever

---

## 9. Accessibility

- **Contrast.** WCAG AA minimum on every surface, AAA for body text on parchment. Saffron on parchment is borderline — use `--gz-saffron-deep` for any text on light backgrounds.
- **Ethiopic minimum size: 18px** (repeated here because it's the most-violated rule).
- **Touch targets: 44px min** for any interactive element.
- **Focus rings:** 2px solid `--gz-saffron`, 2px offset. Never remove focus rings.
- **Transliteration toggle.** Every Ethiopic-only instructional surface should offer a Latin transliteration toggle. Not optional — half the diaspora audience is heritage learners who can't read fidel yet.
- **RTL.** Ge'ez, Tigrinya, Amharic are LTR. **Arabic in Lissan requires full RTL support** — don't rely on `dir="auto"`; explicitly set per-screen.
- **Reduced motion.** Respect `prefers-reduced-motion: reduce`. Stroke-reveal animations should fall back to a 1-frame stroke render with a fade. Never to nothing — the visual is part of the lesson.

---

## 10. Working with This File

**For Claude Code.** This file is read on every session in any GeezWord/GeezSoft repo. When in doubt, prefer this file over generic frontend-design defaults. When this file conflicts with a task-specific request from Yemane, ask before deviating.

**For new repos.** Copy this file to the repo root as `DESIGN.md`. Add a one-line declaration to the repo's `CLAUDE.md`:

```
Design system: see ./DESIGN.md. Mode: [Learn | Play | Liturgy | Hub].
```

**For freelancers.** This is the brief. Tokens are non-negotiable; component patterns are starting points open to refinement; aesthetic direction within a mode is open to interpretation as long as the anti-patterns in §1 are respected.

**For updates.** This file evolves. When a token, mode, or rule changes, version-bump the file (`<!-- v1.x.x -->` at the top) and note the change in `CHANGELOG.md` at the repo root.

<!-- v1.0.0 — initial draft, April 2026 -->
