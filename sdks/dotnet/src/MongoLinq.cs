// ============================================================================
// MongoLinq - LINQ to MongoDB query provider for .NET
// ============================================================================

using System.Collections;
using System.Linq.Expressions;
using System.Reflection;

namespace Mongo.Do;

// ============================================================================
// MongoQueryable<T> - LINQ queryable implementation
// ============================================================================

/// <summary>
/// LINQ queryable implementation for MongoDB collections.
/// </summary>
/// <typeparam name="TDocument">The document type.</typeparam>
public class MongoQueryable<TDocument> : IQueryable<TDocument>, IAsyncEnumerable<TDocument>
{
    private readonly MongoQueryProvider _provider;
    private readonly Expression _expression;

    /// <summary>
    /// Creates a new queryable for a collection.
    /// </summary>
    internal MongoQueryable(MongoQueryProvider provider)
    {
        _provider = provider;
        _expression = Expression.Constant(this);
    }

    /// <summary>
    /// Creates a new queryable with a specific expression.
    /// </summary>
    internal MongoQueryable(MongoQueryProvider provider, Expression expression)
    {
        _provider = provider;
        _expression = expression;
    }

    /// <inheritdoc />
    public Type ElementType => typeof(TDocument);

    /// <inheritdoc />
    public Expression Expression => _expression;

    /// <inheritdoc />
    public IQueryProvider Provider => _provider;

    /// <inheritdoc />
    public IEnumerator<TDocument> GetEnumerator()
    {
        return _provider.Execute<IEnumerable<TDocument>>(_expression).GetEnumerator();
    }

    /// <inheritdoc />
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    /// <inheritdoc />
    public async IAsyncEnumerator<TDocument> GetAsyncEnumerator(CancellationToken cancellationToken = default)
    {
        var results = await _provider.ExecuteAsync<IEnumerable<TDocument>>(_expression, cancellationToken);
        foreach (var item in results)
        {
            yield return item;
        }
    }
}

// ============================================================================
// MongoQueryProvider - LINQ query provider
// ============================================================================

/// <summary>
/// LINQ query provider for MongoDB queries.
/// </summary>
public class MongoQueryProvider : IQueryProvider
{
    private readonly IRpcTransport _transport;
    private readonly string _dbName;
    private readonly string _collectionName;

    /// <summary>
    /// Creates a new query provider.
    /// </summary>
    internal MongoQueryProvider(IRpcTransport transport, string dbName, string collectionName)
    {
        _transport = transport;
        _dbName = dbName;
        _collectionName = collectionName;
    }

    /// <inheritdoc />
    public IQueryable CreateQuery(Expression expression)
    {
        var elementType = expression.Type.GetGenericArguments().FirstOrDefault() ?? expression.Type;
        var queryableType = typeof(MongoQueryable<>).MakeGenericType(elementType);
        return (IQueryable)Activator.CreateInstance(queryableType, this, expression)!;
    }

    /// <inheritdoc />
    public IQueryable<TElement> CreateQuery<TElement>(Expression expression)
    {
        return new MongoQueryable<TElement>(this, expression);
    }

    /// <inheritdoc />
    public object? Execute(Expression expression)
    {
        return ExecuteAsync<object>(expression, CancellationToken.None).GetAwaiter().GetResult();
    }

    /// <inheritdoc />
    public TResult Execute<TResult>(Expression expression)
    {
        return ExecuteAsync<TResult>(expression, CancellationToken.None).GetAwaiter().GetResult();
    }

    /// <summary>
    /// Executes the query asynchronously.
    /// </summary>
    public async Task<TResult> ExecuteAsync<TResult>(Expression expression, CancellationToken cancellationToken)
    {
        var visitor = new MongoExpressionVisitor();
        var query = visitor.Translate(expression);

        var result = await _transport.CallAsync("find", cancellationToken, _dbName, _collectionName, query.Filter, query.Options);

        return ConvertResult<TResult>(result, expression);
    }

    private static TResult ConvertResult<TResult>(object? result, Expression expression)
    {
        if (result is null)
        {
            return default!;
        }

        // Handle single result queries (First, Single, etc.)
        if (IsSingleResultQuery(expression))
        {
            if (result is IEnumerable<object> enumerable)
            {
                var first = enumerable.FirstOrDefault();
                return ConvertDocument<TResult>(first);
            }
            return ConvertDocument<TResult>(result);
        }

        // Handle enumerable results
        if (typeof(IEnumerable).IsAssignableFrom(typeof(TResult)))
        {
            if (result is IEnumerable<object> enumerable)
            {
                var elementType = typeof(TResult).GetGenericArguments().FirstOrDefault() ?? typeof(object);
                var list = CreateListOfType(elementType);

                foreach (var item in enumerable)
                {
                    var converted = ConvertDocumentToType(item, elementType);
                    list.Add(converted);
                }

                return (TResult)list;
            }
        }

        return (TResult)result;
    }

