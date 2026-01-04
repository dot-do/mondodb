import { describe, it, expect } from 'vitest';
import { QueryTranslator, TranslatedQuery } from '../../src/translator/query-translator';

describe('QueryTranslator', () => {
  let translator: QueryTranslator;

  beforeEach(() => {
    translator = new QueryTranslator();
  });

  // ============================================================
  // COMPARISON OPERATORS (mondodb-67o)
  // ============================================================
  describe('Comparison Operators', () => {
    describe('$eq operator', () => {
      it('should translate simple $eq to json_extract equality', () => {
        const query = { name: { $eq: 'John' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.name') = ?");
        expect(result.params).toEqual(['John']);
      });

      it('should translate implicit $eq (no operator)', () => {
        const query = { name: 'John' };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.name') = ?");
        expect(result.params).toEqual(['John']);
      });

      it('should handle $eq with number', () => {
        const query = { age: { $eq: 30 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.age') = ?");
        expect(result.params).toEqual([30]);
      });

      it('should handle $eq with null', () => {
        const query = { status: { $eq: null } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.status') IS NULL");
        expect(result.params).toEqual([]);
      });

      it('should handle $eq with boolean', () => {
        const query = { active: { $eq: true } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.active') = ?");
        // SQLite json_extract returns 1/0 for booleans, so we convert true to 1
        expect(result.params).toEqual([1]);
      });
    });

    describe('$ne operator', () => {
      it('should translate $ne to json_extract inequality', () => {
        const query = { name: { $ne: 'John' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.name') != ?");
        expect(result.params).toEqual(['John']);
      });

      it('should handle $ne with null', () => {
        const query = { status: { $ne: null } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.status') IS NOT NULL");
        expect(result.params).toEqual([]);
      });
    });

    describe('$gt operator', () => {
      it('should translate $gt to greater than', () => {
        const query = { age: { $gt: 21 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.age') > ?");
        expect(result.params).toEqual([21]);
      });
    });

    describe('$gte operator', () => {
      it('should translate $gte to greater than or equal', () => {
        const query = { age: { $gte: 21 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.age') >= ?");
        expect(result.params).toEqual([21]);
      });
    });

    describe('$lt operator', () => {
      it('should translate $lt to less than', () => {
        const query = { age: { $lt: 65 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.age') < ?");
        expect(result.params).toEqual([65]);
      });
    });

    describe('$lte operator', () => {
      it('should translate $lte to less than or equal', () => {
        const query = { age: { $lte: 65 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.age') <= ?");
        expect(result.params).toEqual([65]);
      });
    });

    describe('$in operator', () => {
      it('should translate $in to IN clause', () => {
        const query = { status: { $in: ['active', 'pending'] } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.status') IN (?, ?)");
        expect(result.params).toEqual(['active', 'pending']);
      });

      it('should handle $in with numbers', () => {
        const query = { age: { $in: [25, 30, 35] } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.age') IN (?, ?, ?)");
        expect(result.params).toEqual([25, 30, 35]);
      });

      it('should handle $in with single value', () => {
        const query = { status: { $in: ['active'] } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.status') IN (?)");
        expect(result.params).toEqual(['active']);
      });

      it('should handle empty $in array', () => {
        const query = { status: { $in: [] } };
        const result = translator.translate(query);

        // Empty IN should match nothing (return false)
        expect(result.sql).toBe('0 = 1');
        expect(result.params).toEqual([]);
      });
    });

    describe('$nin operator', () => {
      it('should translate $nin to NOT IN clause', () => {
        const query = { status: { $nin: ['deleted', 'archived'] } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.status') NOT IN (?, ?)");
        expect(result.params).toEqual(['deleted', 'archived']);
      });

      it('should handle empty $nin array', () => {
        const query = { status: { $nin: [] } };
        const result = translator.translate(query);

        // Empty NOT IN should match everything (return true)
        expect(result.sql).toBe('1 = 1');
        expect(result.params).toEqual([]);
      });
    });

    describe('$regex operator', () => {
      it('should translate simple $regex pattern (contains)', () => {
        const query = { name: { $regex: 'john' } };
        const result = translator.translate(query);

        // The implementation adds type check for string fields
        expect(result.sql).toBe("(json_type(json_extract(data, '$.name')) = 'text' AND json_extract(data, '$.name') LIKE ?)");
        expect(result.params).toEqual(['%john%']);
      });

      it('should translate $regex with ^ anchor (starts with)', () => {
        const query = { name: { $regex: '^John' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.name')) = 'text' AND json_extract(data, '$.name') LIKE ?)");
        expect(result.params).toEqual(['John%']);
      });

      it('should translate $regex with $ anchor (ends with)', () => {
        const query = { name: { $regex: 'son$' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.name')) = 'text' AND json_extract(data, '$.name') LIKE ?)");
        expect(result.params).toEqual(['%son']);
      });

      it('should translate $regex with both anchors (exact match)', () => {
        const query = { name: { $regex: '^John$' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.name')) = 'text' AND json_extract(data, '$.name') LIKE ?)");
        expect(result.params).toEqual(['John']);
      });

      it('should translate $regex with .* wildcard', () => {
        const query = { name: { $regex: 'J.*n' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.name')) = 'text' AND json_extract(data, '$.name') LIKE ?)");
        expect(result.params).toEqual(['%J%n%']);
      });

      it('should translate $regex with . single char', () => {
        const query = { code: { $regex: '^A.B$' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.code')) = 'text' AND json_extract(data, '$.code') LIKE ?)");
        expect(result.params).toEqual(['A_B']);
      });

      it('should translate $regex with $options: "i" (case insensitive)', () => {
        const query = { name: { $regex: 'john', $options: 'i' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.name')) = 'text' AND LOWER(json_extract(data, '$.name')) LIKE LOWER(?))");
        expect(result.params).toEqual(['%john%']);
      });

      it('should handle $regex as RegExp object', () => {
        const query = { name: { $regex: /john/i } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.name')) = 'text' AND LOWER(json_extract(data, '$.name')) LIKE LOWER(?))");
        expect(result.params).toEqual(['%john%']);
      });

      it('should escape LIKE special characters in pattern', () => {
        const query = { value: { $regex: '100%' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.value')) = 'text' AND json_extract(data, '$.value') LIKE ?)");
        expect(result.params).toEqual(['%100\\%%']);
      });

      it('should translate $regex with nested path', () => {
        const query = { 'user.email': { $regex: '@gmail.com$' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_type(json_extract(data, '$.user.email')) = 'text' AND json_extract(data, '$.user.email') LIKE ?)");
        expect(result.params).toEqual(['%@gmail_com']);
      });

      it('should translate $regex combined with other operators', () => {
        const query = {
          name: { $regex: '^J' },
          age: { $gte: 18 }
        };
        const result = translator.translate(query);

        expect(result.sql).toContain("LIKE ?");
        expect(result.sql).toContain(">= ?");
        expect(result.params).toContain('J%');
        expect(result.params).toContain(18);
      });

      it('should translate $regex with $not', () => {
        const query = { name: { $not: { $regex: '^Admin' } } };
        const result = translator.translate(query);

        expect(result.sql).toBe("NOT ((json_type(json_extract(data, '$.name')) = 'text' AND json_extract(data, '$.name') LIKE ?))");
        expect(result.params).toEqual(['Admin%']);
      });
    });

    describe('Nested field paths', () => {
      it('should handle single level nested path', () => {
        const query = { 'address.city': 'New York' };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.address.city') = ?");
        expect(result.params).toEqual(['New York']);
      });

      it('should handle deeply nested path', () => {
        const query = { 'user.profile.settings.theme': 'dark' };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.user.profile.settings.theme') = ?");
        expect(result.params).toEqual(['dark']);
      });

      it('should handle nested path with comparison operator', () => {
        const query = { 'stats.score': { $gte: 100 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.stats.score') >= ?");
        expect(result.params).toEqual([100]);
      });

      it('should handle nested path with $in', () => {
        const query = { 'meta.tags': { $in: ['featured', 'popular'] } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.meta.tags') IN (?, ?)");
        expect(result.params).toEqual(['featured', 'popular']);
      });
    });

    describe('Multiple conditions on same field', () => {
      it('should handle range query ($gt and $lt)', () => {
        const query = { age: { $gt: 18, $lt: 65 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_extract(data, '$.age') > ? AND json_extract(data, '$.age') < ?)");
        expect(result.params).toEqual([18, 65]);
      });

      it('should handle $gte and $lte range', () => {
        const query = { price: { $gte: 10, $lte: 100 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_extract(data, '$.price') >= ? AND json_extract(data, '$.price') <= ?)");
        expect(result.params).toEqual([10, 100]);
      });
    });

    describe('Multiple fields', () => {
      it('should combine multiple field conditions with AND', () => {
        const query = { name: 'John', age: { $gte: 21 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_extract(data, '$.name') = ? AND json_extract(data, '$.age') >= ?)");
        expect(result.params).toEqual(['John', 21]);
      });
    });
  });

  // ============================================================
  // LOGICAL OPERATORS (mondodb-1g9)
  // ============================================================
  describe('Logical Operators', () => {
    describe('$and operator', () => {
      it('should translate $and with multiple conditions', () => {
        const query = {
          $and: [
            { status: 'active' },
            { age: { $gte: 21 } }
          ]
        };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_extract(data, '$.status') = ? AND json_extract(data, '$.age') >= ?)");
        expect(result.params).toEqual(['active', 21]);
      });

      it('should handle nested $and', () => {
        const query = {
          $and: [
            { status: 'active' },
            { $and: [{ age: { $gte: 18 } }, { age: { $lt: 65 } }] }
          ]
        };
        const result = translator.translate(query);

        expect(result.sql).toContain('AND');
        expect(result.params).toEqual(['active', 18, 65]);
      });

      it('should handle single condition in $and', () => {
        const query = {
          $and: [{ name: 'John' }]
        };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_extract(data, '$.name') = ?");
        expect(result.params).toEqual(['John']);
      });

      it('should handle empty $and array', () => {
        const query = { $and: [] };
        const result = translator.translate(query);

        // Empty $and should match everything
        expect(result.sql).toBe('1 = 1');
        expect(result.params).toEqual([]);
      });
    });

    describe('$or operator', () => {
      it('should translate $or with multiple conditions', () => {
        const query = {
          $or: [
            { status: 'active' },
            { status: 'pending' }
          ]
        };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_extract(data, '$.status') = ? OR json_extract(data, '$.status') = ?)");
        expect(result.params).toEqual(['active', 'pending']);
      });

      it('should handle $or with different fields', () => {
        const query = {
          $or: [
            { name: 'John' },
            { age: { $gt: 30 } }
          ]
        };
        const result = translator.translate(query);

        expect(result.sql).toBe("(json_extract(data, '$.name') = ? OR json_extract(data, '$.age') > ?)");
        expect(result.params).toEqual(['John', 30]);
      });

      it('should handle empty $or array', () => {
        const query = { $or: [] };
        const result = translator.translate(query);

        // Empty $or should match nothing
        expect(result.sql).toBe('0 = 1');
        expect(result.params).toEqual([]);
      });
    });

    describe('$not operator', () => {
      it('should translate $not with comparison operator', () => {
        const query = { age: { $not: { $gt: 30 } } };
        const result = translator.translate(query);

        expect(result.sql).toBe("NOT (json_extract(data, '$.age') > ?)");
        expect(result.params).toEqual([30]);
      });

      it('should translate $not with $eq', () => {
        const query = { status: { $not: { $eq: 'deleted' } } };
        const result = translator.translate(query);

        expect(result.sql).toBe("NOT (json_extract(data, '$.status') = ?)");
        expect(result.params).toEqual(['deleted']);
      });

      it('should translate $not with $in', () => {
        const query = { status: { $not: { $in: ['deleted', 'archived'] } } };
        const result = translator.translate(query);

        expect(result.sql).toBe("NOT (json_extract(data, '$.status') IN (?, ?))");
        expect(result.params).toEqual(['deleted', 'archived']);
      });
    });

    describe('$nor operator', () => {
      it('should translate $nor to NOT (... OR ...)', () => {
        const query = {
          $nor: [
            { status: 'deleted' },
            { status: 'archived' }
          ]
        };
        const result = translator.translate(query);

        expect(result.sql).toBe("NOT (json_extract(data, '$.status') = ? OR json_extract(data, '$.status') = ?)");
        expect(result.params).toEqual(['deleted', 'archived']);
      });

      it('should handle empty $nor array', () => {
        const query = { $nor: [] };
        const result = translator.translate(query);

        // Empty $nor should match everything (NOT of nothing)
        expect(result.sql).toBe('1 = 1');
        expect(result.params).toEqual([]);
      });
    });

    describe('Combined logical operators', () => {
      it('should handle $and with nested $or', () => {
        const query = {
          $and: [
            { active: true },
            { $or: [{ role: 'admin' }, { role: 'moderator' }] }
          ]
        };
        const result = translator.translate(query);

        expect(result.sql).toContain('AND');
        expect(result.sql).toContain('OR');
        // SQLite json_extract returns 1/0 for booleans, so we convert true to 1
        expect(result.params).toEqual([1, 'admin', 'moderator']);
      });

      it('should handle $or with nested $and', () => {
        const query = {
          $or: [
            { $and: [{ role: 'admin' }, { active: true }] },
            { $and: [{ role: 'super' }, { active: true }] }
          ]
        };
        const result = translator.translate(query);

        expect(result.sql).toContain('OR');
        expect(result.params).toContain('admin');
        expect(result.params).toContain('super');
      });
    });
  });

  // ============================================================
  // ELEMENT OPERATORS (mondodb-b2f)
  // ============================================================
  describe('Element Operators', () => {
    describe('$exists operator', () => {
      it('should translate $exists: true to check field existence', () => {
        const query = { email: { $exists: true } };
        const result = translator.translate(query);

        // Uses json_type to distinguish between null values and missing fields
        // json_type returns 'null' for explicit nulls, NULL for missing fields
        expect(result.sql).toBe("json_type(data, '$.email') IS NOT NULL");
        expect(result.params).toEqual([]);
      });

      it('should translate $exists: false to check field absence', () => {
        const query = { deletedAt: { $exists: false } };
        const result = translator.translate(query);

        // Uses json_type to distinguish between null values and missing fields
        expect(result.sql).toBe("json_type(data, '$.deletedAt') IS NULL");
        expect(result.params).toEqual([]);
      });

      it('should handle $exists with nested path', () => {
        const query = { 'profile.avatar': { $exists: true } };
        const result = translator.translate(query);

        // Uses json_type to distinguish between null values and missing fields
        expect(result.sql).toBe("json_type(data, '$.profile.avatar') IS NOT NULL");
        expect(result.params).toEqual([]);
      });
    });

    describe('$type operator', () => {
      it('should translate $type: "string"', () => {
        const query = { name: { $type: 'string' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_type(json_extract(data, '$.name')) = 'text'");
        expect(result.params).toEqual([]);
      });

      it('should translate $type: "number"', () => {
        const query = { age: { $type: 'number' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_type(json_extract(data, '$.age')) IN ('integer', 'real')");
        expect(result.params).toEqual([]);
      });

      it('should translate $type: "bool"', () => {
        const query = { active: { $type: 'bool' } };
        const result = translator.translate(query);

        expect(result.sql).toContain('json_type');
        expect(result.params).toEqual([]);
      });

      it('should translate $type: "array"', () => {
        const query = { tags: { $type: 'array' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_type(json_extract(data, '$.tags')) = 'array'");
        expect(result.params).toEqual([]);
      });

      it('should translate $type: "object"', () => {
        const query = { metadata: { $type: 'object' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_type(json_extract(data, '$.metadata')) = 'object'");
        expect(result.params).toEqual([]);
      });

      it('should translate $type: "null"', () => {
        const query = { value: { $type: 'null' } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_type(json_extract(data, '$.value')) = 'null'");
        expect(result.params).toEqual([]);
      });
    });
  });

  // ============================================================
  // ARRAY OPERATORS (mondodb-b2f)
  // ============================================================
  describe('Array Operators', () => {
    describe('$all operator', () => {
      it('should translate $all to check array contains all values', () => {
        const query = { tags: { $all: ['javascript', 'typescript'] } };
        const result = translator.translate(query);

        // Each value must exist in the array
        expect(result.sql).toContain('json_extract');
        expect(result.params).toContain('javascript');
        expect(result.params).toContain('typescript');
      });

      it('should handle $all with single value', () => {
        const query = { tags: { $all: ['featured'] } };
        const result = translator.translate(query);

        expect(result.params).toEqual(['featured']);
      });

      it('should handle empty $all array', () => {
        const query = { tags: { $all: [] } };
        const result = translator.translate(query);

        // Empty $all should match everything
        expect(result.sql).toBe('1 = 1');
        expect(result.params).toEqual([]);
      });
    });

    describe('$elemMatch operator', () => {
      it('should translate $elemMatch for array of objects', () => {
        const query = {
          scores: {
            $elemMatch: { subject: 'math', score: { $gte: 90 } }
          }
        };
        const result = translator.translate(query);

        expect(result.sql).toContain('EXISTS');
        expect(result.params).toContain('math');
        expect(result.params).toContain(90);
      });

      it('should handle $elemMatch with single condition', () => {
        const query = {
          items: {
            $elemMatch: { qty: { $gt: 5 } }
          }
        };
        const result = translator.translate(query);

        expect(result.sql).toContain('EXISTS');
        expect(result.params).toContain(5);
      });
    });

    describe('$size operator', () => {
      it('should translate $size to check array length', () => {
        const query = { tags: { $size: 3 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_array_length(json_extract(data, '$.tags')) = ?");
        expect(result.params).toEqual([3]);
      });

      it('should handle $size: 0 for empty arrays', () => {
        const query = { items: { $size: 0 } };
        const result = translator.translate(query);

        expect(result.sql).toBe("json_array_length(json_extract(data, '$.items')) = ?");
        expect(result.params).toEqual([0]);
      });
    });
  });

  // ============================================================
  // EVALUATION OPERATORS
  // ============================================================
  describe('Evaluation Operators', () => {
    describe('$regex operator', () => {
      it('should translate basic $regex to LIKE pattern', () => {
        const query = { name: { $regex: 'Apple' } };
        const result = translator.translate(query);

        expect(result.sql).toContain('LIKE');
        expect(result.sql).toContain("json_type");
        expect(result.params).toEqual(['%Apple%']);
      });

      it('should handle $regex with case-insensitive option', () => {
        const query = { name: { $regex: 'apple', $options: 'i' } };
        const result = translator.translate(query);

        expect(result.sql).toContain('LOWER');
        expect(result.sql).toContain('LIKE');
        expect(result.params).toEqual(['%apple%']);
      });

      it('should handle $regex with ^ anchor (starts with)', () => {
        const query = { name: { $regex: '^A' } };
        const result = translator.translate(query);

        expect(result.params).toEqual(['A%']);
      });

      it('should handle $regex with $ anchor (ends with)', () => {
        const query = { name: { $regex: 'a$' } };
        const result = translator.translate(query);

        expect(result.params).toEqual(['%a']);
      });

      it('should handle $regex with both anchors (exact match)', () => {
        const query = { name: { $regex: '^Apple$' } };
        const result = translator.translate(query);

        expect(result.params).toEqual(['Apple']);
      });

      it('should handle $regex with .* wildcard', () => {
        const query = { name: { $regex: 'A.*e' } };
        const result = translator.translate(query);

        expect(result.params).toEqual(['%A%e%']);
      });

      it('should handle $regex with . single character', () => {
        const query = { name: { $regex: 'A.ple' } };
        const result = translator.translate(query);

        expect(result.params).toEqual(['%A_ple%']);
      });

      it('should handle $regex with character class', () => {
        const query = { name: { $regex: '[0-9]+' } };
        const result = translator.translate(query);

        // Character class with + becomes %
        expect(result.params).toEqual(['%%%']);
      });

      it('should handle $regex with multiline option', () => {
        const query = { name: { $regex: '^Line2', $options: 'm' } };
        const result = translator.translate(query);

        // In multiline mode, ^ doesn't anchor to start of string
        expect(result.params).toEqual(['%Line2%']);
      });

      it('should handle $regex with escaped special characters', () => {
        const query = { name: { $regex: 'test\\.value' } };
        const result = translator.translate(query);

        // Escaped dot should be literal
        expect(result.params).toEqual(['%test.value%']);
      });

      it('should add type check for string fields', () => {
        const query = { value: { $regex: '123' } };
        const result = translator.translate(query);

        expect(result.sql).toContain("json_type");
        expect(result.sql).toContain("= 'text'");
      });
    });

    describe('$mod operator', () => {
      it('should translate $mod to modulo check', () => {
        const query = { value: { $mod: [10, 0] } };
        const result = translator.translate(query);

        expect(result.sql).toContain('%');
        expect(result.sql).toContain('CAST');
        expect(result.sql).toContain("json_type");
        expect(result.params).toEqual([10, 0]);
      });

      it('should handle $mod with non-zero remainder', () => {
        const query = { value: { $mod: [10, 5] } };
        const result = translator.translate(query);

        expect(result.params).toEqual([10, 5]);
      });

      it('should check for numeric type', () => {
        const query = { value: { $mod: [2, 1] } };
        const result = translator.translate(query);

        expect(result.sql).toContain("IN ('integer', 'real')");
      });
    });
  });

  // ============================================================
  // EDGE CASES AND INTEGRATION
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle empty query object', () => {
      const query = {};
      const result = translator.translate(query);

      expect(result.sql).toBe('1 = 1');
      expect(result.params).toEqual([]);
    });

    it('should handle complex nested query', () => {
      const query = {
        $and: [
          { status: 'active' },
          { $or: [
            { 'profile.type': 'premium' },
            { 'billing.plan': { $in: ['pro', 'enterprise'] } }
          ]},
          { age: { $gte: 18, $lte: 100 } },
          { email: { $exists: true } }
        ]
      };
      const result = translator.translate(query);

      expect(result.sql).toContain('AND');
      expect(result.sql).toContain('OR');
      expect(result.sql).toContain('IN');
      expect(result.params.length).toBeGreaterThan(0);
    });

    it('should properly escape field names with special characters', () => {
      const query = { 'field-name': 'value' };
      const result = translator.translate(query);

      expect(result.sql).toContain("'$.field-name'");
      expect(result.params).toEqual(['value']);
    });

    it('should handle array index in path', () => {
      const query = { 'items.0.name': 'first' };
      const result = translator.translate(query);

      expect(result.sql).toContain("'$.items[0].name'");
      expect(result.params).toEqual(['first']);
    });
  });
});
