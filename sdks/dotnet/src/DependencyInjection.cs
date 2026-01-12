// ============================================================================
// DependencyInjection - ASP.NET Core dependency injection extensions
// ============================================================================

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Mongo.Do;

// ============================================================================
// Service Collection Extensions
// ============================================================================

/// <summary>
/// Extension methods for configuring MongoDB services in an ASP.NET Core application.
/// </summary>
public static class MongoServiceCollectionExtensions
{
    /// <summary>
    /// Adds MongoDB services to the specified IServiceCollection.
    /// </summary>
    /// <param name="services">The IServiceCollection to add services to.</param>
    /// <param name="configureOptions">An action to configure the MongoOptions.</param>
    /// <returns>The IServiceCollection so that additional calls can be chained.</returns>
    /// <example>
    /// <code>
    /// // In Program.cs or Startup.cs
    /// builder.Services.AddDotDoMongo(options =>
    /// {
    ///     options.ConnectionString = "https://db.example.com";
    ///     options.DatabaseName = "myapp";
    /// });
    /// </code>
    /// </example>
    public static IServiceCollection AddDotDoMongo(
        this IServiceCollection services,
        Action<MongoOptions> configureOptions)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configureOptions);

        services.Configure(configureOptions);
        services.TryAddSingleton<IMongoClientFactory, MongoClientFactory>();
        services.TryAddSingleton(sp =>
        {
            var factory = sp.GetRequiredService<IMongoClientFactory>();
            var options = sp.GetRequiredService<IOptions<MongoOptions>>().Value;
            return factory.CreateClient(options);
        });
        services.TryAddScoped(sp =>
        {
            var client = sp.GetRequiredService<MongoClient>();
            var options = sp.GetRequiredService<IOptions<MongoOptions>>().Value;
            return client.GetDatabase(options.DatabaseName ?? "default");
        });

        // Configure the static Mongo class
        services.AddSingleton(sp =>
        {
            var options = sp.GetRequiredService<IOptions<MongoOptions>>().Value;
            Mongo.Configure(new MongoConfig
            {
                Name = options.DatabaseName ?? "default",
                Domain = options.ConnectionString?.Replace("https://", "").Replace("http://", ""),
                AuthToken = options.AuthToken,
                Vector = options.EnableVectorSearch,
                Fulltext = options.EnableFullTextSearch,
                Analytics = options.EnableAnalytics
            });
            return Mongo.Configuration!;
        });

        return services;
    }

    /// <summary>
    /// Adds MongoDB services with a named configuration.
    /// </summary>
    /// <param name="services">The IServiceCollection to add services to.</param>
    /// <param name="name">The name of the configuration.</param>
    /// <param name="configureOptions">An action to configure the MongoOptions.</param>
    /// <returns>The IServiceCollection so that additional calls can be chained.</returns>
    public static IServiceCollection AddDotDoMongo(
        this IServiceCollection services,
        string name,
        Action<MongoOptions> configureOptions)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(name);
        ArgumentNullException.ThrowIfNull(configureOptions);

        services.Configure(name, configureOptions);
        services.TryAddSingleton<IMongoClientFactory, MongoClientFactory>();

        return services;
    }

    /// <summary>
    /// Adds MongoDB services using configuration from IConfiguration.
    /// </summary>
    /// <param name="services">The IServiceCollection to add services to.</param>
    /// <param name="configuration">The configuration section to bind.</param>
    /// <returns>The IServiceCollection so that additional calls can be chained.</returns>
    public static IServiceCollection AddDotDoMongo(
        this IServiceCollection services,
        Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.Configure<MongoOptions>(configuration);
        services.TryAddSingleton<IMongoClientFactory, MongoClientFactory>();
        services.TryAddSingleton(sp =>
        {
            var factory = sp.GetRequiredService<IMongoClientFactory>();
            var options = sp.GetRequiredService<IOptions<MongoOptions>>().Value;
            return factory.CreateClient(options);
        });
        services.TryAddScoped(sp =>
        {
            var client = sp.GetRequiredService<MongoClient>();
            var options = sp.GetRequiredService<IOptions<MongoOptions>>().Value;
            return client.GetDatabase(options.DatabaseName ?? "default");
        });

        return services;
    }
}