    private static bool IsSingleResultQuery(Expression expression)
    {
        if (expression is MethodCallExpression methodCall)
        {
            var methodName = methodCall.Method.Name;
            return methodName is "First" or "FirstOrDefault" or "Single" or "SingleOrDefault" or "Last" or "LastOrDefault" or "Count" or "Any" or "All" or "Sum" or "Average" or "Min" or "Max";
        }
        return false;
    }

    private static T ConvertDocument<T>(object? obj)
    {
        if (obj is null) return default!;
        if (obj is T typed) return typed;
        return (T)ConvertDocumentToType(obj, typeof(T))!;
    }

    private static object? ConvertDocumentToType(object? obj, Type targetType)
    {
        if (obj is null) return null;
        if (targetType.IsInstanceOfType(obj)) return obj;

        if (targetType == typeof(BsonDocument) && obj is Dictionary<string, object?> dict)
        {
            var doc = new BsonDocument();
            foreach (var (key, value) in dict)
            {
                doc.Add(key, BsonValue.FromObject(value));
            }
            return doc;
        }

        // Use JSON serialization for complex types
        return obj;
    }

    private static IList CreateListOfType(Type elementType)
    {
        var listType = typeof(List<>).MakeGenericType(elementType);
        return (IList)Activator.CreateInstance(listType)!;
    }
}

// ============================================================================
// MongoExpressionVisitor - Translates LINQ expressions to MongoDB queries
// ============================================================================

/// <summary>
/// Translates LINQ expression trees to MongoDB query documents.
/// </summary>
internal class MongoExpressionVisitor : ExpressionVisitor
{
    private readonly Stack<BsonDocument> _filterStack = new();
    private readonly Dictionary<string, object?> _options = new();

    /// <summary>
    /// Translates an expression to a MongoDB query.
    /// </summary>
    public MongoQuery Translate(Expression expression)
    {
        _filterStack.Clear();
        _options.Clear();
        _filterStack.Push(new BsonDocument());

        Visit(expression);

        return new MongoQuery
        {
            Filter = _filterStack.Count > 0 ? _filterStack.Peek() : new BsonDocument(),
            Options = _options
        };
    }

    protected override Expression VisitMethodCall(MethodCallExpression node)
    {
        switch (node.Method.Name)
        {
            case "Where":
                TranslateWhere(node);
                break;

            case "OrderBy":
            case "ThenBy":
                TranslateOrderBy(node, ascending: true);
                break;

            case "OrderByDescending":
            case "ThenByDescending":
                TranslateOrderBy(node, ascending: false);
                break;

            case "Take":
                TranslateTake(node);
                break;

            case "Skip":
                TranslateSkip(node);
                break;

            case "Select":
                TranslateSelect(node);
                break;

            case "Count":
            case "LongCount":
                _options["count"] = true;
                break;

            case "Any":
                _options["limit"] = 1;
                _options["any"] = true;
                break;

            case "First":
            case "FirstOrDefault":
                _options["limit"] = 1;
                break;

            case "Single":
            case "SingleOrDefault":
                _options["limit"] = 2; // Take 2 to detect multiple results
                break;

            default:
                // Continue visiting for other methods
                break;
        }

        // Visit the source expression (the IQueryable that the method is called on)
        if (node.Arguments.Count > 0)
        {
            Visit(node.Arguments[0]);
        }

        return node;
    }

    private void TranslateWhere(MethodCallExpression node)
    {
        if (node.Arguments.Count >= 2)
        {
            var predicate = StripQuotes(node.Arguments[1]);
            if (predicate is LambdaExpression lambda)
            {
                var filter = TranslatePredicate(lambda.Body);
                MergeFilter(filter);
            }
        }
    }

    private void TranslateOrderBy(MethodCallExpression node, bool ascending)
    {
        if (node.Arguments.Count >= 2)
        {
            var selector = StripQuotes(node.Arguments[1]);
            if (selector is LambdaExpression lambda)
            {
                var field = GetFieldName(lambda.Body);
                if (field is not null)
                {
                    if (!_options.ContainsKey("sort"))
                    {
                        _options["sort"] = new Dictionary<string, int>();
                    }
                    ((Dictionary<string, int>)_options["sort"]!)[field] = ascending ? 1 : -1;
                }
            }
        }
    }

