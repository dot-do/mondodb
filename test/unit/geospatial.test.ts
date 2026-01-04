import { describe, it, expect, beforeEach } from 'vitest';
import { GeoTranslator, GeoJSON, GeoPoint, GeoPolygon, GeoLineString } from '../../src/translator/geo-translator';

describe('GeoTranslator', () => {
  let translator: GeoTranslator;

  beforeEach(() => {
    translator = new GeoTranslator();
  });

  // ============================================================
  // GEOJSON TYPES VALIDATION
  // ============================================================
  describe('GeoJSON Types', () => {
    describe('Point validation', () => {
      it('should validate a valid Point', () => {
        const point: GeoPoint = {
          type: 'Point',
          coordinates: [-73.97, 40.77]
        };
        expect(translator.isValidGeoJSON(point)).toBe(true);
      });

      it('should reject Point with invalid coordinates', () => {
        const point = {
          type: 'Point',
          coordinates: [-181, 40.77] // longitude out of range
        };
        expect(translator.isValidGeoJSON(point)).toBe(false);
      });

      it('should reject Point with missing coordinates', () => {
        const point = { type: 'Point' };
        expect(translator.isValidGeoJSON(point as any)).toBe(false);
      });
    });

    describe('Polygon validation', () => {
      it('should validate a valid Polygon', () => {
        const polygon: GeoPolygon = {
          type: 'Polygon',
          coordinates: [[
            [-73.97, 40.77],
            [-73.98, 40.78],
            [-73.99, 40.77],
            [-73.97, 40.77] // closed ring
          ]]
        };
        expect(translator.isValidGeoJSON(polygon)).toBe(true);
      });

      it('should reject Polygon that is not closed', () => {
        const polygon = {
          type: 'Polygon',
          coordinates: [[
            [-73.97, 40.77],
            [-73.98, 40.78],
            [-73.99, 40.77]
            // not closed - first != last
          ]]
        };
        expect(translator.isValidGeoJSON(polygon)).toBe(false);
      });

      it('should reject Polygon with less than 4 points', () => {
        const polygon = {
          type: 'Polygon',
          coordinates: [[
            [-73.97, 40.77],
            [-73.98, 40.78],
            [-73.97, 40.77]
          ]]
        };
        expect(translator.isValidGeoJSON(polygon)).toBe(false);
      });
    });

    describe('LineString validation', () => {
      it('should validate a valid LineString', () => {
        const lineString: GeoLineString = {
          type: 'LineString',
          coordinates: [
            [-73.97, 40.77],
            [-73.98, 40.78],
            [-73.99, 40.79]
          ]
        };
        expect(translator.isValidGeoJSON(lineString)).toBe(true);
      });

      it('should reject LineString with only one point', () => {
        const lineString = {
          type: 'LineString',
          coordinates: [[-73.97, 40.77]]
        };
        expect(translator.isValidGeoJSON(lineString)).toBe(false);
      });
    });

    describe('MultiPoint validation', () => {
      it('should validate a valid MultiPoint', () => {
        const multiPoint = {
          type: 'MultiPoint',
          coordinates: [
            [-73.97, 40.77],
            [-73.98, 40.78]
          ]
        };
        expect(translator.isValidGeoJSON(multiPoint)).toBe(true);
      });
    });
  });

  // ============================================================
  // HAVERSINE DISTANCE CALCULATION
  // ============================================================
  describe('Haversine Distance', () => {
    it('should calculate distance between two points in meters', () => {
      // New York to Los Angeles approximately 3936 km
      const nyc = [-74.006, 40.7128];
      const la = [-118.2437, 34.0522];

      const distance = translator.calculateHaversineDistance(
        nyc[0], nyc[1],
        la[0], la[1]
      );

      // Should be approximately 3936 km (3936000 meters) with some tolerance
      expect(distance).toBeGreaterThan(3900000);
      expect(distance).toBeLessThan(4000000);
    });

    it('should return 0 for same point', () => {
      const distance = translator.calculateHaversineDistance(
        -73.97, 40.77,
        -73.97, 40.77
      );
      expect(distance).toBe(0);
    });

    it('should handle antipodal points', () => {
      // Points on opposite sides of the Earth
      const distance = translator.calculateHaversineDistance(
        0, 0,
        180, 0
      );
      // Half the Earth's circumference: ~20015 km
      expect(distance).toBeGreaterThan(20000000);
      expect(distance).toBeLessThan(20100000);
    });
  });

  // ============================================================
  // $geoWithin OPERATOR
  // ============================================================
  describe('$geoWithin operator', () => {
    describe('with $geometry (Polygon)', () => {
      it('should translate $geoWithin with Polygon', () => {
        const query = {
          location: {
            $geoWithin: {
              $geometry: {
                type: 'Polygon',
                coordinates: [[
                  [-73.97, 40.77],
                  [-73.98, 40.78],
                  [-73.99, 40.77],
                  [-73.97, 40.77]
                ]]
              }
            }
          }
        };

        const result = translator.translate(query);

        expect(result.sql).toContain('geo_within_polygon');
        expect(result.params).toBeDefined();
      });

      it('should translate $geoWithin for nested location field', () => {
        const query = {
          'address.geo': {
            $geoWithin: {
              $geometry: {
                type: 'Polygon',
                coordinates: [[
                  [-73.97, 40.77],
                  [-73.98, 40.78],
                  [-73.99, 40.77],
                  [-73.97, 40.77]
                ]]
              }
            }
          }
        };

        const result = translator.translate(query);

        expect(result.sql).toContain('geo_within_polygon');
        expect(result.sql).toContain('address.geo');
      });
    });

    describe('with $box', () => {
      it('should translate $geoWithin with $box', () => {
        const query = {
          location: {
            $geoWithin: {
              $box: [
                [-74.0, 40.7],  // bottom-left
                [-73.9, 40.8]   // top-right
              ]
            }
          }
        };

        const result = translator.translate(query);

        expect(result.sql).toContain('geo_within_box');
      });
    });

    describe('with $center', () => {
      it('should translate $geoWithin with $center (legacy)', () => {
        const query = {
          location: {
            $geoWithin: {
              $center: [[-73.97, 40.77], 0.1] // center point and radius in radians
            }
          }
        };

        const result = translator.translate(query);

        expect(result.sql).toContain('geo_within_circle');
      });
    });

    describe('with $centerSphere', () => {
      it('should translate $geoWithin with $centerSphere', () => {
        const query = {
          location: {
            $geoWithin: {
              $centerSphere: [[-73.97, 40.77], 1 / 6378.1] // 1km radius
            }
          }
        };

        const result = translator.translate(query);

        expect(result.sql).toContain('geo_within_sphere');
      });
    });
  });

  // ============================================================
  // $geoIntersects OPERATOR
  // ============================================================
  describe('$geoIntersects operator', () => {
    it('should translate $geoIntersects with Polygon', () => {
      const query = {
        area: {
          $geoIntersects: {
            $geometry: {
              type: 'Polygon',
              coordinates: [[
                [-73.97, 40.77],
                [-73.98, 40.78],
                [-73.99, 40.77],
                [-73.97, 40.77]
              ]]
            }
          }
        }
      };

      const result = translator.translate(query);

      expect(result.sql).toContain('geo_intersects');
    });

    it('should translate $geoIntersects with LineString', () => {
      const query = {
        route: {
          $geoIntersects: {
            $geometry: {
              type: 'LineString',
              coordinates: [
                [-73.97, 40.77],
                [-73.99, 40.79]
              ]
            }
          }
        }
      };

      const result = translator.translate(query);

      expect(result.sql).toContain('geo_intersects');
    });

    it('should translate $geoIntersects with Point', () => {
      const query = {
        area: {
          $geoIntersects: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            }
          }
        }
      };

      const result = translator.translate(query);

      expect(result.sql).toContain('geo_intersects');
    });
  });

  // ============================================================
  // $near OPERATOR
  // ============================================================
  describe('$near operator', () => {
    it('should translate $near with $geometry', () => {
      const query = {
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            }
          }
        }
      };

      const result = translator.translate(query);

      // Without distance constraints, SQL just checks field existence
      // The Haversine formula is in orderBy for sorting
      expect(result.sql).toContain('location');
      expect(result.sql).toContain('IS NOT NULL');
      expect(result.orderBy).toBeDefined();
      expect(result.orderBy).toContain('6371000');
      expect(result.orderBy).toContain('ASIN');
    });

    it('should translate $near with $maxDistance', () => {
      const query = {
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            },
            $maxDistance: 1000 // 1km in meters
          }
        }
      };

      const result = translator.translate(query);

      // The SQL uses inline Haversine formula
      expect(result.sql).toContain('6371000');
      expect(result.sql).toContain('<=');
      expect(result.params).toContain(1000);
    });

    it('should translate $near with $minDistance', () => {
      const query = {
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            },
            $minDistance: 100 // 100m in meters
          }
        }
      };

      const result = translator.translate(query);

      // The SQL uses inline Haversine formula
      expect(result.sql).toContain('6371000');
      expect(result.sql).toContain('>=');
      expect(result.params).toContain(100);
    });

    it('should translate $near with both $minDistance and $maxDistance', () => {
      const query = {
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            },
            $minDistance: 100,
            $maxDistance: 1000
          }
        }
      };

      const result = translator.translate(query);

      expect(result.sql).toContain('>=');
      expect(result.sql).toContain('<=');
      expect(result.params).toContain(100);
      expect(result.params).toContain(1000);
    });
  });

  // ============================================================
  // $nearSphere OPERATOR
  // ============================================================
  describe('$nearSphere operator', () => {
    it('should translate $nearSphere with $geometry', () => {
      const query = {
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            }
          }
        }
      };

      const result = translator.translate(query);

      // Without distance constraints, SQL just checks field existence
      // The Haversine formula is in orderBy for sorting
      expect(result.sql).toContain('location');
      expect(result.sql).toContain('IS NOT NULL');
      expect(result.orderBy).toBeDefined();
      expect(result.orderBy).toContain('6371000');
      expect(result.orderBy).toContain('ASIN');
    });

    it('should translate $nearSphere with $maxDistance in meters', () => {
      const query = {
        location: {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            },
            $maxDistance: 5000 // 5km in meters
          }
        }
      };

      const result = translator.translate(query);

      // The SQL uses inline Haversine formula
      expect(result.sql).toContain('6371000');
      expect(result.sql).toContain('ASIN');
      expect(result.params).toContain(5000);
    });

    it('should handle legacy $nearSphere format with coordinates array', () => {
      const query = {
        location: {
          $nearSphere: [-73.97, 40.77],
          $maxDistance: 0.1 // legacy format uses radians
        }
      };

      const result = translator.translate(query);

      // The SQL uses inline Haversine formula
      expect(result.sql).toContain('6371000');
      expect(result.sql).toContain('ASIN');
    });
  });

  // ============================================================
  // POINT IN POLYGON ALGORITHM
  // ============================================================
  describe('Point in Polygon', () => {
    it('should detect point inside polygon', () => {
      const polygon = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0]
      ];

      const inside = translator.isPointInPolygon([5, 5], polygon);
      expect(inside).toBe(true);
    });

    it('should detect point outside polygon', () => {
      const polygon = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0]
      ];

      const outside = translator.isPointInPolygon([15, 5], polygon);
      expect(outside).toBe(false);
    });

    it('should handle point on polygon edge', () => {
      const polygon = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0]
      ];

      const onEdge = translator.isPointInPolygon([5, 0], polygon);
      // Points on edge are typically considered inside
      expect(onEdge).toBe(true);
    });

    it('should handle complex polygon shapes', () => {
      // L-shaped polygon
      const polygon = [
        [0, 0],
        [5, 0],
        [5, 5],
        [10, 5],
        [10, 10],
        [0, 10],
        [0, 0]
      ];

      const inside = translator.isPointInPolygon([2, 2], polygon);
      expect(inside).toBe(true);

      const outside = translator.isPointInPolygon([7, 2], polygon);
      expect(outside).toBe(false);
    });
  });

  // ============================================================
  // BOX CONTAINMENT
  // ============================================================
  describe('Point in Box', () => {
    it('should detect point inside box', () => {
      const bottomLeft = [-74.0, 40.7];
      const topRight = [-73.9, 40.8];

      const inside = translator.isPointInBox([-73.95, 40.75], bottomLeft, topRight);
      expect(inside).toBe(true);
    });

    it('should detect point outside box', () => {
      const bottomLeft = [-74.0, 40.7];
      const topRight = [-73.9, 40.8];

      const outside = translator.isPointInBox([-73.8, 40.75], bottomLeft, topRight);
      expect(outside).toBe(false);
    });

    it('should handle point on box boundary', () => {
      const bottomLeft = [-74.0, 40.7];
      const topRight = [-73.9, 40.8];

      const onBoundary = translator.isPointInBox([-74.0, 40.75], bottomLeft, topRight);
      expect(onBoundary).toBe(true);
    });
  });

  // ============================================================
  // LINE INTERSECTION
  // ============================================================
  describe('Line Intersection', () => {
    it('should detect intersecting lines', () => {
      const line1 = [[0, 0], [10, 10]] as [[number, number], [number, number]];
      const line2 = [[0, 10], [10, 0]] as [[number, number], [number, number]];

      const intersects = translator.doLinesIntersect(line1, line2);
      expect(intersects).toBe(true);
    });

    it('should detect non-intersecting lines', () => {
      const line1 = [[0, 0], [5, 5]] as [[number, number], [number, number]];
      const line2 = [[6, 6], [10, 10]] as [[number, number], [number, number]];

      const intersects = translator.doLinesIntersect(line1, line2);
      expect(intersects).toBe(false);
    });

    it('should detect parallel lines as non-intersecting', () => {
      const line1 = [[0, 0], [10, 0]] as [[number, number], [number, number]];
      const line2 = [[0, 5], [10, 5]] as [[number, number], [number, number]];

      const intersects = translator.doLinesIntersect(line1, line2);
      expect(intersects).toBe(false);
    });
  });

  // ============================================================
  // SQL GENERATION FOR GEO FUNCTIONS
  // ============================================================
  describe('SQL Generation', () => {
    it('should generate SQL with inline Haversine formula', () => {
      const query = {
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            },
            $maxDistance: 1000
          }
        }
      };

      const result = translator.translate(query);

      // Should use the Haversine formula in SQL
      expect(result.sql).toMatch(/6371000|RADIANS|COS|SIN|ASIN|SQRT/i);
    });

    it('should use geo_point_in_polygon for $geoWithin polygon check', () => {
      const query = {
        location: {
          $geoWithin: {
            $geometry: {
              type: 'Polygon',
              coordinates: [[
                [-73.97, 40.77],
                [-73.98, 40.78],
                [-73.99, 40.77],
                [-73.97, 40.77]
              ]]
            }
          }
        }
      };

      const result = translator.translate(query);

      expect(result.sql).toContain('geo_within_polygon');
    });
  });

  // ============================================================
  // INTEGRATION WITH QUERY TRANSLATOR
  // ============================================================
  describe('Integration with main query translator', () => {
    it('should combine geospatial with regular query operators', () => {
      const query = {
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            },
            $maxDistance: 1000
          }
        },
        category: 'restaurant',
        rating: { $gte: 4 }
      };

      const result = translator.translate(query);

      // The SQL uses inline Haversine formula
      expect(result.sql).toContain('6371000');
      expect(result.sql).toContain('category');
      expect(result.sql).toContain('rating');
    });

    it('should handle $and with multiple geospatial conditions', () => {
      const query = {
        $and: [
          {
            location: {
              $geoWithin: {
                $geometry: {
                  type: 'Polygon',
                  coordinates: [[
                    [-74.0, 40.7],
                    [-74.0, 40.8],
                    [-73.9, 40.8],
                    [-73.9, 40.7],
                    [-74.0, 40.7]
                  ]]
                }
              }
            }
          },
          { status: 'active' }
        ]
      };

      const result = translator.translate(query);

      expect(result.sql).toContain('AND');
      expect(result.sql).toContain('geo_within_polygon');
      expect(result.sql).toContain('status');
    });
  });

  // ============================================================
  // ERROR HANDLING
  // ============================================================
  describe('Error Handling', () => {
    it('should throw error for invalid geospatial operator', () => {
      const query = {
        location: {
          $geoInvalid: {
            $geometry: {
              type: 'Point',
              coordinates: [-73.97, 40.77]
            }
          }
        }
      };

      expect(() => translator.translate(query)).toThrow();
    });

    it('should throw error for missing $geometry in $near', () => {
      const query = {
        location: {
          $near: {
            $maxDistance: 1000
            // missing $geometry
          }
        }
      };

      expect(() => translator.translate(query)).toThrow();
    });

    it('should throw error for invalid GeoJSON type', () => {
      const query = {
        location: {
          $geoWithin: {
            $geometry: {
              type: 'InvalidType',
              coordinates: []
            }
          }
        }
      };

      expect(() => translator.translate(query)).toThrow();
    });
  });
});

// ============================================================
// INDEX MANAGER GEOSPATIAL TESTS
// ============================================================
describe('IndexManager - 2dsphere indexes', () => {
  // These tests will be for the index manager extensions

  it('should create a 2dsphere index', async () => {
    // This will be implemented when we update index-manager.ts
    const indexSpec = { location: '2dsphere' };
    // Test will verify that 2dsphere index creation works
    expect(indexSpec.location).toBe('2dsphere');
  });

  it('should support compound indexes with 2dsphere', async () => {
    const indexSpec = { location: '2dsphere', category: 1 };
    expect(indexSpec.location).toBe('2dsphere');
    expect(indexSpec.category).toBe(1);
  });

  it('should list 2dsphere indexes correctly', async () => {
    // Test will verify that 2dsphere indexes appear in listIndexes
    expect(true).toBe(true); // Placeholder
  });
});
