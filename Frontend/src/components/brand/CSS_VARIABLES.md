/**
 * NRETech Brand System - CSS Variables Reference
 * 
 * Complete reference of all CSS custom properties available
 * Use these variables for dynamic styling and theme customization
 */

/* ========== Brand Colors ========== */
:root {
  --gold: #EAB308;                    /* Primary brand gold */
  --gold-light: #fef08a;              /* Light gold for highlights */
  --gold-dark: #ca8a04;               /* Dark gold for hover states */
  
  --dark-bg: #0D1117;                 /* Main dark background */
  --dark-bg-deep: #05070A;            /* Deep dark for contrast */
  --dark-surface: #161B22;            /* Surface/card background */
  --dark-surface-light: #1C2128;      /* Light surface for inputs */
}

/* ========== Typography ========== */
:root {
  --font-heading: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-body: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Fira Code', 'Monaco', monospace;
}

/* ========== Text Colors ========== */
:root {
  --text: #FFFFFF;                    /* Primary text */
  --text-secondary: rgba(255, 255, 255, 0.7);  /* Secondary text */
  --text-muted: rgba(255, 255, 255, 0.5);      /* Muted text */
}

/* ========== Borders ========== */
:root {
  --border: rgba(255, 255, 255, 0.1);         /* Default border */
  --border-hover: rgba(255, 255, 255, 0.2);   /* Hover border */
  --border-gold: rgba(234, 179, 8, 0.2);      /* Gold border */
}

/* ========== Spacing ========== */
:root {
  --space-xs: 0.25rem;   /* 4px */
  --space-sm: 0.5rem;    /* 8px */
  --space-md: 1rem;      /* 16px */
  --space-lg: 1.5rem;    /* 24px */
  --space-xl: 2rem;      /* 32px */
}

/* ========== Shadows & Elevation ========== */
:root {
  /* Card shadows */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.1);
  --shadow-card-hover: 0 8px 24px rgba(0, 0, 0, 0.15);
  
  /* Gold glow effects */
  --shadow-gold-glow: 0 0 20px rgba(234, 179, 8, 0.15);
  --shadow-gold-glow-hover: 0 0 30px rgba(234, 179, 8, 0.25);
  --shadow-gold-glow-active: 0 0 40px rgba(234, 179, 8, 0.35);
  
  /* Focus shadow */
  --shadow-focus-gold: 0 0 0 3px rgba(234, 179, 8, 0.1), 0 0 0 1px rgba(234, 179, 8, 0.5);
  
  /* Standard shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.15);
  --shadow-xl: 0 20px 40px rgba(0, 0, 0, 0.2);
}

/* ========== Transitions ========== */
:root {
  --transition-fast: 100ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-normal: 200ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 300ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slower: 500ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* ========== Border Radius ========== */
:root {
  --radius-sm: 0.25rem;     /* 4px */
  --radius-md: 0.5rem;      /* 8px */
  --radius-lg: 0.75rem;     /* 12px */
  --radius-xl: 1rem;        /* 16px */
  --radius-full: 9999px;    /* circular */
  
  --radius-button: 0.75rem; /* 12px */
  --radius-card: 1rem;      /* 16px */
  --radius-input: 0.5rem;   /* 8px */
}

/* ========== Legacy/Compatibility ========== */
:root {
  --color-primary: #EAB308;       /* Maps to gold */
  --color-primary-dark: #ca8a04;  /* Maps to gold-dark */
  --bg: #0D1117;                  /* Dark background */
  --surface: #161B22;             /* Surface background */
}

/* ========== Usage Examples ========== */

/*
  Use CSS variables with var() function:
  
  color: var(--text);
  background-color: var(--dark-bg);
  border: 1px solid var(--border-gold);
  box-shadow: var(--shadow-gold-glow);
  font-family: var(--font-heading);
  padding: var(--space-md);
  border-radius: var(--radius-card);
  transition: all var(--transition-normal);
*/

/* ========== Practical Examples ========== */

/* Gold button with glow */
.example-button {
  background-color: var(--gold);
  color: black;
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-button);
  border: none;
  font-family: var(--font-body);
  font-weight: 600;
  box-shadow: var(--shadow-card);
  transition: all var(--transition-normal);
  cursor: pointer;
}

.example-button:hover {
  background-color: var(--gold-dark);
  box-shadow: var(--shadow-gold-glow-hover);
  transform: translateY(-2px);
}

.example-button:focus-visible {
  outline: 2px solid white;
  outline-offset: 2px;
}

/* Premium card */
.example-card {
  background: linear-gradient(135deg, var(--dark-bg) 0%, var(--dark-surface) 100%);
  border: 1px solid var(--border-gold);
  border-radius: var(--radius-card);
  padding: var(--space-lg);
  box-shadow: var(--shadow-card);
  transition: all var(--transition-normal);
}