    private void TranslateTake(MethodCallExpression node)
    {
        if (node.Arguments.Count >= 2)
        {
            var count = GetConstantValue<int>(node.Arguments[1]);
            _options["limit"] = count;
        }
    }

    private void TranslateSkip(MethodCallExpression node)
    {
        if (node.Arguments.Count >= 2)
        {
            var count = GetConstantValue<int>(node.Arguments[1]);
            _options["skip"] = count;
        }
    }

    private void TranslateSelect(MethodCallExpression node)
    {
        if (node.Arguments.Count >= 2)
        {
            var selector = StripQuotes(node.Arguments[1]);
            if (selector is LambdaExpression lambda)
            {
                var projection = TranslateProjection(lambda.Body);
                if (projection.Count > 0)
                {
                    _options["projection"] = projection;
                }
            }
        }
    }

    private BsonDocument TranslatePredicate(Expression expression)
    {
        return expression switch
        {
            BinaryExpression binary => TranslateBinary(binary),
            UnaryExpression { NodeType: ExpressionType.Not } unary => TranslateNot(unary),
            MethodCallExpression methodCall => TranslateMethodCall(methodCall),
            MemberExpression member when member.Type == typeof(bool) => TranslateBooleanMember(member),
            _ => new BsonDocument()
        };
    }

    private BsonDocument TranslateBinary(BinaryExpression binary)
    {
        if (binary.NodeType == ExpressionType.AndAlso)
        {
            var left = TranslatePredicate(binary.Left);
            var right = TranslatePredicate(binary.Right);
            return new BsonDocument("$and", new BsonArray { left, right });
        }

        if (binary.NodeType == ExpressionType.OrElse)
        {
            var left = TranslatePredicate(binary.Left);
            var right = TranslatePredicate(binary.Right);
            return new BsonDocument("$or", new BsonArray { left, right });
        }

        var field = GetFieldName(binary.Left) ?? GetFieldName(binary.Right);
        var value = GetConstantValue(binary.Left) ?? GetConstantValue(binary.Right);

        if (field is null) return new BsonDocument();

        var bsonValue = BsonValue.FromObject(value);

        return binary.NodeType switch
        {
            ExpressionType.Equal => new BsonDocument(field, bsonValue),
            ExpressionType.NotEqual => new BsonDocument(field, new BsonDocument("$ne", bsonValue)),
            ExpressionType.GreaterThan => new BsonDocument(field, new BsonDocument("$gt", bsonValue)),
            ExpressionType.GreaterThanOrEqual => new BsonDocument(field, new BsonDocument("$gte", bsonValue)),
            ExpressionType.LessThan => new BsonDocument(field, new BsonDocument("$lt", bsonValue)),
            ExpressionType.LessThanOrEqual => new BsonDocument(field, new BsonDocument("$lte", bsonValue)),
            _ => new BsonDocument()
        };
    }

    private BsonDocument TranslateNot(UnaryExpression unary)
    {
        var operand = TranslatePredicate(unary.Operand);
        return new BsonDocument("$nor", new BsonArray { operand });
    }

    private BsonDocument TranslateMethodCall(MethodCallExpression methodCall)
    {
        var methodName = methodCall.Method.Name;

        // String methods
        if (methodCall.Method.DeclaringType == typeof(string))
        {
            var field = GetFieldName(methodCall.Object);
            if (field is null) return new BsonDocument();

            return methodName switch
            {
                "Contains" when methodCall.Arguments.Count == 1 =>
                    new BsonDocument(field, new BsonDocument("$regex", new BsonString(GetConstantValue<string>(methodCall.Arguments[0]) ?? ""))),

                "StartsWith" when methodCall.Arguments.Count == 1 =>
                    new BsonDocument(field, new BsonDocument("$regex", new BsonString($"^{GetConstantValue<string>(methodCall.Arguments[0])}"))),

                "EndsWith" when methodCall.Arguments.Count == 1 =>
                    new BsonDocument(field, new BsonDocument("$regex", new BsonString($"{GetConstantValue<string>(methodCall.Arguments[0])}$"))),

                _ => new BsonDocument()
            };
        }

        // Enumerable.Contains
        if (methodCall.Method.Name == "Contains" && methodCall.Method.DeclaringType == typeof(Enumerable))
        {
            var collection = GetConstantValue<IEnumerable>(methodCall.Arguments[0]);
            var field = GetFieldName(methodCall.Arguments[1]);

            if (field is not null && collection is not null)
            {
                var values = new BsonArray();
                foreach (var item in collection)
                {
                    values.Add(BsonValue.FromObject(item));
                }
                return new BsonDocument(field, new BsonDocument("$in", values));
            }
        }

        // List.Contains, Array.Contains
        if (methodCall.Method.Name == "Contains" && methodCall.Arguments.Count == 1)
        {
            var collection = GetConstantValue<IEnumerable>(methodCall.Object);
            var field = GetFieldName(methodCall.Arguments[0]);

            if (field is not null && collection is not null)
            {
                var values = new BsonArray();
                foreach (var item in collection)
                {
                    values.Add(BsonValue.FromObject(item));
                }
                return new BsonDocument(field, new BsonDocument("$in", values));
            }
        }

        return new BsonDocument();
    }

