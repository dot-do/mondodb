/// MongoDB selector builder for mongo.do
library;

import 'types.dart';

/// Creates a new selector builder
SelectorBuilder get where => SelectorBuilder();

/// Fluent interface for building MongoDB query selectors
class SelectorBuilder {
  final Map<String, dynamic> _query = {};
  Map<String, dynamic>? _sort;
  Map<String, dynamic>? _projection;
  int? _skip;
  int? _limit;

  /// Get the raw query document
  Map<String, dynamic> get query => Map.unmodifiable(_query);

  /// Get the raw selector map for the query
  Map<String, dynamic> get map => _buildMap();

  Map<String, dynamic> _buildMap() {
    final result = Map<String, dynamic>.from(_query);
    return result;
  }

  /// Build find options from this selector
  FindOptions? buildOptions() {
    if (_sort == null && _projection == null && _skip == null && _limit == null) {
      return null;
    }
    return FindOptions(
      sort: _sort,
      projection: _projection,
      skip: _skip,
      limit: _limit,
    );
  }

  /// Equality comparison
  SelectorBuilder eq(String field, dynamic value) {
    _query[field] = value;
    return this;
  }

  /// Not equal comparison
  SelectorBuilder ne(String field, dynamic value) {
    _addOperator(field, '\$ne', value);
    return this;
  }

  /// Greater than comparison
  SelectorBuilder gt(String field, dynamic value) {
    _addOperator(field, '\$gt', value);
    return this;
  }

  /// Greater than or equal comparison
  SelectorBuilder gte(String field, dynamic value) {
    _addOperator(field, '\$gte', value);
    return this;
  }

  /// Less than comparison
  SelectorBuilder lt(String field, dynamic value) {
    _addOperator(field, '\$lt', value);
    return this;
  }

  /// Less than or equal comparison
  SelectorBuilder lte(String field, dynamic value) {
    _addOperator(field, '\$lte', value);
    return this;
  }

  /// In array comparison
  SelectorBuilder inList(String field, List<dynamic> values) {
    _addOperator(field, '\$in', values);
    return this;
  }

  /// Not in array comparison
  SelectorBuilder nin(String field, List<dynamic> values) {
    _addOperator(field, '\$nin', values);
    return this;
  }

  /// Field exists check
  SelectorBuilder exists(String field, [bool exists = true]) {
    _addOperator(field, '\$exists', exists);
    return this;
  }

  /// Type check
  SelectorBuilder type(String field, dynamic type) {
    _addOperator(field, '\$type', type);
    return this;
  }

  /// Regex match
  SelectorBuilder regex(String field, String pattern, {String? options}) {
    _addOperator(field, '\$regex', pattern);
    if (options != null) {
      _addOperator(field, '\$options', options);
    }
    return this;
  }

  /// Array element match
  SelectorBuilder elemMatch(String field, Map<String, dynamic> query) {
    _addOperator(field, '\$elemMatch', query);
    return this;
  }

  /// Array size match
  SelectorBuilder size(String field, int size) {
    _addOperator(field, '\$size', size);
    return this;
  }

  /// Array contains all
  SelectorBuilder all(String field, List<dynamic> values) {
    _addOperator(field, '\$all', values);
    return this;
  }

  /// Bitwise AND
  SelectorBuilder bitsAllSet(String field, dynamic mask) {
    _addOperator(field, '\$bitsAllSet', mask);
    return this;
  }

  /// Bitwise OR
  SelectorBuilder bitsAnySet(String field, dynamic mask) {
    _addOperator(field, '\$bitsAnySet', mask);
    return this;
  }

  /// Logical AND
  SelectorBuilder and(List<Map<String, dynamic>> conditions) {
    _query['\$and'] = conditions;
    return this;
  }

  /// Logical OR
  SelectorBuilder or(List<Map<String, dynamic>> conditions) {
    _query['\$or'] = conditions;
    return this;
  }

  /// Logical NOR
  SelectorBuilder nor(List<Map<String, dynamic>> conditions) {
    _query['\$nor'] = conditions;
    return this;
  }

  /// Logical NOT
  SelectorBuilder not(String field, Map<String, dynamic> expression) {
    _addOperator(field, '\$not', expression);
    return this;
  }

  /// Text search
  SelectorBuilder text(String search, {String? language, bool? caseSensitive, bool? diacriticSensitive}) {
    final textQuery = <String, dynamic>{'\$search': search};
    if (language != null) textQuery['\$language'] = language;
    if (caseSensitive != null) textQuery['\$caseSensitive'] = caseSensitive;
    if (diacriticSensitive != null) textQuery['\$diacriticSensitive'] = diacriticSensitive;
    _query['\$text'] = textQuery;
    return this;
  }

  /// Where clause with JavaScript expression
  SelectorBuilder whereExpr(String jsExpression) {
    _query['\$where'] = jsExpression;
    return this;
  }

  /// Add a comment to the query
  SelectorBuilder comment(String comment) {
    _query['\$comment'] = comment;
    return this;
  }

  /// Sort by field
  SelectorBuilder sortBy(String field, [SortDirection direction = SortDirection.ascending]) {
    _sort ??= {};
    _sort![field] = direction.value;
    return this;
  }

  /// Skip documents
  SelectorBuilder skip(int count) {
    _skip = count;
    return this;
  }

