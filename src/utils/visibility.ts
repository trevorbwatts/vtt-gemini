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
