/** Original supplied PNGs stay intact; SVG crops and styles the white marks. */
const marks = {
  hrt: { name: 'Hudson River Trading', viewBox: '128 122 420 48', width: 674, height: 296 },
  stripe: { name: 'Stripe', viewBox: '144 190 160 68', width: 447, height: 447 },
  ubc: { name: 'The University of British Columbia', viewBox: '104 78 194 260', width: 400, height: 400 },
};

export default function ReferenceWordmark({ brand }: { brand: keyof typeof marks }) {
  const mark = marks[brand];
  const filterId = `wordmark-${brand}`;
  return <svg className={`reference-wordmark wordmark-${brand}`} viewBox={mark.viewBox} role="img" aria-label={mark.name}>
    <defs>
      <filter id={filterId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.13  0 0 0 0 0.13  0 5 0 0 -4" />
      </filter>
    </defs>
    <image href={`/logos/${brand}-reference.png`} width={mark.width} height={mark.height} filter={`url(#${filterId})`} />
  </svg>;
}