  /// Limit documents
  SelectorBuilder limit(int count) {
    _limit = count;
    return this;
  }

  /// Project fields
  SelectorBuilder fields(Map<String, dynamic> projection) {
    _projection = projection;
    return this;
  }

  /// Include field in projection
  SelectorBuilder include(String field) {
    _projection ??= {};
    _projection![field] = 1;
    return this;
  }

  /// Exclude field from projection
  SelectorBuilder exclude(String field) {
    _projection ??= {};
    _projection![field] = 0;
    return this;
  }

  /// Match by ObjectId
  SelectorBuilder id(dynamic id) {
    if (id is ObjectId) {
      _query['_id'] = id.toJson();
    } else {
      _query['_id'] = id;
    }
    return this;
  }

  /// Range query (combines gte and lte)
  SelectorBuilder range(String field, dynamic min, dynamic max) {
    _query[field] = {'\$gte': min, '\$lte': max};
    return this;
  }

  /// Match one of many values
  SelectorBuilder oneOf(String field, List<dynamic> values) {
    return inList(field, values);
  }

  /// Match raw query
  SelectorBuilder raw(Map<String, dynamic> query) {
    _query.addAll(query);
    return this;
  }

  void _addOperator(String field, String operator, dynamic value) {
    if (_query[field] is Map) {
      (_query[field] as Map<String, dynamic>)[operator] = value;
    } else {
      _query[field] = {operator: value};
    }
  }
}

/// Creates a modifier builder
ModifierBuilder get modify => ModifierBuilder();

/// Fluent interface for building MongoDB update modifiers
class ModifierBuilder {
  final Map<String, dynamic> _modifiers = {};

  /// Get the raw modifier document
  Map<String, dynamic> get map => Map.unmodifiable(_modifiers);

  /// Set field values
  ModifierBuilder set(String field, dynamic value) {
    _addModifier('\$set', field, value);
    return this;
  }

  /// Set multiple field values
  ModifierBuilder setAll(Map<String, dynamic> values) {
    _modifiers['\$set'] = {
      ...(_modifiers['\$set'] as Map<String, dynamic>? ?? {}),
      ...values,
    };
    return this;
  }

  /// Unset fields
  ModifierBuilder unset(String field) {
    _addModifier('\$unset', field, '');
    return this;
  }

  /// Increment field
  ModifierBuilder inc(String field, num value) {
    _addModifier('\$inc', field, value);
    return this;
  }

  /// Multiply field
  ModifierBuilder mul(String field, num value) {
    _addModifier('\$mul', field, value);
    return this;
  }

  /// Set minimum value
  ModifierBuilder min(String field, dynamic value) {
    _addModifier('\$min', field, value);
    return this;
  }

  /// Set maximum value
  ModifierBuilder max(String field, dynamic value) {
    _addModifier('\$max', field, value);
    return this;
  }

  /// Rename field
  ModifierBuilder rename(String oldName, String newName) {
    _addModifier('\$rename', oldName, newName);
    return this;
  }

  /// Set current date
  ModifierBuilder currentDate(String field, {bool timestamp = false}) {
    _addModifier('\$currentDate', field, timestamp ? {'\$type': 'timestamp'} : true);
    return this;
  }

  /// Push value to array
  ModifierBuilder push(String field, dynamic value) {
    _addModifier('\$push', field, value);
    return this;
  }

  /// Push multiple values to array
  ModifierBuilder pushAll(String field, List<dynamic> values, {int? slice, dynamic sort, int? position}) {
    final pushOp = <String, dynamic>{'\$each': values};
    if (slice != null) pushOp['\$slice'] = slice;
    if (sort != null) pushOp['\$sort'] = sort;
    if (position != null) pushOp['\$position'] = position;
    _addModifier('\$push', field, pushOp);
    return this;
  }

  /// Add to set (no duplicates)
  ModifierBuilder addToSet(String field, dynamic value) {
    _addModifier('\$addToSet', field, value);
    return this;
  }

  /// Add multiple to set (no duplicates)
  ModifierBuilder addAllToSet(String field, List<dynamic> values) {
    _addModifier('\$addToSet', field, {'\$each': values});
    return this;
  }

  /// Pop from array
  ModifierBuilder pop(String field, {bool first = false}) {
    _addModifier('\$pop', field, first ? -1 : 1);
    return this;
  }

  /// Pull value from array
  ModifierBuilder pull(String field, dynamic value) {
    _addModifier('\$pull', field, value);
    return this;
  }

  /// Pull all values from array
  ModifierBuilder pullAll(String field, List<dynamic> values) {
    _addModifier('\$pullAll', field, values);
    return this;
  }

  /// Bitwise operations
  ModifierBuilder bit(String field, {int? and, int? or, int? xor}) {
    final bitOp = <String, int>{};
    if (and != null) bitOp['and'] = and;
    if (or != null) bitOp['or'] = or;
    if (xor != null) bitOp['xor'] = xor;
    _addModifier('\$bit', field, bitOp);
    return this;
  }

  void _addModifier(String operator, String field, dynamic value) {
    _modifiers[operator] ??= <String, dynamic>{};
    (_modifiers[operator] as Map<String, dynamic>)[field] = value;
  }
}
