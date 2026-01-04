/**
 * GeoTranslator - Translates MongoDB geospatial queries to SQLite SQL
 *
 * Supports:
 * - $geoWithin: Find documents within a specified shape
 * - $geoIntersects: Find documents that intersect with a GeoJSON shape
 * - $near: Find documents near a point (sorted by distance)
 * - $nearSphere: Find documents near a point on a sphere (sorted by distance)
 *
 * GeoJSON Types:
 * - Point
 * - Polygon
 * - LineString
 * - MultiPoint
 *
 * Uses Haversine formula for spherical distance calculations
 */

// Earth's radius in meters
const EARTH_RADIUS_METERS = 6371000;

// ============================================================
// GeoJSON Types
// ============================================================

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: [number, number][][]; // Array of rings, first is exterior
}

export interface GeoLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface GeoMultiPoint {
  type: 'MultiPoint';
  coordinates: [number, number][];
}

export type GeoJSON = GeoPoint | GeoPolygon | GeoLineString | GeoMultiPoint;

export interface TranslatedGeoQuery {
  sql: string;
  params: unknown[];
  orderBy?: string;
}

type GeoOperatorHandler = (
  path: string,
  value: unknown,
  params: unknown[]
) => TranslatedGeoQuery;

// ============================================================
// GeoTranslator Class
// ============================================================

export class GeoTranslator {
  private geoOperators: Record<string, GeoOperatorHandler>;

  constructor() {
    this.geoOperators = {
      $geoWithin: this.translateGeoWithin.bind(this),
      $geoIntersects: this.translateGeoIntersects.bind(this),
      $near: this.translateNear.bind(this),
      $nearSphere: this.translateNearSphere.bind(this),
    };
  }

  // ============================================================
  // GeoJSON Validation
  // ============================================================

  /**
   * Validates a GeoJSON object
   */
  isValidGeoJSON(geo: unknown): boolean {
    if (!geo || typeof geo !== 'object') {
      return false;
    }

    const geoObj = geo as Record<string, unknown>;
    const type = geoObj.type;
    const coordinates = geoObj.coordinates;

    if (!type || !coordinates || !Array.isArray(coordinates)) {
      return false;
    }

    switch (type) {
      case 'Point':
        return this.isValidPoint(coordinates);
      case 'Polygon':
        return this.isValidPolygon(coordinates as [number, number][][]);
      case 'LineString':
        return this.isValidLineString(coordinates as [number, number][]);
      case 'MultiPoint':
        return this.isValidMultiPoint(coordinates as [number, number][]);
      default:
        return false;
    }
  }

  private isValidPoint(coordinates: unknown[]): boolean {
    if (coordinates.length !== 2) {
      return false;
    }

    const [lng, lat] = coordinates as [number, number];
    if (typeof lng !== 'number' || typeof lat !== 'number') {
      return false;
    }

    // Longitude: -180 to 180, Latitude: -90 to 90
    return lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  }

  private isValidPolygon(rings: [number, number][][]): boolean {
    if (!Array.isArray(rings) || rings.length === 0) {
      return false;
    }

    for (const ring of rings) {
      // A ring must have at least 4 points (including closing point)
      if (!Array.isArray(ring) || ring.length < 4) {
        return false;
      }

      // The ring must be closed (first point === last point)
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return false;
      }

      // Validate each point
      for (const point of ring) {
        if (!this.isValidPoint(point)) {
          return false;
        }
      }
    }