// ============================================================================
// MongoOptions - Configuration options for DI
// ============================================================================

/// <summary>
/// Options for configuring the MongoDB client through dependency injection.
/// </summary>
public class MongoOptions
{
    /// <summary>
    /// Gets or sets the connection string (URL to the mongo.do server).
    /// </summary>
    public string? ConnectionString { get; set; }

    /// <summary>
    /// Gets or sets the default database name.
    /// </summary>
    public string? DatabaseName { get; set; }

    /// <summary>
    /// Gets or sets the authentication token.
    /// </summary>
    public string? AuthToken { get; set; }

    /// <summary>
    /// Gets or sets the application name.
    /// </summary>
    public string? ApplicationName { get; set; }

    /// <summary>
    /// Gets or sets the connection timeout.
    /// </summary>
    public TimeSpan ConnectTimeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Gets or sets the socket timeout.
    /// </summary>
    public TimeSpan SocketTimeout { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Gets or sets the server selection timeout.
    /// </summary>
    public TimeSpan ServerSelectionTimeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Gets or sets the maximum connection pool size.
    /// </summary>
    public int MaxConnectionPoolSize { get; set; } = 100;

    /// <summary>
    /// Gets or sets the minimum connection pool size.
    /// </summary>
    public int MinConnectionPoolSize { get; set; } = 0;

    /// <summary>
    /// Gets or sets whether to retry reads.
    /// </summary>
    public bool RetryReads { get; set; } = true;

    /// <summary>
    /// Gets or sets whether to retry writes.
    /// </summary>
    public bool RetryWrites { get; set; } = true;

    /// <summary>
    /// Gets or sets whether vector search is enabled.
    /// </summary>
    public bool EnableVectorSearch { get; set; }

    /// <summary>
    /// Gets or sets whether full-text search is enabled.
    /// </summary>
    public bool EnableFullTextSearch { get; set; }

    /// <summary>
    /// Gets or sets whether analytics are enabled.
    /// </summary>
    public bool EnableAnalytics { get; set; }

    /// <summary>
    /// Converts these options to MongoClientSettings.
    /// </summary>
    internal MongoClientSettings ToClientSettings() => new()
    {
        ConnectTimeout = ConnectTimeout,
        SocketTimeout = SocketTimeout,
        ServerSelectionTimeout = ServerSelectionTimeout,
        MaxConnectionPoolSize = MaxConnectionPoolSize,
        MinConnectionPoolSize = MinConnectionPoolSize,
        RetryReads = RetryReads,
        RetryWrites = RetryWrites,
        AuthToken = AuthToken,
        ApplicationName = ApplicationName
    };
}

// ============================================================================
// IMongoClientFactory - Factory for creating MongoDB clients
// ============================================================================

/// <summary>
/// Factory for creating MongoDB clients.
/// </summary>
public interface IMongoClientFactory
{
    /// <summary>
    /// Creates a MongoDB client with the specified options.
    /// </summary>
    MongoClient CreateClient(MongoOptions options);

    /// <summary>
    /// Creates a MongoDB client with the specified name (for named configurations).
    /// </summary>
    MongoClient CreateClient(string name);
}

/// <summary>
/// Default implementation of IMongoClientFactory.
/// </summary>
internal class MongoClientFactory : IMongoClientFactory
{
    private readonly IOptionsMonitor<MongoOptions> _optionsMonitor;
    private readonly Dictionary<string, MongoClient> _clients = new();
    private readonly object _lock = new();

    public MongoClientFactory(IOptionsMonitor<MongoOptions> optionsMonitor)
    {
        _optionsMonitor = optionsMonitor;
    }

    public MongoClient CreateClient(MongoOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        var connectionString = options.ConnectionString
            ?? throw new InvalidOperationException("ConnectionString is required");

        return new MongoClient(connectionString, options.ToClientSettings());
    }