.example-card:hover {
  border-color: rgba(234, 179, 8, 0.4);
  box-shadow: var(--shadow-card-hover);
}

/* Form input */
.example-input {
  background-color: var(--dark-surface-light);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  padding: var(--space-sm) var(--space-md);
  color: var(--text);
  font-family: var(--font-body);
  transition: all var(--transition-normal);
}

.example-input:hover {
  border-color: rgba(234, 179, 8, 0.4);
}

.example-input:focus-visible {
  outline: none;
  border-color: var(--gold);
  box-shadow: var(--shadow-focus-gold);
}

/* Heading */
.example-heading {
  font-family: var(--font-heading);
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

/* Badge */
.example-badge {
  background-color: rgba(234, 179, 8, 0.2);
  border: 1px solid rgba(234, 179, 8, 0.4);
  color: var(--gold-light);
  padding: var(--space-sm) var(--space-md);
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--font-body);
}

/* ========== Dark Theme Override ========== */

@media (prefers-color-scheme: dark) {
  :root {
    --bg: var(--dark-bg);
    --surface: var(--dark-surface);
    --text: #FFFFFF;
  }
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f9fafb;
    --surface: #ffffff;
    --text: #0f172a;
  }
}

/* ========== Responsive Adjustments ========== */

@media (max-width: 640px) {
  :root {
    /* Tighter spacing on mobile */
    --space-lg: 1rem;
    --space-xl: 1.5rem;
    
    /* Larger touch targets */
    --radius-button: 0.75rem;
  }
}

/* ========== Animation Keyframes ========== */

@keyframes pulse-gold {
  0%, 100% {
    box-shadow: var(--shadow-gold-glow);
  }
  50% {
    box-shadow: var(--shadow-gold-glow-active);
  }
}

@keyframes glow {
  0%, 100% {
    filter: drop-shadow(var(--shadow-gold-glow));
  }
  50% {
    filter: drop-shadow(var(--shadow-gold-glow-hover));
  }
}

/* ========== Utility Classes ========== */

.text-gold { color: var(--gold); }
.text-primary { color: var(--text); }
.text-secondary { color: var(--text-secondary); }
.text-muted { color: var(--text-muted); }

.bg-dark { background-color: var(--dark-bg); }
.bg-surface { background-color: var(--dark-surface); }
.bg-gold { background-color: var(--gold); }

.border-gold { border-color: var(--border-gold); }
.border-primary { border-color: var(--border); }

.shadow-gold { box-shadow: var(--shadow-gold-glow); }
.shadow-card { box-shadow: var(--shadow-card); }
.shadow-card-hover { box-shadow: var(--shadow-card-hover); }

.rounded-card { border-radius: var(--radius-card); }
.rounded-button { border-radius: var(--radius-button); }
.rounded-input { border-radius: var(--radius-input); }

.transition-brand { transition: all var(--transition-normal); }
.transition-fast { transition: all var(--transition-fast); }
.transition-slow { transition: all var(--transition-slow); }

/* ========== Custom Properties Support Check ========== */

@supports (--css: variables) {
  /* Modern browsers with CSS custom property support */
  
  .modern-element {
    color: var(--text);
    background-color: var(--dark-bg);
    padding: var(--space-md);
    border-radius: var(--radius-card);
  }
}

/* ========== Fallback for Older Browsers ========== */

@supports not (--css: variables) {
  /* Fallback for browsers without CSS custom property support */
  
  .fallback-element {
    color: #FFFFFF;
    background-color: #0D1117;
    padding: 1rem;
    border-radius: 1rem;
  }
}

/* ========== Documentation ========== */

/*
  CSS VARIABLE NAMING CONVENTION:
  
  --category-state-variant
  
  Examples:
  --gold (primary color)
  --gold-light (light variant)
  --gold-dark (dark variant)
  --shadow-card (default card shadow)
  --shadow-card-hover (hover state shadow)
  --transition-normal (normal timing)
  --radius-card (card border radius)
  
  PRIORITY ORDER:
  1. Brand-specific variables (--gold, --dark-bg)
  2. Component variables (--shadow-card, --radius-button)
  3. State variables (hover, active, focus)
  4. Responsive variations (mobile, tablet, desktop)
  
  BEST PRACTICES:
  ✓ Use descriptive variable names
  ✓ Group related variables
  ✓ Include fallback values
  ✓ Document purpose and usage
  ✓ Update in one place only
  ✓ Test across browsers
  
  AVOID:
  ✗ Deep nesting of variables
  ✗ Overly generic names (--color1, --size2)
  ✗ Mixing units (px, rem, em)
  ✗ Hard-coding values (use variables instead)
*/
