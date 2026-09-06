import { WallSegment, Portal, WallPoint } from '../types';

export interface Segment {
  a: WallPoint;
  b: WallPoint;
}

/**
 * Convert wall polylines and closed portals into individual line segments
 * for raycasting.
 */
export function extractBlockingSegments(
  walls: WallSegment[],
  objectWalls: WallSegment[],
  portals: Portal[]
): Segment[] {
  const segments: Segment[] = [];

  for (const wall of walls) {
    for (let i = 0; i < wall.points.length - 1; i++) {
      segments.push({ a: wall.points[i], b: wall.points[i + 1] });
    }
  }

  for (const wall of objectWalls) {
    for (let i = 0; i < wall.points.length - 1; i++) {
      segments.push({ a: wall.points[i], b: wall.points[i + 1] });
    }
  }

  for (const portal of portals) {
    if (portal.closed) {
      segments.push({ a: portal.bounds[0], b: portal.bounds[1] });
    }
  }

  return segments;
}

/**
 * How far to each side of a corner, in pixels at that corner, the flanking
 * rays are aimed.
 *
 * This is a distance rather than a fixed angle on purpose. The original fixed
 * 0.0001 rad scaled with distance: a corner 200px away was cleared by only
 * 0.02px, finer than the noise in imported wall coordinates, so the side rays
 * stopped reliably clearing the corner they exist to slip past.
 */
const RAY_OFFSET_PX = 0.5;

/**
 * How far past each end, in pixels, a segment still counts as hit.
 *
 * Wall polylines and door bounds arrive in separate arrays from a UVTT import,
 * so a door jamb and the wall beside it frequently land a fraction of a pixel
 * apart instead of exactly on the same point. That leaves a hairline crack at
 * every doorway, and the ray aimed straight at the corner threads it and runs
 * all the way to the map boundary — drawing a thin spoke of lit floor across
 * the dark. Treating each segment as a touch longer seals those cracks.
 *
 * This must stay well under RAY_OFFSET_PX, or it would also swallow the
 * flanking rays that are supposed to clear a corner and light the space behind
 * it — which would stop shadows spilling through real openings.
 */
const SEGMENT_END_TOLERANCE_PX = 0.1;

/**
 * Compute the visibility polygon from an observer point against blocking segments.
 * Uses the classic raycasting approach: cast rays toward each segment endpoint
 * (plus small angular offsets) and find the nearest intersection.
 */
export function computeVisibilityPolygon(
  observer: WallPoint,
  segments: Segment[],
  mapWidth: number,
  mapHeight: number
): WallPoint[] {
  // Add map boundary segments so rays always hit something
  const allSegments: Segment[] = [
    ...segments,
    { a: { x: 0, y: 0 }, b: { x: mapWidth, y: 0 } },           // top
    { a: { x: mapWidth, y: 0 }, b: { x: mapWidth, y: mapHeight } }, // right
    { a: { x: mapWidth, y: mapHeight }, b: { x: 0, y: mapHeight } }, // bottom
    { a: { x: 0, y: mapHeight }, b: { x: 0, y: 0 } },           // left
  ];

  // Collect all unique endpoints
  const endpointSet = new Set<string>();
  const endpoints: WallPoint[] = [];

  for (const seg of allSegments) {
    const ka = `${seg.a.x},${seg.a.y}`;
    const kb = `${seg.b.x},${seg.b.y}`;
    if (!endpointSet.has(ka)) {
      endpointSet.add(ka);
      endpoints.push(seg.a);
    }
    if (!endpointSet.has(kb)) {
      endpointSet.add(kb);
      endpoints.push(seg.b);
    }
  }

  // For each endpoint: one ray straight at the corner (which pins the corner
  // vertex) and one to each side (which reach whatever lies behind it).
  const angles: number[] = [];

  for (const ep of endpoints) {
    const dx = ep.x - observer.x;
    const dy = ep.y - observer.y;
    const angle = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    // atan2 of a zero-length vector is meaningless; guard the divide too.
    const offset = dist > 1e-6 ? Math.min(RAY_OFFSET_PX / dist, 0.01) : 0.01;
    angles.push(angle - offset, angle, angle + offset);
  }

  // This is the inner loop of the whole vision system — it runs for every
  // light and every token that moves, at (rays x segments) per polygon. Flatten
  // the segments into typed arrays once so the loop below reads packed numbers
  // instead of chasing object properties, and precompute each segment's end
  // tolerance (a fixed pixel distance, so in the segment's own parameter space
  // it depends on that segment's length).
  const segCount = allSegments.length;
  const segAx = new Float64Array(segCount);
  const segAy = new Float64Array(segCount);
  const segDx = new Float64Array(segCount);
  const segDy = new Float64Array(segCount);
  const segPad = new Float64Array(segCount);

  for (let i = 0; i < segCount; i++) {
    const seg = allSegments[i];
    const sx = seg.b.x - seg.a.x;
    const sy = seg.b.y - seg.a.y;
    segAx[i] = seg.a.x;
    segAy[i] = seg.a.y;
    segDx[i] = sx;
    segDy[i] = sy;
    const len = Math.hypot(sx, sy);
    segPad[i] = len > 1e-9 ? SEGMENT_END_TOLERANCE_PX / len : 0;
  }

  // Cast each ray and find nearest intersection
  const intersections: { angle: number; point: WallPoint }[] = [];
  const obsX = observer.x;
  const obsY = observer.y;

  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let closestT = Infinity;

    for (let si = 0; si < segCount; si++) {
      const sx = segDx[si];
      const sy = segDy[si];

      const denom = dx * sy - dy * sx;
      if (denom > -1e-10 && denom < 1e-10) continue; // parallel

      const ox = segAx[si] - obsX;
      const oy = segAy[si] - obsY;

      const t = (ox * sy - oy * sx) / denom;
      if (t <= 0 || t >= closestT) continue;

      const u = (ox * dy - oy * dx) / denom;
      const pad = segPad[si];
      if (u < -pad || u > 1 + pad) continue;

      closestT = t;
    }

    // Build the hit point only for the winning segment. Doing this inside the
    // loop allocated an object for every one of the (rays x segments) tests.
    if (closestT < Infinity) {
      intersections.push({
        angle,
        point: { x: obsX + closestT * dx, y: obsY + closestT * dy },
      });
    }
  }

  // Sort by angle
  intersections.sort((a, b) => a.angle - b.angle);

  return intersections.map(i => i.point);
}

