const sharp = require('/home/claude/.npm-global/lib/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'brand-out');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Brand palette
const TEAL = '#0E7490';       // primary — trust, tech, water/sky (local)
const TEAL_DARK = '#0B5A70';
const INK = '#0B1220';        // near-black navy for text
const CORAL = '#FF6B4A';      // accent — energy, speed, CTAs
const CREAM = '#F6F7F5';

const FONT = 'Poppins';

// ---- Icon mark: rounded-square badge with checkmark ----
const iconSVG = (size = 100, radius = 22) => `
<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TEAL}"/>
      <stop offset="1" stop-color="${TEAL_DARK}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="100" height="100" rx="${radius}" fill="url(#g)"/>
  <path d="M27 51.5 L43 67 L74 33" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Monochrome silhouette (for safari pinned tab / mstile): just the check, no bg
const iconMonoSVG = `
<svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M27 51.5 L43 67 L74 33" fill="none" stroke="#000000" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ---- Horizontal logo lockup: icon + wordmark ----
const lockupSVG = (variant = 'dark') => {
  const textFill = variant === 'light' ? '#FFFFFF' : INK;
  return `
<svg width="520" height="100" viewBox="0 0 520 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TEAL}"/>
      <stop offset="1" stop-color="${TEAL_DARK}"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="100" height="100" rx="24" fill="url(#g)"/>
  <path d="M27 51.5 L43 67 L74 33" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="124" y="72" font-family="${FONT}" font-weight="700" font-size="62" letter-spacing="1" fill="${textFill}">SERVIO</text>
</svg>`;
};

// ---- Social share background: gradient + subtle "route" line art ----
const shareSVG = (w, h, { withWordmark = true, withTagline = true } = {}) => {
  const dots = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const x = (i * 97 + 53) % w;
    const y = (i * 61 + 37) % h;
    const r = 2 + (i % 3);
    dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF" opacity="0.10"/>`);
  }
  const routePath = `M ${-w*0.1} ${h*0.75} C ${w*0.2} ${h*0.55}, ${w*0.35} ${h*0.95}, ${w*0.55} ${h*0.6} S ${w*0.85} ${h*0.2}, ${w*1.1} ${h*0.35}`;
  const iconScale = Math.min(w, h) * 0.24;
  const iconX = w/2 - (withWordmark ? (iconScale*3.1) : iconScale) / 2;
  const iconY = h * 0.30 - iconScale/2;

  const wordmark = withWordmark ? `
    <g transform="translate(${w/2 - iconScale*1.55}, ${h*0.30 - iconScale/2})">
      <rect x="0" y="0" width="${iconScale}" height="${iconScale}" rx="${iconScale*0.24}" fill="#FFFFFF"/>
      <path d="M ${iconScale*0.27} ${iconScale*0.515} L ${iconScale*0.43} ${iconScale*0.67} L ${iconScale*0.74} ${iconScale*0.33}"
            fill="none" stroke="${TEAL_DARK}" stroke-width="${iconScale*0.10}" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="${iconScale*1.24}" y="${iconScale*0.72}" font-family="${FONT}" font-weight="700" font-size="${iconScale*0.62}" letter-spacing="1" fill="#FFFFFF">SERVIO</text>
    </g>` : '';

  const tagline = withTagline ? `
    <text x="${w/2}" y="${h*0.30 + iconScale*1.05}" text-anchor="middle" font-family="${FONT}" font-weight="400" font-size="${iconScale*0.26}" fill="#EAF6F6" opacity="0.92">Book trusted local pros in minutes</text>
  ` : '';

  return `
<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${TEAL_DARK}"/>
      <stop offset="0.55" stop-color="${TEAL}"/>
      <stop offset="1" stop-color="#124E5C"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>
  <path d="${routePath}" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="${Math.max(3, h*0.012)}" stroke-linecap="round"/>
  ${dots.join('\n')}
  ${wordmark}
  ${tagline}
</svg>`;
};

(async () => {
  // Icon PNGs
  await sharp(Buffer.from(iconSVG(100, 22))).resize(1024, 1024).png().toFile(path.join(OUT, 'icon-1024.png'));
  const sizes = [16, 32, 48, 180, 192, 512, 150];
  for (const s of sizes) {
    await sharp(Buffer.from(iconSVG(s, Math.round(s*0.22)))).resize(s, s).png().toFile(path.join(OUT, `icon-${s}.png`));
  }
  fs.writeFileSync(path.join(OUT, 'safari-pinned-tab.svg'), iconMonoSVG.trim());

  // Logo lockups (dark text on transparent bg) at 2x scale for crispness
  await sharp(Buffer.from(lockupSVG('dark'))).resize(1040, 200).png().toFile(path.join(OUT, 'logo-desktop.png'));
  // Mobile: icon-only square
  await sharp(Buffer.from(iconSVG(100, 22))).resize(100, 100).png().toFile(path.join(OUT, 'logo-mobile.png'));

  // Social/hero images
  await sharp(Buffer.from(shareSVG(1500, 818, { withWordmark: true, withTagline: true })))
    .jpeg({ quality: 88 }).toFile(path.join(OUT, 'brandImage-1500.jpg'));
  await sharp(Buffer.from(shareSVG(1200, 630, { withWordmark: true, withTagline: true })))
    .jpeg({ quality: 88 }).toFile(path.join(OUT, 'facebook-sharing-1200x630.jpg'));
  await sharp(Buffer.from(shareSVG(600, 314, { withWordmark: true, withTagline: false })))
    .jpeg({ quality: 88 }).toFile(path.join(OUT, 'twitter-sharing-600x314.jpg'));

  console.log('Brand assets generated.');
})().catch(e => { console.error(e); process.exit(1); });