    public MongoClient CreateClient(string name)
    {
        ArgumentNullException.ThrowIfNull(name);

        lock (_lock)
        {
            if (!_clients.TryGetValue(name, out var client))
            {
                var options = _optionsMonitor.Get(name);
                client = CreateClient(options);
                _clients[name] = client;
            }
            return client;
        }
    }
}

// ============================================================================
// Health Check Extensions
// ============================================================================

/// <summary>
/// Health check extensions for MongoDB.
/// </summary>
public static class MongoHealthCheckExtensions
{
    /// <summary>
    /// Adds a health check for MongoDB connectivity.
    /// </summary>
    public static IHealthChecksBuilder AddMongoHealthCheck(
        this IHealthChecksBuilder builder,
        string name = "mongodb",
        Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus? failureStatus = null,
        IEnumerable<string>? tags = null,
        TimeSpan? timeout = null)
    {
        return builder.Add(new Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckRegistration(
            name,
            sp =>
            {
                var client = sp.GetRequiredService<MongoClient>();
                return new MongoHealthCheck(client);
            },
            failureStatus,
            tags,
            timeout));
    }
}

/// <summary>
/// MongoDB health check implementation.
/// </summary>
internal class MongoHealthCheck : Microsoft.Extensions.Diagnostics.HealthChecks.IHealthCheck
{
    private readonly MongoClient _client;

    public MongoHealthCheck(MongoClient client)
    {
        _client = client;
    }

    public async Task<Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult> CheckHealthAsync(
        Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var databases = await _client.ListDatabaseNamesAsync(cancellationToken);
            return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Healthy(
                $"MongoDB is healthy. Found {databases.Count} database(s).");
        }
        catch (Exception ex)
        {
            return Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult.Unhealthy(
                "MongoDB health check failed",
                ex);
        }
    }
}

// ============================================================================
// Minimal API Extensions
// ============================================================================

/// <summary>
/// Extensions for ASP.NET Core Minimal APIs.
/// </summary>
public static class MongoMinimalApiExtensions
{
    /// <summary>
    /// Maps MongoDB query endpoints for development/debugging.
    /// </summary>
    /// <remarks>
    /// This is intended for development use only. Do not enable in production.
    /// </remarks>
    public static Microsoft.AspNetCore.Routing.IEndpointRouteBuilder MapMongoEndpoints(
        this Microsoft.AspNetCore.Routing.IEndpointRouteBuilder endpoints,
        string prefix = "/mongo")
    {
        var group = endpoints.MapGroup(prefix).WithTags("MongoDB");

        group.MapGet("/databases", async (MongoClient client, CancellationToken ct) =>
        {
            var databases = await client.ListDatabaseNamesAsync(ct);
            return Microsoft.AspNetCore.Http.Results.Ok(databases);
        }).WithName("ListDatabases").WithDescription("Lists all database names");

        group.MapGet("/databases/{database}/collections", async (
            string database,
            MongoClient client,
            CancellationToken ct) =>
        {
            var db = client.GetDatabase(database);
            var collections = await db.ListCollectionNamesAsync(ct);
            return Microsoft.AspNetCore.Http.Results.Ok(collections);
        }).WithName("ListCollections").WithDescription("Lists all collection names in a database");

        group.MapPost("/query", async (
            QueryRequest request,
            CancellationToken ct) =>
        {
            try
            {
                var result = await Mongo.Query(request.Query).ExecuteAsync(ct);
                return Microsoft.AspNetCore.Http.Results.Ok(result);
            }
            catch (QueryException ex)
            {
                return Microsoft.AspNetCore.Http.Results.BadRequest(new
                {
                    Error = ex.Message,
                    Suggestion = ex.Suggestion
                });
            }
        }).WithName("ExecuteQuery").WithDescription("Executes a natural language query");

        return endpoints;
    }
}

/// <summary>
/// Query request for the Minimal API endpoints.
/// </summary>
public record QueryRequest(string Query);