    private BsonDocument TranslateBooleanMember(MemberExpression member)
    {
        var field = GetFieldName(member);
        return field is not null ? new BsonDocument(field, BsonBoolean.True) : new BsonDocument();
    }

    private Dictionary<string, int> TranslateProjection(Expression expression)
    {
        var projection = new Dictionary<string, int>();

        if (expression is NewExpression newExpr)
        {
            foreach (var arg in newExpr.Arguments)
            {
                var field = GetFieldName(arg);
                if (field is not null)
                {
                    projection[field] = 1;
                }
            }
        }
        else if (expression is MemberInitExpression memberInit)
        {
            foreach (var binding in memberInit.Bindings)
            {
                if (binding is MemberAssignment assignment)
                {
                    var field = GetFieldName(assignment.Expression);
                    if (field is not null)
                    {
                        projection[field] = 1;
                    }
                }
            }
        }
        else
        {
            var field = GetFieldName(expression);
            if (field is not null)
            {
                projection[field] = 1;
            }
        }

        return projection;
    }

    private void MergeFilter(BsonDocument filter)
    {
        if (filter.Count == 0) return;

        var current = _filterStack.Peek();
        if (current.Count == 0)
        {
            foreach (var (key, value) in filter)
            {
                current[key] = value;
            }
        }
        else
        {
            // Wrap both in $and
            var combined = new BsonDocument("$and", new BsonArray { current, filter });
            _filterStack.Pop();
            _filterStack.Push(combined);
        }
    }

    private static string? GetFieldName(Expression? expression)
    {
        return expression switch
        {
            MemberExpression member => GetMemberPath(member),
            UnaryExpression { NodeType: ExpressionType.Convert or ExpressionType.ConvertChecked } unary => GetFieldName(unary.Operand),
            _ => null
        };
    }

    private static string GetMemberPath(MemberExpression member)
    {
        var parts = new List<string>();
        Expression? current = member;

        while (current is MemberExpression m)
        {
            // Convert to camelCase for MongoDB convention
            var name = ToCamelCase(m.Member.Name);

            // Handle _id field
            if (name is "id" or "Id" && m.Expression is ParameterExpression)
            {
                name = "_id";
            }

            parts.Insert(0, name);
            current = m.Expression;
        }

        return string.Join(".", parts);
    }

    private static string ToCamelCase(string name)
    {
        if (string.IsNullOrEmpty(name)) return name;
        if (name.Length == 1) return name.ToLowerInvariant();
        return char.ToLowerInvariant(name[0]) + name[1..];
    }

    private static object? GetConstantValue(Expression? expression)
    {
        return expression switch
        {
            ConstantExpression constant => constant.Value,
            MemberExpression member when member.Expression is ConstantExpression ce =>
                GetMemberValue(member.Member, ce.Value),
            UnaryExpression { NodeType: ExpressionType.Convert or ExpressionType.ConvertChecked } unary =>
                GetConstantValue(unary.Operand),
            _ => null
        };
    }

    private static T? GetConstantValue<T>(Expression expression)
    {
        var value = GetConstantValue(expression);
        if (value is T typed) return typed;
        if (value is null) return default;
        return (T)Convert.ChangeType(value, typeof(T));
    }

    private static object? GetMemberValue(MemberInfo member, object? container)
    {
        return member switch
        {
            FieldInfo field => field.GetValue(container),
            PropertyInfo property => property.GetValue(container),
            _ => null
        };
    }

    private static Expression StripQuotes(Expression expression)
    {
        while (expression is UnaryExpression { NodeType: ExpressionType.Quote } unary)
        {
            expression = unary.Operand;
        }
        return expression;
    }
}

/// <summary>
/// Represents a translated MongoDB query.
/// </summary>
internal class MongoQuery
{
    public required BsonDocument Filter { get; init; }
    public required Dictionary<string, object?> Options { get; init; }
}

// ============================================================================
// MongoQueryable Extensions
// ============================================================================