/**
 * Clip a visibility polygon to a circle centered on the observer.
 *
 * Because the visibility polygon is star-shaped from the observer, every
 * vertex lies along a ray from that point.  We simply clamp each vertex to
 * the circle radius and insert arc interpolation wherever two consecutive
 * vertices were both clamped (i.e. both beyond the radius in open space).
 */
export function clipPolygonToCircle(
  polygon: WallPoint[],
  center: WallPoint,
  radiusPx: number
): WallPoint[] {
  if (polygon.length < 3) return [];

  const r2 = radiusPx * radiusPx;

  // Clamp a point to the circle by projecting back along its ray from center.
  const clamp = (p: WallPoint): { point: WallPoint; wasOutside: boolean } => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= r2) return { point: p, wasOutside: false };
    const d = Math.sqrt(d2);
    return { point: { x: center.x + (dx / d) * radiusPx, y: center.y + (dy / d) * radiusPx }, wasOutside: true };
  };

  // Generate arc sample points between two circle-boundary points (shortest arc).
  const arcBetween = (p1: WallPoint, p2: WallPoint): WallPoint[] => {
    const a1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    const a2 = Math.atan2(p2.y - center.y, p2.x - center.x);
    let diff = a2 - a1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const STEP = 5 * Math.PI / 180; // 5° resolution
    const steps = Math.ceil(Math.abs(diff) / STEP);
    if (steps <= 1) return [];
    const pts: WallPoint[] = [];
    for (let i = 1; i < steps; i++) {
      const a = a1 + diff * (i / steps);
      pts.push({ x: center.x + radiusPx * Math.cos(a), y: center.y + radiusPx * Math.sin(a) });
    }
    return pts;
  };

  const clamped = polygon.map(clamp);
  const output: WallPoint[] = [];
  const n = clamped.length;

  for (let i = 0; i < n; i++) {
    const curr = clamped[i];
    const prev = clamped[(i + n - 1) % n];
    // When two consecutive boundary-projected points are adjacent, fill the
    // gap with arc samples so the circle edge looks smooth.
    if (curr.wasOutside && prev.wasOutside) {
      output.push(...arcBetween(prev.point, curr.point));
    }
    output.push(curr.point);
  }

  return output.length >= 3 ? output : [];
}

/**
 * Compute a radius-limited visibility polygon.
 * Returns [] when radiusPx <= 0 (token has no vision).
 */
export function computeRadiusLimitedVisibilityPolygon(
  observer: WallPoint,
  segments: Segment[],
  mapWidth: number,
  mapHeight: number,
  radiusPx: number
): WallPoint[] {
  if (radiusPx <= 0) return [];
  const polygon = computeVisibilityPolygon(observer, segments, mapWidth, mapHeight);
  return clipPolygonToCircle(polygon, observer, radiusPx);
}
