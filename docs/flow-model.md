# Reflective crescent background

The background is a continuous champagne reflection on taupe material, with fine moving grains. Lighting and grain placement are independent. There is no visible point source, convergence point, closed ring, or opaque body.

## Lighting geometry

`src/FlowRenderer.ts` defines one ellipse in CSS-pixel space. Its center is `(1.13 × width, .14 × height)`, outside the right edge. Its axes are `(width, .68 × height)` on desktop; the horizontal radius smoothly grows to `1.25 × width` on tall phones to keep the reflection left of the title and its local frame rotates by `.12` radians. Scroll moves the reflection upward by at most `.045 × min(width, height)` using a smooth bounded response.

The signed distance is the implicit ellipse equation divided by its gradient magnitude. A center guard prevents division by zero. Two positive Gaussian lobes share this distance: a broad shoulder of width `.145 × min(width, height)` and strength `.85`, and a brighter ridge of width `.032 × min(width, height)` and strength `3.30`. Their periodic angular envelopes share the direction `normalize(-.86, .51)` and exponents `1.40` and `4.40`. This produces a partial reflection entering and leaving the frame, with no angular seam.

Linear radiance is `(.20, .183, .151) + (1, .90, .76) × (shoulder + ridge)`. No subtractive shadow, radial darkening, density mask, or noise enters this calculation. Monotonic exposure, Reinhard compression, and sRGB encoding follow. Exposure smoothly decreases while reading the lower sections.

## Material and motion

A deterministic local 256 × 256 noise texture is generated and uploaded once. Two filtered samples form fine grain and short anisotropic fibers. A slow common translation and gentle shear move the texture; neither has a rotational center. Material contrast is applied after tone mapping, bounded to ±6.5%, so it remains perceptible on the highlight without carving dark patches. Subtle stationary dither prevents banding.

The more visible moving grains use the same reflection function at each position. Their density is spatially uniform and cannot change the continuous lighting geometry. They drift together at approximately 7 horizontal and 2.5 vertical CSS pixels per second, with a gentle shear. Eighty percent have 2.7–7.2 pixel trails and the remainder are dots. Grain widths are .81–1.26 CSS pixels, using a shared 1.8× size multiplier. The pool has at most 18,000 grains, targeting one per 70 square CSS pixels. Their positions are calculated on the GPU; nothing converges or circles a point. They add a small amount of light to the surface; no dark blending or depth occlusion is used.

## Runtime

The renderer uses WebGL1 and local resources, with one full-screen draw and one additive grain draw. It does not fetch a lighting atlas or require half-float extensions, blur pyramids, or per-frame CPU particle updates. The previous 3D envelope, point-core rendering, and atlas studies are historical and are no longer used by the website. Offline studies remain in the sibling `design-studies/physics-model` directory.

`src/Particles.tsx` keeps the existing pause/resume, reduced-motion, visibility, context-loss handling, and scroll smoothing. Canvas resolution is capped at four million pixels. The reflection and material remain static when paused; resuming reuses existing resources.

## Checks

The ellipse lighting was sampled at 390 × 844, 891 × 1114, 1440 × 900, and 1920 × 900, including several scroll positions. The center remains off-screen, lighting stays finite and nonnegative, and 1,587 sampled normal sections each have a single maximum with no dark undershoot. These checks cover the continuous lighting; the separate additive grains do not subtract from it.

## Page opening

A fresh visit to the top of the page runs a 1.6-second entrance using a shared clock in `src/useOpeningSequence.ts`. A quintic progression reveals the existing reflection along its elliptical arc, from upper-left toward lower-right. A 24%-arc feather keeps the moving boundary soft. The reveal multiplies only the positive light: at zero it leaves the taupe material, and at one it restores the exact steady reflection. The moving grain layer fades in over the same interval.

The name begins at 340 ms with an 8-pixel upward fade; the subtitle follows at 560 ms with a 6-pixel fade. The scroll cue starts at 1,050 ms and preserves its horizontal centering throughout. The Web Animations API changes only opacity and transform, with content visible by default and no layout shift or input lock.

Reduced-motion preferences, deep links, restored scroll positions, and history returns skip the entrance. Hidden tabs suspend the shared clock and text animations. Pausing the particles during the entrance stops their drift immediately while the brief light/text reveal completes, preventing a brightness jump on resume. After the entrance, pause/resume continues to reuse the same GPU resources.
