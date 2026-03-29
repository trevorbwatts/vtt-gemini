import { WallPoint, WallSegment, Portal, GridResolution } from '../types';

interface RawUVTTPoint {
  x: number;
  y: number;
}

interface RawUVTTPortal {
  position: RawUVTTPoint;
  bounds: RawUVTTPoint[];
  rotation: number;
  closed: boolean;
  freestanding: boolean;
}

interface RawUVTTFile {
  format?: number;
  resolution: {
    map_origin: RawUVTTPoint;
    map_size: RawUVTTPoint;
    pixels_per_grid: number;
  };
  line_of_sight?: RawUVTTPoint[][];
  objects_line_of_sight?: RawUVTTPoint[][];
  portals?: RawUVTTPortal[];
  environment?: {
    baked_lighting?: boolean;
    ambient_light?: string;
  };
  lights?: unknown[];
  image: string;
}

export interface UVTTParseResult {
  mapImage: string;
  walls: WallSegment[];
  objectWalls: WallSegment[];
  portals: Portal[];
  gridResolution: GridResolution;
}

export function parseUVTTFile(jsonString: string): UVTTParseResult {
  let data: RawUVTTFile;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON — the file does not appear to be a valid UVTT/DD2VTT file.');
  }

  if (!data.resolution) {
    throw new Error('Missing "resolution" field — not a valid UVTT file.');
  }
  if (!data.image) {
    throw new Error('Missing "image" field — no map image found in the UVTT file.');
  }

  const { map_origin, map_size, pixels_per_grid } = data.resolution;

  const toPixel = (point: RawUVTTPoint): WallPoint => ({
    x: (point.x - map_origin.x) * pixels_per_grid,
    y: (point.y - map_origin.y) * pixels_per_grid,
  });

  // Parse wall polylines
  const walls: WallSegment[] = (data.line_of_sight || []).map((polyline, i) => ({
    id: `wall-${i}`,
    points: polyline.map(toPixel),
  }));

  // Parse object wall polylines
  const objectWalls: WallSegment[] = (data.objects_line_of_sight || []).map((polyline, i) => ({
    id: `objwall-${i}`,
    points: polyline.map(toPixel),
  }));

  // Parse portals (doors/windows)
  // Freestanding portals are typically windows; attached portals are doors
  const portals: Portal[] = (data.portals || []).map((portal, i) => ({
    id: `portal-${i}`,
    bounds: [
      toPixel(portal.bounds[0]),
      toPixel(portal.bounds[1]),
    ] as [WallPoint, WallPoint],
    closed: portal.closed,
    freestanding: portal.freestanding ?? false,
    portalType: (portal.freestanding ? 'window' : 'door') as 'door' | 'window',
  }));

  const gridResolution: GridResolution = {
    mapOrigin: { x: map_origin.x, y: map_origin.y },
    mapSize: { x: map_size.x, y: map_size.y },
    pixelsPerGrid: pixels_per_grid,
  };

  // The image field is raw base64 PNG without the data URL prefix
  const mapImage = `data:image/png;base64,${data.image}`;

  return { mapImage, walls, objectWalls, portals, gridResolution };
}