    return true;
  }

  private isValidLineString(coordinates: [number, number][]): boolean {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return false;
    }

    for (const point of coordinates) {
      if (!this.isValidPoint(point)) {
        return false;
      }
    }

    return true;
  }

  private isValidMultiPoint(coordinates: [number, number][]): boolean {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return false;
    }

    for (const point of coordinates) {
      if (!this.isValidPoint(point)) {
        return false;
      }
    }

    return true;
  }

  // ============================================================
  // Distance Calculations
  // ============================================================

  /**
   * Calculate Haversine distance between two points in meters
   */
  calculateHaversineDistance(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number
  ): number {
    const toRadians = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.asin(Math.sqrt(a));

    return EARTH_RADIUS_METERS * c;
  }

  /**
   * Generate SQL for Haversine distance calculation
   */
  private generateHaversineSQL(
    fieldPath: string,
    targetLng: number,
    targetLat: number
  ): string {
    // Extract coordinates from the GeoJSON location field
    const lngExpr = `json_extract(data, '${fieldPath}.coordinates[0]')`;
    const latExpr = `json_extract(data, '${fieldPath}.coordinates[1]')`;

    // Haversine formula in SQL
    // distance = 2 * R * asin(sqrt(
    //   sin((lat2-lat1)/2)^2 +
    //   cos(lat1) * cos(lat2) * sin((lon2-lon1)/2)^2
    // ))
    return `(
      ${EARTH_RADIUS_METERS} * 2 * ASIN(SQRT(
        POWER(SIN((RADIANS(${latExpr}) - RADIANS(${targetLat})) / 2), 2) +
        COS(RADIANS(${targetLat})) * COS(RADIANS(${latExpr})) *
        POWER(SIN((RADIANS(${lngExpr}) - RADIANS(${targetLng})) / 2), 2)
      ))
    )`;
  }

  // ============================================================
  // Geometry Algorithms
  // ============================================================

  /**
   * Ray casting algorithm to determine if a point is inside a polygon
   */
  isPointInPolygon(
    point: [number, number],
    polygon: [number, number][]
  ): boolean {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0],
        yi = polygon[i][1];
      const xj = polygon[j][0],
        yj = polygon[j][1];

      // Check if point is on an edge
      if (
        yi === yj &&
        yi === y &&
        x >= Math.min(xi, xj) &&
        x <= Math.max(xi, xj)
      ) {
        return true; // Point is on horizontal edge
      }

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }

  /**
   * Check if a point is within a bounding box
   */
  isPointInBox(
    point: [number, number],
    bottomLeft: [number, number],
    topRight: [number, number]
  ): boolean {
    const [x, y] = point;
    const [minX, minY] = bottomLeft;
    const [maxX, maxY] = topRight;

    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }

  /**
   * Check if two line segments intersect
   */
  doLinesIntersect(
    line1: [[number, number], [number, number]],
    line2: [[number, number], [number, number]]
  ): boolean {
    const [[x1, y1], [x2, y2]] = line1;
    const [[x3, y3], [x4, y4]] = line2;

    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

    if (denom === 0) {
      return false; // Lines are parallel
    }

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }

  // ============================================================
  // Main Translation Entry Point
  // ============================================================

  /**
   * Translate a MongoDB geospatial query to SQL
   */
  translate(query: Record<string, unknown>): TranslatedGeoQuery {
    const params: unknown[] = [];
    const conditions: string[] = [];
    let orderBy: string | undefined;

    for (const [field, value] of Object.entries(query)) {
      if (field.startsWith('$')) {
        // Logical operator
        const result = this.translateLogicalOperator(field, value, params);
        conditions.push(result.sql);
        if (result.orderBy) {
          orderBy = result.orderBy;
        }
      } else {
        // Field condition
        const result = this.translateFieldCondition(field, value, params);
        conditions.push(result.sql);
        if (result.orderBy) {
          orderBy = result.orderBy;
        }
      }
    }

    const sql =
      conditions.length === 1
        ? conditions[0]
        : `(${conditions.join(' AND ')})`;

    return { sql, params, orderBy };
  }

  private translateLogicalOperator(
    op: string,
    value: unknown,
    params: unknown[]
  ): TranslatedGeoQuery {
    switch (op) {
      case '$and': {
        const conditions = value as Record<string, unknown>[];
        const parts = conditions.map((c) => this.translate(c));
        return {
          sql:
            parts.length === 1
              ? parts[0].sql
              : `(${parts.map((p) => p.sql).join(' AND ')})`,
          params: params.concat(...parts.map((p) => p.params)),
          orderBy: parts.find((p) => p.orderBy)?.orderBy,
        };
      }
      case '$or': {
        const conditions = value as Record<string, unknown>[];
        const parts = conditions.map((c) => this.translate(c));
        return {
          sql:
            parts.length === 1
              ? parts[0].sql
              : `(${parts.map((p) => p.sql).join(' OR ')})`,
          params: params.concat(...parts.map((p) => p.params)),
          orderBy: parts.find((p) => p.orderBy)?.orderBy,
        };
      }
      default:
        throw new Error(`Unknown logical operator: ${op}`);
    }
  }

  private translateFieldCondition(
    field: string,
    value: unknown,
    params: unknown[]
  ): TranslatedGeoQuery {
    const path = this.fieldToJsonPath(field);

    // Check if this is a geospatial operator
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const operators = value as Record<string, unknown>;
      const opKeys = Object.keys(operators);

      // Handle legacy $nearSphere format where coordinates are directly on the value
      // Check this BEFORE the normal geo operator loop since the array format
      // would otherwise be passed to translateNearSphere which expects $geometry
      if ('$nearSphere' in operators && Array.isArray(operators.$nearSphere)) {
        return this.translateNearSphereLegacy(
          path,
          operators.$nearSphere as [number, number],
          operators.$maxDistance as number | undefined,
          operators.$minDistance as number | undefined,
          params
        );
      }

      // Handle legacy $near format where coordinates are directly on the value
      if ('$near' in operators && Array.isArray(operators.$near)) {
        return this.translateNearLegacy(
          path,
          operators.$near as [number, number],
          operators.$maxDistance as number | undefined,
          operators.$minDistance as number | undefined,
          params
        );
      }

      for (const op of opKeys) {
        if (this.geoOperators[op]) {
          return this.geoOperators[op](path, operators[op], params);
        }
      }

      // Not a geospatial query, translate as regular field condition
      return this.translateRegularFieldCondition(path, operators, params);
    }

    // Direct value comparison
    params.push(value);
    return {
      sql: `json_extract(data, '${path}') = ?`,
      params,
    };
  }

  private translateRegularFieldCondition(
    path: string,
    operators: Record<string, unknown>,
    params: unknown[]
  ): TranslatedGeoQuery {
    const conditions: string[] = [];

    for (const [op, value] of Object.entries(operators)) {
      switch (op) {
        case '$eq':
          if (value === null) {
            conditions.push(`json_extract(data, '${path}') IS NULL`);
          } else {
            params.push(value);
            conditions.push(`json_extract(data, '${path}') = ?`);
          }
          break;
        case '$ne':
          if (value === null) {
            conditions.push(`json_extract(data, '${path}') IS NOT NULL`);
          } else {
            params.push(value);
            conditions.push(`json_extract(data, '${path}') != ?`);
          }
          break;
        case '$gt':
          params.push(value);
          conditions.push(`json_extract(data, '${path}') > ?`);
          break;
        case '$gte':
          params.push(value);
          conditions.push(`json_extract(data, '${path}') >= ?`);
          break;
        case '$lt':
          params.push(value);
          conditions.push(`json_extract(data, '${path}') < ?`);
          break;
        case '$lte':
          params.push(value);
          conditions.push(`json_extract(data, '${path}') <= ?`);
          break;
        case '$in': {
          const arr = value as unknown[];
          if (arr.length === 0) {
            conditions.push('0 = 1');
          } else {
            params.push(...arr);
            conditions.push(
              `json_extract(data, '${path}') IN (${arr.map(() => '?').join(', ')})`
            );
          }
          break;
        }
        case '$exists':
          conditions.push(
            value
              ? `json_extract(data, '${path}') IS NOT NULL`
              : `json_extract(data, '${path}') IS NULL`
          );
          break;
        default:
          throw new Error(`Unknown operator: ${op}`);
      }
    }

    return {
      sql: conditions.length === 1 ? conditions[0] : `(${conditions.join(' AND ')})`,
      params,
    };
  }

  // ============================================================
  // $geoWithin Translation
  // ============================================================

  private translateGeoWithin(
    path: string,
    value: unknown,
    params: unknown[]
  ): TranslatedGeoQuery {
    const spec = value as Record<string, unknown>;

    if ('$geometry' in spec) {
      const geometry = spec.$geometry as GeoJSON;

      if (!this.isValidGeoJSON(geometry)) {
        throw new Error('Invalid GeoJSON geometry');
      }

      switch (geometry.type) {
        case 'Polygon':
          return this.translateGeoWithinPolygon(path, geometry, params);
        default:
          throw new Error(`Unsupported geometry type for $geoWithin: ${geometry.type}`);
      }
    }

    if ('$box' in spec) {
      const box = spec.$box as [[number, number], [number, number]];
      return this.translateGeoWithinBox(path, box, params);
    }

    if ('$center' in spec) {
      const center = spec.$center as [[number, number], number];
      return this.translateGeoWithinCircle(path, center, params);
    }

    if ('$centerSphere' in spec) {
      const centerSphere = spec.$centerSphere as [[number, number], number];
      return this.translateGeoWithinSphere(path, centerSphere, params);
    }

    throw new Error('$geoWithin requires $geometry, $box, $center, or $centerSphere');
  }

  private translateGeoWithinPolygon(
    path: string,
    polygon: GeoPolygon,
    params: unknown[]
  ): TranslatedGeoQuery {
    // Serialize polygon coordinates for the SQL function
    const polygonJson = JSON.stringify(polygon.coordinates[0]);
    params.push(polygonJson);

    const lngExpr = `json_extract(data, '${path}.coordinates[0]')`;
    const latExpr = `json_extract(data, '${path}.coordinates[1]')`;

    // Use a custom geo_within_polygon check
    // This will be evaluated in JavaScript/application code or via a custom SQLite function
    const sql = `geo_within_polygon(${lngExpr}, ${latExpr}, ?)`;

    return { sql, params };
  }

  private translateGeoWithinBox(
    path: string,
    box: [[number, number], [number, number]],
    params: unknown[]
  ): TranslatedGeoQuery {
    const [[minLng, minLat], [maxLng, maxLat]] = box;

    const lngExpr = `json_extract(data, '${path}.coordinates[0]')`;
    const latExpr = `json_extract(data, '${path}.coordinates[1]')`;

    params.push(minLng, maxLng, minLat, maxLat);

    const sql = `geo_within_box(${lngExpr}, ${latExpr}, ?, ?, ?, ?)`;

    return { sql, params };
  }

  private translateGeoWithinCircle(
    path: string,
    center: [[number, number], number],
    params: unknown[]
  ): TranslatedGeoQuery {
    const [[lng, lat], radius] = center;

    const lngExpr = `json_extract(data, '${path}.coordinates[0]')`;
    const latExpr = `json_extract(data, '${path}.coordinates[1]')`;

    params.push(lng, lat, radius);

    const sql = `geo_within_circle(${lngExpr}, ${latExpr}, ?, ?, ?)`;

    return { sql, params };
  }

  private translateGeoWithinSphere(
    path: string,
    centerSphere: [[number, number], number],
    params: unknown[]
  ): TranslatedGeoQuery {
    const [[lng, lat], radiusRadians] = centerSphere;
    // Convert radians to meters
    const radiusMeters = radiusRadians * EARTH_RADIUS_METERS;

    const distanceSQL = this.generateHaversineSQL(path, lng, lat);

    params.push(radiusMeters);

    const sql = `geo_within_sphere(${distanceSQL}, ?)`;

    return { sql, params };
  }

  // ============================================================
  // $geoIntersects Translation
  // ============================================================

  private translateGeoIntersects(
    path: string,
    value: unknown,
    params: unknown[]
  ): TranslatedGeoQuery {
    const spec = value as Record<string, unknown>;

    if (!('$geometry' in spec)) {
      throw new Error('$geoIntersects requires $geometry');
    }

    const geometry = spec.$geometry as GeoJSON;

    if (!this.isValidGeoJSON(geometry)) {
      throw new Error('Invalid GeoJSON geometry');
    }

    const geometryJson = JSON.stringify(geometry);
    params.push(geometryJson);

    const docGeometryExpr = `json_extract(data, '${path}')`;

    const sql = `geo_intersects(${docGeometryExpr}, ?)`;

    return { sql, params };
  }

  // ============================================================
  // $near Translation
  // ============================================================

  private translateNear(
    path: string,
    value: unknown,
    params: unknown[]
  ): TranslatedGeoQuery {
    const spec = value as Record<string, unknown>;

    if (!('$geometry' in spec)) {
      throw new Error('$near requires $geometry');
    }

    const geometry = spec.$geometry as GeoPoint;

    if (!this.isValidGeoJSON(geometry) || geometry.type !== 'Point') {
      throw new Error('$near $geometry must be a valid Point');
    }

    const [lng, lat] = geometry.coordinates;
    const maxDistance = spec.$maxDistance as number | undefined;
    const minDistance = spec.$minDistance as number | undefined;

    const distanceSQL = this.generateHaversineSQL(path, lng, lat);
    const distanceAlias = `geo_distance(${distanceSQL})`;

    const conditions: string[] = [];

    if (minDistance !== undefined) {
      params.push(minDistance);
      conditions.push(`${distanceSQL} >= ?`);
    }

    if (maxDistance !== undefined) {
      params.push(maxDistance);
      conditions.push(`${distanceSQL} <= ?`);
    }

    // Always include a condition to ensure the location exists
    conditions.push(`json_extract(data, '${path}') IS NOT NULL`);

    const sql = conditions.length === 1 ? conditions[0] : `(${conditions.join(' AND ')})`;

    return {
      sql,
      params,
      orderBy: `${distanceSQL} ASC`,
    };
  }

  // ============================================================
  // $nearSphere Translation
  // ============================================================

  private translateNearSphere(
    path: string,
    value: unknown,
    params: unknown[]
  ): TranslatedGeoQuery {
    const spec = value as Record<string, unknown>;

    if (!('$geometry' in spec)) {
      throw new Error('$nearSphere requires $geometry');
    }

    const geometry = spec.$geometry as GeoPoint;

    if (!this.isValidGeoJSON(geometry) || geometry.type !== 'Point') {
      throw new Error('$nearSphere $geometry must be a valid Point');
    }

    const [lng, lat] = geometry.coordinates;
    const maxDistance = spec.$maxDistance as number | undefined;
    const minDistance = spec.$minDistance as number | undefined;

    const distanceSQL = this.generateHaversineSQL(path, lng, lat);
    const distanceAlias = `geo_distance_sphere(${distanceSQL})`;

    const conditions: string[] = [];

    if (minDistance !== undefined) {
      params.push(minDistance);
      conditions.push(`${distanceSQL} >= ?`);
    }

    if (maxDistance !== undefined) {
      params.push(maxDistance);
      conditions.push(`${distanceSQL} <= ?`);
    }

    // Always include a condition to ensure the location exists
    conditions.push(`json_extract(data, '${path}') IS NOT NULL`);

    const sql = conditions.length === 1 ? conditions[0] : `(${conditions.join(' AND ')})`;

    return {
      sql,
      params,
      orderBy: `${distanceSQL} ASC`,
    };
  }

  private translateNearLegacy(
    path: string,
    coordinates: [number, number],
    maxDistance: number | undefined,
    minDistance: number | undefined,
    params: unknown[]
  ): TranslatedGeoQuery {
    const [lng, lat] = coordinates;

    const distanceSQL = this.generateHaversineSQL(path, lng, lat);

    const conditions: string[] = [];

    if (minDistance !== undefined) {
      // Legacy $near format uses flat distance (degrees), convert roughly to meters
      // 1 degree ~= 111km at equator
      const minDistMeters = minDistance * 111000;
      params.push(minDistMeters);
      conditions.push(`${distanceSQL} >= ?`);
    }

    if (maxDistance !== undefined) {
      // Legacy $near format uses flat distance (degrees), convert roughly to meters
      const maxDistMeters = maxDistance * 111000;
      params.push(maxDistMeters);
      conditions.push(`${distanceSQL} <= ?`);
    }

    // Always include a condition to ensure the location exists
    conditions.push(`json_extract(data, '${path}') IS NOT NULL`);

    const sql = conditions.length === 1 ? conditions[0] : `(${conditions.join(' AND ')})`;

    return {
      sql,
      params,
      orderBy: `${distanceSQL} ASC`,
    };
  }

  private translateNearSphereLegacy(
    path: string,
    coordinates: [number, number],
    maxDistance: number | undefined,
    minDistance: number | undefined,
    params: unknown[]
  ): TranslatedGeoQuery {
    const [lng, lat] = coordinates;

    const distanceSQL = this.generateHaversineSQL(path, lng, lat);

    const conditions: string[] = [];

    if (minDistance !== undefined) {
      // Legacy format uses radians, convert to meters
      const minDistMeters = minDistance * EARTH_RADIUS_METERS;
      params.push(minDistMeters);
      conditions.push(`${distanceSQL} >= ?`);
    }

    if (maxDistance !== undefined) {
      // Legacy format uses radians, convert to meters
      const maxDistMeters = maxDistance * EARTH_RADIUS_METERS;
      params.push(maxDistMeters);
      conditions.push(`${distanceSQL} <= ?`);
    }

    // Always include a condition to ensure the location exists
    conditions.push(`json_extract(data, '${path}') IS NOT NULL`);

    const sql = conditions.length === 1 ? conditions[0] : `(${conditions.join(' AND ')})`;

    return {
      sql,
      params,
      orderBy: `${distanceSQL} ASC`,
    };
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  private fieldToJsonPath(field: string): string {
    const parts = field.split('.');
    let path = '$';

    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        path += `[${part}]`;
      } else {
        path += `.${part}`;
      }
    }

    return path;
  }
}

export default GeoTranslator;