/// <summary>
/// Extension methods for async LINQ operations.
/// </summary>
public static class MongoQueryableExtensions
{
    /// <summary>
    /// Gets a collection as an IQueryable.
    /// </summary>
    public static IQueryable<TDocument> AsQueryable<TDocument>(this MongoCollection<TDocument> collection)
        where TDocument : class
    {
        // Access the internal transport via reflection or add an internal accessor
        var transportField = typeof(MongoCollection<TDocument>).GetField("_transport", BindingFlags.NonPublic | BindingFlags.Instance);
        var dbNameField = typeof(MongoCollection<TDocument>).GetField("_dbName", BindingFlags.NonPublic | BindingFlags.Instance);
        var nameField = typeof(MongoCollection<TDocument>).GetField("_name", BindingFlags.NonPublic | BindingFlags.Instance);

        if (transportField is null || dbNameField is null || nameField is null)
            throw new InvalidOperationException("Cannot access collection internals");

        var transport = (IRpcTransport)transportField.GetValue(collection)!;
        var dbName = (string)dbNameField.GetValue(collection)!;
        var name = (string)nameField.GetValue(collection)!;

        var provider = new MongoQueryProvider(transport, dbName, name);
        return new MongoQueryable<TDocument>(provider);
    }

    /// <summary>
    /// Executes the query and returns results as a list asynchronously.
    /// </summary>
    public static async Task<List<T>> ToListAsync<T>(this IQueryable<T> source, CancellationToken cancellationToken = default)
    {
        if (source is MongoQueryable<T> mongoQueryable)
        {
            var list = new List<T>();
            await foreach (var item in mongoQueryable.WithCancellation(cancellationToken))
            {
                list.Add(item);
            }
            return list;
        }

        return source.ToList();
    }

    /// <summary>
    /// Executes the query and returns the first result asynchronously.
    /// </summary>
    public static async Task<T?> FirstOrDefaultAsync<T>(this IQueryable<T> source, CancellationToken cancellationToken = default)
    {
        if (source is MongoQueryable<T> mongoQueryable)
        {
            await foreach (var item in mongoQueryable.WithCancellation(cancellationToken))
            {
                return item;
            }
            return default;
        }

        return source.FirstOrDefault();
    }

    /// <summary>
    /// Executes the query and returns the first result asynchronously.
    /// </summary>
    public static async Task<T> FirstAsync<T>(this IQueryable<T> source, CancellationToken cancellationToken = default)
    {
        var result = await FirstOrDefaultAsync(source, cancellationToken);
        return result ?? throw new InvalidOperationException("Sequence contains no elements");
    }

    /// <summary>
    /// Executes the query and returns the single result asynchronously.
    /// </summary>
    public static async Task<T?> SingleOrDefaultAsync<T>(this IQueryable<T> source, CancellationToken cancellationToken = default)
    {
        if (source is MongoQueryable<T> mongoQueryable)
        {
            T? result = default;
            bool found = false;

            await foreach (var item in mongoQueryable.WithCancellation(cancellationToken))
            {
                if (found)
                {
                    throw new InvalidOperationException("Sequence contains more than one element");
                }
                result = item;
                found = true;
            }

            return result;
        }

        return source.SingleOrDefault();
    }

    /// <summary>
    /// Executes the query and returns the single result asynchronously.
    /// </summary>
    public static async Task<T> SingleAsync<T>(this IQueryable<T> source, CancellationToken cancellationToken = default)
    {
        var result = await SingleOrDefaultAsync(source, cancellationToken);
        return result ?? throw new InvalidOperationException("Sequence contains no elements");
    }

    /// <summary>
    /// Executes the query and returns whether any results exist asynchronously.
    /// </summary>
    public static async Task<bool> AnyAsync<T>(this IQueryable<T> source, CancellationToken cancellationToken = default)
    {
        if (source is MongoQueryable<T> mongoQueryable)
        {
            await foreach (var _ in mongoQueryable.WithCancellation(cancellationToken))
            {
                return true;
            }
            return false;
        }

        return source.Any();
    }

    /// <summary>
    /// Executes the query and returns the count asynchronously.
    /// </summary>
    public static async Task<int> CountAsync<T>(this IQueryable<T> source, CancellationToken cancellationToken = default)
    {
        if (source is MongoQueryable<T> mongoQueryable)
        {
            int count = 0;
            await foreach (var _ in mongoQueryable.WithCancellation(cancellationToken))
            {
                count++;
            }
            return count;
        }

        return source.Count();
    }

    /// <summary>
    /// Executes the query and returns the long count asynchronously.
    /// </summary>
    public static async Task<long> LongCountAsync<T>(this IQueryable<T> source, CancellationToken cancellationToken = default)
    {
        return await CountAsync(source, cancellationToken);
    }
}
