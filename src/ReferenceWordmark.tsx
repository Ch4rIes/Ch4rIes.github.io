/** Display the supplied white wordmarks without their surrounding photo/color panels.
 * The original PNGs are retained intact; cropping and monochrome styling happen in SVG.
 */
export default function ReferenceWordmark({ brand }: { brand: 'hrt' | 'stripe' }) {
  const hrt = brand === 'hrt';
  const name = hrt ? 'Hudson River Trading' : 'Stripe';
  const filterId = `wordmark-${brand}`;
  return <svg
    className={`reference-wordmark wordmark-${brand}`}
    viewBox={hrt ? '128 122 420 48' : '144 190 160 68'}
    role="img" aria-label={name}
  >
    <defs>
      <filter id={filterId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.13  0 0 0 0 0.13  0 5 0 0 -4" />
      </filter>
    </defs>
    <image href={`/logos/${brand}-reference.png`} width={hrt ? 674 : 447} height={hrt ? 296 : 447} filter={`url(#${filterId})`} />
  </svg>;
}
