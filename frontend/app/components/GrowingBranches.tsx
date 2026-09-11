'use client';

import { useId, useSyncExternalStore } from 'react';

type Point = { x: number; y: number };
type Curve = { start: Point; c1: Point; c2: Point; end: Point };
type Limb = {
    d: string;
    outline: string;
    bounds: { x: number; y: number; width: number; height: number };
    width: number;
    depth: number;
    name: string;
    delay: number;
    duration: number;
};
type Leaf = Point & {
    angle: number;
    size: number;
    aspect: number;
    shade: number;
    name: string;
    delay: number;
};

// The first three units are the petiole; the blade is slightly asymmetric.
const leafShape = 'M3 0C7-5 14-7 21-1C16 0 13 7 8 4C5 3 4 1 3 0Z';
const leafColors = ['#35543a', '#436442', '#526f46', '#657f50', '#788b59'];
const radians = Math.PI / 180;
const trunkBase = 746;
const trunkTip = 206;
const trunkDelay = 0.2;
const trunkDuration = 2.55;
const wideViewportQuery = '(min-width: 1200px)';

function subscribeToWideViewport(onStoreChange: () => void) {
    const mediaQuery = window.matchMedia(wideViewportQuery);
    mediaQuery.addEventListener('change', onStoreChange);
    return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function getWideViewportSnapshot() {
    return window.matchMedia(wideViewportQuery).matches;
}

function useWideViewport() {
    return useSyncExternalStore(subscribeToWideViewport, getWideViewportSnapshot, () => false);
}

function seededRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function pointOn(curve: Curve, t: number): Point {
    const u = 1 - t;
    const { start, c1, c2, end } = curve;
    return {
        x: u ** 3 * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * end.x,
        y: u ** 3 * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * end.y,
    };
}

function tangentOn(curve: Curve, t: number): Point {
    const u = 1 - t;
    const { start, c1, c2, end } = curve;
    const x = 3 * u * u * (c1.x - start.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (end.x - c2.x);
    const y = 3 * u * u * (c1.y - start.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (end.y - c2.y);
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
}

// Seeded randomness is repeatable, but floating-point geometry can differ in
// its last digits between server and browser. Format every rendered value at
// the SVG boundary; keep full precision for the growth calculations.
const svgNumber = (value: number) => {
    const formatted = value.toFixed(4);
    return formatted === '-0.0000' ? '0.0000' : formatted;
};
const coordinate = (point: Point) => `${svgNumber(point.x)} ${svgNumber(point.y)}`;
const leafTransform = (leaf: Leaf) =>
    `translate(${coordinate(leaf)}) rotate(${svgNumber(leaf.angle)}) scale(${svgNumber(leaf.size)} ${svgNumber(leaf.size * leaf.aspect)})`;
const widthAt = (width: number, tipWidth: number, t: number) => width + (tipWidth - width) * t ** 0.8;

// A filled outline tapers continuously, while its centerline mask draws it on.
function taperedOutline(curve: Curve, width: number, tipWidth: number) {
    const left: Point[] = [];
    const right: Point[] = [];
    for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const point = pointOn(curve, t);
        const tangent = tangentOn(curve, t);
        const radius = widthAt(width, tipWidth, t) / 2;
        left.push({ x: point.x - tangent.y * radius, y: point.y + tangent.x * radius });
        right.push({ x: point.x + tangent.y * radius, y: point.y - tangent.x * radius });
    }
    const reversed = right.reverse();
    const tipRadius = svgNumber(tipWidth / 2);
    const baseRadius = svgNumber(width / 2);
    // Rounded ends overlap cleanly when the next shoot changes direction.
    return `M${left.map(coordinate).join('L')}A${tipRadius} ${tipRadius} 0 0 0 ${coordinate(reversed[0])}`
        + `L${reversed.slice(1).map(coordinate).join('L')}A${baseRadius} ${baseRadius} 0 0 0 ${coordinate(left[0])}Z`;
}

function makeTree(seed: number) {
    const random = seededRandom(seed);
    // Changing the foliage does not change the branch structure.
    const leafRandom = seededRandom(seed ^ 0x9e3779b9);
    const limbs: Limb[] = [];
    const leaves: Leaf[] = [];

    const grow = (
        start: Point, angle: number, length: number, width: number,
        depth: number, name: string, delay: number, side: number,
    ) => {
        // Older limbs arch upward; fine shoots vary more freely.
        const tipAngle = angle + (-90 - angle) * (depth > 1 ? 0.22 : 0.12) + (random() - 0.5) * 20;
        const direction = angle * radians;
        const tipDirection = tipAngle * radians;
        const meanDirection = (direction + tipDirection) / 2;
        const end = {
            x: start.x + Math.cos(meanDirection) * length,
            y: start.y + Math.sin(meanDirection) * length,
        };
        const curve: Curve = {
            start,
            c1: {
                x: start.x + Math.cos(direction) * length * 0.36,
                y: start.y + Math.sin(direction) * length * 0.36,
            },
            c2: {
                x: end.x - Math.cos(tipDirection) * length * 0.32,
                y: end.y - Math.sin(tipDirection) * length * 0.32,
            },
            end,
        };
        const tipWidth = Math.max(0.3, width * (depth === 0 ? 0.16 : 0.58));
        const duration = Math.max(0.18, length / 250);
        const finishedAt = delay + duration;
        const xs = [start.x, curve.c1.x, curve.c2.x, end.x];
        const ys = [start.y, curve.c1.y, curve.c2.y, end.y];
        const padding = width + 2;
        limbs.push({
            d: `M${coordinate(start)}C${coordinate(curve.c1)} ${coordinate(curve.c2)} ${coordinate(end)}`,
            outline: taperedOutline(curve, width, tipWidth),
            bounds: {
                x: Math.min(...xs) - padding,
                y: Math.min(...ys) - padding,
                width: Math.max(...xs) - Math.min(...xs) + padding * 2,
                height: Math.max(...ys) - Math.min(...ys) + padding * 2,
            },
            width, depth, name, delay, duration,
        });

        // Only the terminal shoots carry foliage: two leaves, occasionally three.
        if (depth === 0) {
            const count = leafRandom() < 0.3 ? 3 : 2;
            const firstSide = leafRandom() < 0.5 ? -1 : 1;
            for (let i = 0; i < count; i++) {
                const t = Math.min(0.96, 0.38 + i * (0.5 / (count - 1)) + leafRandom() * 0.07);
                const point = pointOn(curve, t);
                // Leave small gaps where neighboring shoots would overlap.
                if (leaves.some(leaf => Math.hypot(leaf.x - point.x, leaf.y - point.y) < 10)) continue;
                const tangent = tangentOn(curve, t);
                const leafSide = i % 2 === 0 ? firstSide : -firstSide;
                leaves.push({
                    ...point,
                    angle: Math.atan2(tangent.y, tangent.x) / radians + leafSide * (32 + leafRandom() * 36),
                    size: 0.5 + leafRandom() * 0.32,
                    aspect: 0.65 + leafRandom() * 0.45,
                    shade: Math.floor(leafRandom() * leafColors.length),
                    name,
                    delay: finishedAt + 0.04 + i * 0.07 + leafRandom() * 0.12,
                });
            }
            return;
        }

        // One main extension preserves the flow of the limb through the junction.
        grow(end, tipAngle + (random() - 0.5) * 23,
            length * (0.63 + random() * 0.12), tipWidth,
            depth - 1, name, finishedAt, -side);

        // Smaller lateral branches emerge at staggered points along the limb.
        // Some fine branches remain unbranched, breaking the repeated Y pattern.
        if (depth > 1 || random() > 0.18) {
            const t = 0.56 + random() * 0.23;
            const tangent = tangentOn(curve, t);
            const lateralAngle = Math.atan2(tangent.y, tangent.x) / radians + side * (32 + random() * 25);
            grow(pointOn(curve, t), Math.max(-174, Math.min(-6, lateralAngle)),
                length * (0.44 + random() * 0.18), widthAt(width, tipWidth, t) * 0.54,
                depth - 1, name, finishedAt + 0.03, -side);
        }
    };

    const scaffolds: [Point, number, number, number, string][] = [
        [{ x: 695, y: 548 }, -151, 151, 15, 'lower-left'],
        [{ x: 695, y: 514 }, -30, 159, 14, 'lower-right'],
        [{ x: 691, y: 468 }, -132, 162, 14, 'middle-lower-left'],
        [{ x: 690, y: 435 }, -44, 169, 13, 'middle-right'],
        [{ x: 689, y: 397 }, -146, 135, 11, 'middle-left'],
        [{ x: 692, y: 351 }, -57, 125, 10, 'upper-right'],
        [{ x: 696, y: 316 }, -119, 116, 10, 'upper-left'],
        [{ x: 700, y: 281 }, -77, 88, 8, 'top-right'],
        [{ x: 700, y: 253 }, -104, 80, 7, 'top-left'],
    ];
    for (const [start, angle, length, width, name] of scaffolds) {
        const delay = trunkDelay + ((trunkBase - start.y) / (trunkBase - trunkTip)) * trunkDuration;
        grow(start, angle + (random() - 0.5) * 9, length, width, 3, name, delay, angle < -90 ? 1 : -1);
    }
    return { limbs, leaves };
}

const trees = { left: makeTree(41), center: makeTree(137), right: makeTree(293) };
const trunkShape = 'M662 746Q678 728 679 696L681 609Q679 552 680 503L680 439Q680 373 689 314L695 249L701 206L705 249L704 314Q700 383 703 439L706 506Q706 567 711 609L715 696Q718 730 738 746Q714 741 703 737Q682 743 662 746Z';

function GrowingBranchTree({ position }: { position: 'left' | 'center' | 'right' }) {
    const { limbs, leaves } = trees[position];
    // Each mounted tree needs its own mask IDs, including multiple center trees.
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const maskId = (index: number) => `tree-${id}-${position}-${index}`;
    return (
        <svg
            className={`hero-growth-natural landing-hero-growth-svg landing-hero-growth-svg--${position}`}
            viewBox="0 0 1400 800" width="1400" height="800" fill="none"
            preserveAspectRatio="xMidYMid meet" focusable="false"
        >
            <defs>
                {limbs.map((limb, i) => (
                    <mask key={i} id={maskId(i)} maskUnits="userSpaceOnUse"
                        x={svgNumber(limb.bounds.x)} y={svgNumber(limb.bounds.y)}
                        width={svgNumber(limb.bounds.width)} height={svgNumber(limb.bounds.height)}
                        style={{ maskType: 'alpha' }}>
                        <path pathLength="1" d={limb.d} className="hero-growth-path"
                            strokeLinecap="round"
                            style={{ stroke: 'white', strokeWidth: svgNumber(limb.width + 2), fill: 'none', animationDelay: `${svgNumber(limb.delay)}s`, animationDuration: `${svgNumber(limb.duration)}s` }} />
                    </mask>
                ))}
            </defs>
            <g transform={position === 'right' ? 'translate(1400 0) scale(-1 1)' : undefined}>
                <g className={`hero-growth-canopy hero-growth-canopy--${position}`}>
                    <g className="hero-growth-vines" strokeLinecap="round" strokeLinejoin="round">
                        {limbs.map((limb, i) => (
                            <path key={i} d={limb.outline} mask={`url(#${maskId(i)})`}
                                className={`hero-growth-limb hero-growth-${limb.name}${limb.depth <= 1 ? '-twig' : ''}`}
                                style={{ fill: 'var(--tree-bark, #65513c)', stroke: 'none' }} />
                        ))}
                        {/* Drawing the trunk last blends the scaffold bases into its silhouette. */}
                        <g className="hero-growth-trunk-silhouette" stroke="none">
                            <path d={trunkShape} style={{ fill: 'var(--tree-bark, #65513c)' }} />
                            <path d="M685 717Q691 657 688 606L688 498Q687 412 697 316L701 246L696 423L699 564Q695 654 701 731Z"
                                fill="var(--tree-bark-light, #a18b6b)" opacity=".26" />
                            <path d="M707 728Q702 668 700 610M685 690Q689 660 686 630M696 549Q691 520 694 483M693 404L695 364"
                                stroke="var(--tree-bark-dark, #403c30)" strokeWidth="1.1" opacity=".32" fill="none" />
                        </g>
                    </g>
                    <g className="hero-growth-leaves">
                        {leaves.map((leaf, i) => (
                            <g key={i} transform={leafTransform(leaf)}>
                                <g className={`hero-growth-leaf hero-leaf-${leaf.name}`} style={{ animationDelay: `${svgNumber(leaf.delay)}s` }}>
                                    <path d="M0 0Q2-1 4 0" stroke="var(--tree-bark, #65513c)" strokeWidth=".65" fill="none" />
                                    <path d={leafShape} style={{ fill: `var(--tree-leaf-${leaf.shade}, ${leafColors[leaf.shade]})`, stroke: 'none' }} />
                                    <path d="M4 0Q11-1 18-1" stroke="var(--tree-leaf-vein, #c0c99b)" strokeWidth=".45" opacity=".48" fill="none" />
                                </g>
                            </g>
                        ))}
                    </g>
                </g>
            </g>
        </svg>
    );
}

export function GrowingBranches() {
    const showOuterTrees = useWideViewport();

    return (
        <div className="landing-hero-growth" aria-hidden="true">
            {showOuterTrees && <GrowingBranchTree position="left" />}
            <GrowingBranchTree position="center" />
            {showOuterTrees && <GrowingBranchTree position="right" />}
        </div>
    );
}
