import { describe, it, expect, beforeEach } from 'vitest'
import { AggregationTranslator } from '../../src/translator/aggregation-translator'
import {
  translateExpression,
  resetFunctionIdCounter,
  isFunctionOperator,
  createFunctionExpression,
  parseFunctionPlaceholder,
  hasFunctionPlaceholders
} from '../../src/translator/stages/expression-translator'

describe('$function expression operator', () => {
  beforeEach(() => {
    resetFunctionIdCounter()
  })

  describe('translateExpression with $function', () => {
    it('translates basic $function with field reference', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function(x) { return x * 2; }',
          args: ['$field'],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      expect(result).toContain('__FUNCTION__')
      expect(result).toContain('$.field')
      expect(result).toContain('function(x) { return x * 2; }')
    })

    it('translates $function with multiple field references', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function(a, b) { return a + b; }',
          args: ['$price', '$tax'],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      expect(result).toContain('__FUNCTION__')
      expect(result).toContain('$.price')
      expect(result).toContain('$.tax')
    })

    it('translates $function with literal arguments', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function(x, multiplier) { return x * multiplier; }',
          args: ['$value', 2],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      expect(result).toContain('__FUNCTION__')
      expect(result).toContain('$.value')

      // Parse the marker to check literal args
      const parsed = parseFunctionPlaceholder(result)
      expect(parsed).not.toBeNull()
      expect(parsed!.literalArgs[1]).toBe(2)
    })

    it('translates $function with string literal arguments', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function(name, prefix) { return prefix + name; }',
          args: ['$name', 'Mr. '],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      expect(result).toContain('__FUNCTION__')
      const parsed = parseFunctionPlaceholder(result)
      expect(parsed!.literalArgs[1]).toBe('Mr. ')
    })

    it('translates $function with null argument', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function(x, defaultVal) { return x || defaultVal; }',
          args: ['$field', null],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      const parsed = parseFunctionPlaceholder(result)
      expect(parsed!.literalArgs[1]).toBe(null)
    })

    it('translates $function with nested field reference', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function(city) { return city.toUpperCase(); }',
          args: ['$address.city'],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      expect(result).toContain('$.address.city')
    })

    it('translates $function with array index in field path', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function(item) { return item.name; }',
          args: ['$items.0'],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      expect(result).toContain('$.items[0]')
    })

    it('throws error when body is missing', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          args: ['$field'],
          lang: 'js' as const
        }
      }

      expect(() => translateExpression(expr as any, params)).toThrow('$function requires body')
    })

    it('throws error when args is missing', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function() { return 1; }',
          lang: 'js' as const
        }
      }

      expect(() => translateExpression(expr as any, params)).toThrow('$function requires args')
    })

    it('throws error for unsupported language', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'def func(x): return x * 2',
          args: ['$field'],
          lang: 'python'
        }
      }

      expect(() => translateExpression(expr as any, params)).toThrow('$function only supports lang: "js"')
    })

    it('handles function body as actual function', () => {
      const params: unknown[] = []
      const fn = function (x: number) { return x * 2 }
      const expr = {
        $function: {
          body: fn,
          args: ['$value'],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      expect(result).toContain('__FUNCTION__')
      const parsed = parseFunctionPlaceholder(result)
      expect(parsed!.body).toContain('function')
      expect(parsed!.body).toContain('return x * 2')
    })

    it('handles empty args array', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function() { return Date.now(); }',
          args: [],
          lang: 'js' as const
        }
      }

      const result = translateExpression(expr, params)

      expect(result).toContain('__FUNCTION__')
      const parsed = parseFunctionPlaceholder(result)
      expect(parsed!.argPaths).toEqual([])
    })
  })

  describe('AggregationTranslator with $function in $project', () => {
    const translator = new AggregationTranslator('products')

    beforeEach(() => {
      resetFunctionIdCounter()
    })

    it('translates $project with $function', () => {
      const pipeline = [
        {
          $project: {
            name: 1,
            discountedPrice: {
              $function: {
                body: 'function(price) { return price * 0.9; }',
                args: ['$price'],
                lang: 'js' as const
              }
            }
          }
        }
      ]

      const result = translator.translate(pipeline)

      expect(result.sql).toContain('json_object')
      expect(result.sql).toContain("'discountedPrice'")
      expect(result.sql).toContain('__FUNCTION__')
    })

    it('translates $project with multiple $function fields', () => {
      const pipeline = [
        {
          $project: {
            doubled: {
              $function: {
                body: 'function(x) { return x * 2; }',
                args: ['$value'],
                lang: 'js' as const
              }
            },
            tripled: {
              $function: {
                body: 'function(x) { return x * 3; }',
                args: ['$value'],
                lang: 'js' as const
              }
            }
          }
        }
      ]

      const result = translator.translate(pipeline)

      // Should have two function markers
      const matches = result.sql.match(/__FUNCTION__/g)
      expect(matches).toHaveLength(2)
    })
  })

  describe('AggregationTranslator with $function in $addFields', () => {
    const translator = new AggregationTranslator('orders')

    beforeEach(() => {
      resetFunctionIdCounter()
    })

    it('translates $addFields with $function', () => {
      const pipeline = [
        {
          $addFields: {
            totalWithTax: {
              $function: {
                body: 'function(price, tax) { return price + (price * tax); }',
                args: ['$price', '$taxRate'],
                lang: 'js' as const
              }
            }
          }
        }
      ]

      const result = translator.translate(pipeline)

      expect(result.sql).toContain('json_set')
      expect(result.sql).toContain("'$.totalWithTax'")
      expect(result.sql).toContain('__FUNCTION__')
    })

    it('translates $set (alias for $addFields) with $function', () => {
      const pipeline = [
        {
          $set: {
            processed: {
              $function: {
                body: 'function(status) { return status === "complete"; }',
                args: ['$status'],
                lang: 'js' as const
              }
            }
          }
        }
      ]

      const result = translator.translate(pipeline)

      expect(result.sql).toContain('json_set')
      expect(result.sql).toContain('__FUNCTION__')
    })
  })

  describe('utility functions', () => {
    describe('isFunctionOperator', () => {
      it('returns true for $function operator', () => {
        expect(isFunctionOperator({ $function: { body: 'x', args: [], lang: 'js' } })).toBe(true)
      })

      it('returns false for other operators', () => {
        expect(isFunctionOperator({ $add: [1, 2] })).toBe(false)
        expect(isFunctionOperator({ $concat: ['a', 'b'] })).toBe(false)
      })

      it('returns false for non-objects', () => {
        expect(isFunctionOperator(null)).toBe(false)
        expect(isFunctionOperator(undefined)).toBe(false)
        expect(isFunctionOperator('string')).toBe(false)
        expect(isFunctionOperator(123)).toBe(false)
      })
    })

    describe('createFunctionExpression', () => {
      it('creates FunctionExpression from spec with field references', () => {
        const spec = {
          body: 'function(a, b) { return a + b; }',
          args: ['$x', '$y'],
          lang: 'js' as const
        }

        const result = createFunctionExpression(spec)

        expect(result.__type).toBe('function')
        expect(result.body).toBe('function(a, b) { return a + b; }')
        expect(result.argPaths).toEqual(['$.x', '$.y'])
        expect(result.literalArgs.size).toBe(0)
      })

      it('creates FunctionExpression from spec with literal values', () => {
        const spec = {
          body: 'function(x, factor) { return x * factor; }',
          args: ['$value', 10],
          lang: 'js' as const
        }

        const result = createFunctionExpression(spec)

        expect(result.argPaths).toEqual(['$.value'])
        expect(result.literalArgs.get(1)).toBe(10)
      })

      it('handles function body as actual function', () => {
        const fn = function (x: number) { return x * 2 }
        const spec = {
          body: fn,
          args: ['$num'],
          lang: 'js' as const
        }

        const result = createFunctionExpression(spec)

        expect(result.body).toContain('function')
        expect(result.body).toContain('return x * 2')
      })
    })

    describe('parseFunctionPlaceholder', () => {
      it('parses function marker from SQL', () => {
        const params: unknown[] = []
        const expr = {
          $function: {
            body: 'function(x) { return x * 2; }',
            args: ['$field'],
            lang: 'js' as const
          }
        }
        const sql = translateExpression(expr, params)

        const result = parseFunctionPlaceholder(sql)

        expect(result).not.toBeNull()
        expect(result!.__type).toBe('function')
        expect(result!.body).toBe('function(x) { return x * 2; }')
        expect(result!.argPaths).toEqual(['$.field'])
      })

      it('parses marker with multiple arguments', () => {
        const params: unknown[] = []
        const expr = {
          $function: {
            body: 'function(a, b) { return a + b; }',
            args: ['$x', '$y'],
            lang: 'js' as const
          }
        }
        const sql = translateExpression(expr, params)

        const result = parseFunctionPlaceholder(sql)

        expect(result!.argPaths).toEqual(['$.x', '$.y'])
      })

      it('parses marker with literal args', () => {
        const params: unknown[] = []
        const expr = {
          $function: {
            body: 'function(x, n) { return x * n; }',
            args: ['$val', 5],
            lang: 'js' as const
          }
        }
        const sql = translateExpression(expr, params)

        const result = parseFunctionPlaceholder(sql)

        expect(result!.literalArgs[1]).toBe(5)
      })

      it('returns null for non-marker SQL', () => {
        expect(parseFunctionPlaceholder('SELECT * FROM table')).toBeNull()
        expect(parseFunctionPlaceholder("json_extract(data, '$.field')")).toBeNull()
      })
    })

    describe('hasFunctionPlaceholders', () => {
      it('returns true for SQL with function markers', () => {
        const params: unknown[] = []
        const expr = {
          $function: {
            body: 'x => x',
            args: ['$x'],
            lang: 'js' as const
          }
        }
        const sql = translateExpression(expr, params)

        expect(hasFunctionPlaceholders(sql)).toBe(true)
      })

      it('returns false for SQL without function markers', () => {
        expect(hasFunctionPlaceholders('SELECT * FROM table')).toBe(false)
        expect(hasFunctionPlaceholders("json_extract(data, '$.field')")).toBe(false)
      })
    })
  })

  describe('complex scenarios', () => {
    const translator = new AggregationTranslator('data')

    beforeEach(() => {
      resetFunctionIdCounter()
    })

    it('combines $function with other expressions in $project', () => {
      const pipeline = [
        {
          $project: {
            name: 1,
            total: { $add: ['$price', '$tax'] },
            custom: {
              $function: {
                body: 'function(x) { return x.toUpperCase(); }',
                args: ['$category'],
                lang: 'js' as const
              }
            }
          }
        }
      ]

      const result = translator.translate(pipeline)

      expect(result.sql).toContain("'name'")
      expect(result.sql).toContain("'total'")
      expect(result.sql).toContain('+')
      expect(result.sql).toContain("'custom'")
      expect(result.sql).toContain('__FUNCTION__')
    })

    it('uses $function result in $cond', () => {
      const pipeline = [
        {
          $project: {
            status: {
              $cond: {
                if: {
                  $function: {
                    body: 'function(v) { return v > 100; }',
                    args: ['$value'],
                    lang: 'js' as const
                  }
                },
                then: 'high',
                else: 'low'
              }
            }
          }
        }
      ]

      const result = translator.translate(pipeline)

      expect(result.sql).toContain('CASE WHEN')
      expect(result.sql).toContain('__FUNCTION__')
      expect(result.sql).toContain('THEN')
      expect(result.sql).toContain('ELSE')
    })

    it('handles $function after $match stage', () => {
      const pipeline = [
        { $match: { status: 'active' } },
        {
          $project: {
            processedValue: {
              $function: {
                body: 'function(x) { return x * 2; }',
                args: ['$value'],
                lang: 'js' as const
              }
            }
          }
        }
      ]

      const result = translator.translate(pipeline)

      expect(result.sql).toContain('WHERE')
      expect(result.sql).toContain('__FUNCTION__')
    })

    it('handles multiple $function calls in pipeline', () => {
      const pipeline = [
        {
          $addFields: {
            step1: {
              $function: {
                body: 'function(x) { return x + 1; }',
                args: ['$count'],
                lang: 'js' as const
              }
            }
          }
        },
        {
          $project: {
            step2: {
              $function: {
                body: 'function(x) { return x * 2; }',
                args: ['$step1'],
                lang: 'js' as const
              }
            }
          }
        }
      ]

      const result = translator.translate(pipeline)

      const matches = result.sql.match(/__FUNCTION__/g)
      expect(matches).toHaveLength(2)
    })

    it('preserves argOrder for proper argument reconstruction', () => {
      const params: unknown[] = []
      const expr = {
        $function: {
          body: 'function(a, b, c) { return a + b + c; }',
          args: ['$x', 10, '$y'],
          lang: 'js' as const
        }
      }

      const sql = translateExpression(expr, params)
      const parsed = parseFunctionPlaceholder(sql)

      expect(parsed!.argOrder).toEqual([
        { type: 'field', path: '$.x' },
        { type: 'literal', index: 1 },
        { type: 'field', path: '$.y' }
      ])
    })
  })
})
