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

  // For each endpoint, compute angle from observer and create 3 rays
  const EPSILON = 0.0001;
  const angles: number[] = [];

  for (const ep of endpoints) {
    const angle = Math.atan2(ep.y - observer.y, ep.x - observer.x);
    angles.push(angle - EPSILON, angle, angle + EPSILON);
  }

  // Cast each ray and find nearest intersection
  const intersections: { angle: number; point: WallPoint }[] = [];

  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let closestT = Infinity;
    let closestPoint: WallPoint | null = null;

    for (const seg of allSegments) {
      const hit = raySegmentIntersection(observer, dx, dy, seg);
      if (hit !== null && hit.t < closestT) {
        closestT = hit.t;
        closestPoint = hit.point;
      }
    }

    if (closestPoint) {
      intersections.push({ angle, point: closestPoint });
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

/**
 * Ray-segment intersection test.
 * Ray: observer + t * (dx, dy), t > 0
 * Segment: a + u * (b - a), 0 <= u <= 1
 */
function raySegmentIntersection(
  observer: WallPoint,
  dx: number,
  dy: number,
  seg: Segment
): { t: number; point: WallPoint } | null {
  const sx = seg.b.x - seg.a.x;
  const sy = seg.b.y - seg.a.y;

  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-10) {
    return null; // Parallel
  }

  const ox = seg.a.x - observer.x;
  const oy = seg.a.y - observer.y;

  const t = (ox * sy - oy * sx) / denom;
  const u = (ox * dy - oy * dx) / denom;

  if (t > 0 && u >= 0 && u <= 1) {
    return {
      t,
      point: {
        x: observer.x + t * dx,
        y: observer.y + t * dy,
      },
    };
  }

  return null;
}
