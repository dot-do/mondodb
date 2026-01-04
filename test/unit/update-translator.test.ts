import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateTranslator, TranslatedUpdate } from '../../src/translator/update-translator';

describe('UpdateTranslator', () => {
  let translator: UpdateTranslator;

  beforeEach(() => {
    translator = new UpdateTranslator();
  });

  // ============================================================
  // FIELD UPDATE OPERATORS (mondodb-fuq)
  // ============================================================
  describe('Field Update Operators', () => {
    describe('$set operator', () => {
      it('should translate simple $set to json_set', () => {
        const update = { $set: { name: 'John' } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.name', ?)");
        expect(result.params).toEqual(['John']);
      });

      it('should translate $set with number value', () => {
        const update = { $set: { age: 30 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.age', ?)");
        expect(result.params).toEqual([30]);
      });

      it('should translate $set with boolean value', () => {
        const update = { $set: { active: true } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.active', json(?))");
        expect(result.params).toEqual(['true']);
      });

      it('should translate $set with null value', () => {
        const update = { $set: { deletedAt: null } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.deletedAt', json('null'))");
        expect(result.params).toEqual([]);
      });

      it('should translate $set with nested path', () => {
        const update = { $set: { 'address.city': 'New York' } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.address.city', ?)");
        expect(result.params).toEqual(['New York']);
      });

      it('should translate $set with deeply nested path', () => {
        const update = { $set: { 'user.profile.settings.theme': 'dark' } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.user.profile.settings.theme', ?)");
        expect(result.params).toEqual(['dark']);
      });

      it('should translate $set with multiple fields', () => {
        const update = { $set: { name: 'John', age: 30 } };
        const result = translator.translate(update);

        // Optimized: uses multi-path json_set instead of nested calls
        expect(result.sql).toBe("json_set(data, '$.name', ?, '$.age', ?)");
        expect(result.params).toEqual(['John', 30]);
      });

      it('should translate $set with object value', () => {
        const update = { $set: { address: { city: 'NYC', zip: '10001' } } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.address', json(?))");
        expect(result.params).toEqual([JSON.stringify({ city: 'NYC', zip: '10001' })]);
      });

      it('should translate $set with array value', () => {
        const update = { $set: { tags: ['a', 'b', 'c'] } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.tags', json(?))");
        expect(result.params).toEqual([JSON.stringify(['a', 'b', 'c'])]);
      });

      it('should translate $set with array index', () => {
        const update = { $set: { 'items.0.name': 'first' } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.items[0].name', ?)");
        expect(result.params).toEqual(['first']);
      });
    });

    describe('$unset operator', () => {
      it('should translate $unset to json_remove', () => {
        const update = { $unset: { name: '' } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_remove(data, '$.name')");
        expect(result.params).toEqual([]);
      });

      it('should translate $unset with nested path', () => {
        const update = { $unset: { 'address.city': '' } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_remove(data, '$.address.city')");
        expect(result.params).toEqual([]);
      });

      it('should translate $unset with multiple fields', () => {
        const update = { $unset: { name: '', age: '' } };
        const result = translator.translate(update);

        // Optimized: uses multi-path json_remove instead of nested calls
        expect(result.sql).toBe("json_remove(data, '$.name', '$.age')");
        expect(result.params).toEqual([]);
      });

      it('should translate $unset with value 1 (MongoDB convention)', () => {
        const update = { $unset: { name: 1 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_remove(data, '$.name')");
        expect(result.params).toEqual([]);
      });
    });

    describe('$inc operator', () => {
      it('should translate $inc to json_set with addition', () => {
        const update = { $inc: { count: 1 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.count', COALESCE(json_extract(data, '$.count'), 0) + ?)");
        expect(result.params).toEqual([1]);
      });

      it('should translate $inc with negative value (decrement)', () => {
        const update = { $inc: { count: -1 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.count', COALESCE(json_extract(data, '$.count'), 0) + ?)");
        expect(result.params).toEqual([-1]);
      });

      it('should translate $inc with nested path', () => {
        const update = { $inc: { 'stats.views': 5 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.stats.views', COALESCE(json_extract(data, '$.stats.views'), 0) + ?)");
        expect(result.params).toEqual([5]);
      });

      it('should translate $inc with multiple fields', () => {
        const update = { $inc: { count: 1, 'stats.views': 10 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("json_set");
        expect(result.sql).toContain("'$.count'");
        expect(result.sql).toContain("'$.stats.views'");
        expect(result.params).toEqual([1, 10]);
      });

      it('should translate $inc with float value', () => {
        const update = { $inc: { price: 0.5 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.price', COALESCE(json_extract(data, '$.price'), 0) + ?)");
        expect(result.params).toEqual([0.5]);
      });
    });

    describe('$min operator', () => {
      it('should translate $min to conditional update with MIN', () => {
        const update = { $min: { lowScore: 50 } };
        const result = translator.translate(update);

        expect(result.sql).toBe(
          "json_set(data, '$.lowScore', CASE WHEN json_extract(data, '$.lowScore') IS NULL OR ? < json_extract(data, '$.lowScore') THEN ? ELSE json_extract(data, '$.lowScore') END)"
        );
        expect(result.params).toEqual([50, 50]);
      });

      it('should translate $min with nested path', () => {
        const update = { $min: { 'stats.minTemp': -10 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.stats.minTemp'");
        expect(result.sql).toContain('CASE WHEN');
        expect(result.params).toEqual([-10, -10]);
      });
    });

    describe('$max operator', () => {
      it('should translate $max to conditional update with MAX', () => {
        const update = { $max: { highScore: 100 } };
        const result = translator.translate(update);

        expect(result.sql).toBe(
          "json_set(data, '$.highScore', CASE WHEN json_extract(data, '$.highScore') IS NULL OR ? > json_extract(data, '$.highScore') THEN ? ELSE json_extract(data, '$.highScore') END)"
        );
        expect(result.params).toEqual([100, 100]);
      });

      it('should translate $max with nested path', () => {
        const update = { $max: { 'stats.maxTemp': 40 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.stats.maxTemp'");
        expect(result.sql).toContain('CASE WHEN');
        expect(result.params).toEqual([40, 40]);
      });
    });

    describe('$mul operator', () => {
      it('should translate $mul to json_set with multiplication', () => {
        const update = { $mul: { quantity: 2 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.quantity', COALESCE(json_extract(data, '$.quantity'), 0) * ?)");
        expect(result.params).toEqual([2]);
      });

      it('should translate $mul with float value', () => {
        const update = { $mul: { price: 1.1 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.price', COALESCE(json_extract(data, '$.price'), 0) * ?)");
        expect(result.params).toEqual([1.1]);
      });

      it('should translate $mul with nested path', () => {
        const update = { $mul: { 'stats.multiplier': 3 } };
        const result = translator.translate(update);

        expect(result.sql).toBe("json_set(data, '$.stats.multiplier', COALESCE(json_extract(data, '$.stats.multiplier'), 0) * ?)");
        expect(result.params).toEqual([3]);
      });

      it('should translate $mul with multiple fields', () => {
        const update = { $mul: { price: 2, quantity: 0.5 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("json_set");
        expect(result.sql).toContain("'$.price'");
        expect(result.sql).toContain("'$.quantity'");
        expect(result.params).toEqual([2, 0.5]);
      });
    });

    describe('$rename operator', () => {
      it('should translate $rename to remove+set combination', () => {
        const update = { $rename: { oldName: 'newName' } };
        const result = translator.translate(update);

        expect(result.sql).toBe(
          "json_set(json_remove(data, '$.oldName'), '$.newName', json_extract(data, '$.oldName'))"
        );
        expect(result.params).toEqual([]);
      });

      it('should translate $rename with nested source path', () => {
        const update = { $rename: { 'old.field': 'new.field' } };
        const result = translator.translate(update);

        expect(result.sql).toBe(
          "json_set(json_remove(data, '$.old.field'), '$.new.field', json_extract(data, '$.old.field'))"
        );
        expect(result.params).toEqual([]);
      });

      it('should translate $rename with multiple fields', () => {
        const update = { $rename: { a: 'b', c: 'd' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("json_set");
        expect(result.sql).toContain("json_remove");
        expect(result.sql).toContain("'$.a'");
        expect(result.sql).toContain("'$.b'");
        expect(result.sql).toContain("'$.c'");
        expect(result.sql).toContain("'$.d'");
      });
    });

    describe('Combined field operators', () => {
      it('should handle $set and $inc together', () => {
        const update = { $set: { name: 'John' }, $inc: { count: 1 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("json_set");
        expect(result.sql).toContain("'$.name'");
        expect(result.sql).toContain("'$.count'");
        expect(result.params).toContain('John');
        expect(result.params).toContain(1);
      });

      it('should handle $set, $unset, and $inc together', () => {
        const update = {
          $set: { status: 'active' },
          $unset: { temp: '' },
          $inc: { version: 1 }
        };
        const result = translator.translate(update);

        expect(result.sql).toContain("json_set");
        expect(result.sql).toContain("json_remove");
        expect(result.sql).toContain("'$.status'");
        expect(result.sql).toContain("'$.temp'");
        expect(result.sql).toContain("'$.version'");
      });

      it('should handle all field operators together', () => {
        const update = {
          $set: { a: 1 },
          $unset: { b: '' },
          $inc: { c: 1 },
          $mul: { d: 2 },
          $min: { e: 10 },
          $max: { f: 100 },
          $rename: { g: 'h' }
        };
        const result = translator.translate(update);

        expect(result.sql).toContain("json_set");
        expect(result.sql).toContain("json_remove");
        // All paths should be present
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach(field => {
          expect(result.sql).toContain(`'$.${field}'`);
        });
      });
    });
  });

  // ============================================================
  // ARRAY UPDATE OPERATORS (mondodb-iua)
  // ============================================================
  describe('Array Update Operators', () => {
    describe('$push operator', () => {
      it('should translate $push to json_insert with array append', () => {
        const update = { $push: { tags: 'new' } };
        const result = translator.translate(update);

        expect(result.sql).toBe(
          "json_set(data, '$.tags', json_insert(COALESCE(json_extract(data, '$.tags'), '[]'), '$[#]', ?))"
        );
        expect(result.params).toEqual(['new']);
      });

      it('should translate $push with nested path', () => {
        const update = { $push: { 'user.tags': 'admin' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.user.tags'");
        expect(result.params).toEqual(['admin']);
      });

      it('should translate $push with object value', () => {
        const update = { $push: { items: { name: 'item1', qty: 5 } } };
        const result = translator.translate(update);

        expect(result.sql).toContain("json_insert");
        expect(result.sql).toContain("'$.items'");
        expect(result.params).toEqual([JSON.stringify({ name: 'item1', qty: 5 })]);
      });

      it('should translate $push with multiple fields', () => {
        const update = { $push: { tags: 'a', categories: 'b' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        expect(result.sql).toContain("'$.categories'");
      });
    });

    describe('$push with $each modifier', () => {
      it('should translate $push.$each for multiple values', () => {
        const update = { $push: { tags: { $each: ['a', 'b', 'c'] } } };
        const result = translator.translate(update);

        expect(result.sql).toContain("json_insert");
        expect(result.sql).toContain("'$.tags'");
        // Should insert each element
        expect(result.params).toEqual(['a', 'b', 'c']);
      });

      it('should handle empty $each array', () => {
        const update = { $push: { tags: { $each: [] } } };
        const result = translator.translate(update);

        // Should be a no-op essentially
        expect(result.sql).toContain("'$.tags'");
        expect(result.params).toEqual([]);
      });
    });

    describe('$push with $slice modifier', () => {
      it('should translate $push with $slice to limit array size', () => {
        const update = { $push: { scores: { $each: [100], $slice: -5 } } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.scores'");
        // Should have logic to limit array to last 5 elements
        expect(result.sql).toContain('json_extract');
      });

      it('should translate $push with positive $slice', () => {
        const update = { $push: { scores: { $each: [100], $slice: 3 } } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.scores'");
        // Should have logic to limit array to first 3 elements
      });

      it('should translate $push with $slice: 0 (empty result)', () => {
        const update = { $push: { scores: { $each: [100], $slice: 0 } } };
        const result = translator.translate(update);

        // Should result in empty array
        expect(result.sql).toContain("'$.scores'");
      });
    });

    describe('$pull operator', () => {
      it('should translate $pull to remove matching elements', () => {
        const update = { $pull: { tags: 'old' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        // json() function needs JSON-formatted string
        expect(result.params).toEqual(['"old"']);
      });

      it('should translate $pull with nested path', () => {
        const update = { $pull: { 'user.tags': 'admin' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.user.tags'");
        // json() function needs JSON-formatted string
        expect(result.params).toEqual(['"admin"']);
      });

      it('should translate $pull with query condition', () => {
        const update = { $pull: { items: { qty: { $gte: 10 } } } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.items'");
        // Should handle the query condition
      });

      it('should translate $pull with multiple fields', () => {
        const update = { $pull: { tags: 'a', categories: 'b' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        expect(result.sql).toContain("'$.categories'");
      });
    });

    describe('$addToSet operator', () => {
      it('should translate $addToSet to push if not exists', () => {
        const update = { $addToSet: { tags: 'unique' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        // Should have conditional logic to check existence
        expect(result.sql).toContain('CASE');
        expect(result.params).toContain('unique');
      });

      it('should translate $addToSet with nested path', () => {
        const update = { $addToSet: { 'user.roles': 'admin' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.user.roles'");
        expect(result.params).toContain('admin');
      });

      it('should translate $addToSet with $each modifier', () => {
        const update = { $addToSet: { tags: { $each: ['a', 'b', 'c'] } } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        // Should check each value for existence
      });

      it('should translate $addToSet with object value', () => {
        const update = { $addToSet: { items: { name: 'item1', qty: 5 } } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.items'");
      });
    });

    describe('$pop operator', () => {
      it('should translate $pop: 1 to remove last element', () => {
        const update = { $pop: { tags: 1 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        // Optimized: uses CTE with json_group_array for efficient removal
        expect(result.sql).toContain('array_elements');
        expect(result.sql).toContain('json_group_array');
        // Should remove last element by filtering idx < cnt - 1
        expect(result.sql).toContain('idx < cnt - 1');
      });

      it('should translate $pop: -1 to remove first element', () => {
        const update = { $pop: { tags: -1 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        // Optimized: uses CTE with json_group_array for efficient removal
        expect(result.sql).toContain('array_elements');
        // Should remove first element by filtering idx > 0
        expect(result.sql).toContain('idx > 0');
      });

      it('should translate $pop with nested path', () => {
        const update = { $pop: { 'user.history': 1 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.user.history'");
      });

      it('should translate $pop with multiple fields', () => {
        const update = { $pop: { first: -1, last: 1 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.first'");
        expect(result.sql).toContain("'$.last'");
      });
    });

    describe('Combined array operators', () => {
      it('should handle $push and $pull together', () => {
        const update = { $push: { tags: 'new' }, $pull: { old: 'remove' } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        expect(result.sql).toContain("'$.old'");
      });

      it('should handle $addToSet and $pop together', () => {
        const update = { $addToSet: { tags: 'unique' }, $pop: { history: 1 } };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.tags'");
        expect(result.sql).toContain("'$.history'");
      });

      it('should handle field and array operators together', () => {
        const update = {
          $set: { name: 'John' },
          $inc: { count: 1 },
          $push: { tags: 'new' },
          $pull: { blacklist: 'old' }
        };
        const result = translator.translate(update);

        expect(result.sql).toContain("'$.name'");
        expect(result.sql).toContain("'$.count'");
        expect(result.sql).toContain("'$.tags'");
        expect(result.sql).toContain("'$.blacklist'");
      });
    });
  });

  // ============================================================
  // EDGE CASES
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle empty update object', () => {
      const update = {};
      const result = translator.translate(update);

      expect(result.sql).toBe('data');
      expect(result.params).toEqual([]);
    });

    it('should throw error for unknown operators', () => {
      const update = { $unknown: { field: 'value' } };

      expect(() => translator.translate(update)).toThrow();
    });

    it('should handle special characters in field names', () => {
      const update = { $set: { 'field-with-dash': 'value' } };
      const result = translator.translate(update);

      expect(result.sql).toContain("'$.field-with-dash'");
    });

    it('should handle numeric field names (array indices)', () => {
      const update = { $set: { 'items.0': { name: 'first' } } };
      const result = translator.translate(update);

      expect(result.sql).toContain("'$.items[0]'");
    });
  });
});
