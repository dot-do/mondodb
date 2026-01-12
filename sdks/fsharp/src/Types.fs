// ============================================================================
// Types.fs - Core types for Mongo.Do F# SDK
// ============================================================================

namespace Mongo.Do

open System

/// Represents MongoDB ObjectId
[<Struct>]
type ObjectId =
    { Value: string }

    static member Generate() =
        { Value = Guid.NewGuid().ToString("N").Substring(0, 24) }

    static member Parse(value: string) =
        if String.IsNullOrEmpty(value) || value.Length <> 24 then
            Error "Invalid ObjectId format"
        else
            Ok { Value = value }

    static member Empty = { Value = String.Empty }

    override this.ToString() = this.Value

/// MongoDB error types as discriminated union
[<RequireQualifiedAccess>]
type MongoError =
    | ConnectionError of message: string
    | QueryError of message: string * suggestion: string option
    | WriteError of code: int * message: string
    | DuplicateKey of keyPattern: string * message: string
    | ValidationError of message: string
    | Timeout of operation: string * timeoutMs: int
    | NotFound of collection: string * filter: string
    | Unauthorized of message: string
    | ServerError of code: int * message: string

    member this.Message =
        match this with
        | ConnectionError msg -> msg
        | QueryError (msg, _) -> msg
        | WriteError (_, msg) -> msg
        | DuplicateKey (_, msg) -> msg
        | ValidationError msg -> msg
        | Timeout (op, ms) -> sprintf "Operation '%s' timed out after %dms" op ms
        | NotFound (coll, filter) -> sprintf "Document not found in '%s' matching: %s" coll filter
        | Unauthorized msg -> msg
        | ServerError (_, msg) -> msg

    member this.IsRetriable =
        match this with
        | ConnectionError _ | Timeout _ | ServerError (code, _) when code >= 10000 -> true
        | _ -> false

/// Result type alias for MongoDB operations
type MongoResult<'T> = Result<'T, MongoError>

/// Write concern levels
[<RequireQualifiedAccess>]
type WriteConcern =
    | Unacknowledged
    | Acknowledged
    | Majority
    | Custom of w: int

    member this.ToInt() =
        match this with
        | Unacknowledged -> 0
        | Acknowledged -> 1
        | Majority -> -1
        | Custom w -> w

/// Read concern levels
[<RequireQualifiedAccess>]
type ReadConcern =
    | Local
    | Available
    | Majority
    | Linearizable
    | Snapshot

/// Read preference modes
[<RequireQualifiedAccess>]
type ReadPreference =
    | Primary
    | PrimaryPreferred
    | Secondary
    | SecondaryPreferred
    | Nearest

/// Sort direction
[<RequireQualifiedAccess>]
type SortDirection =
    | Ascending
    | Descending

    member this.ToInt() =
        match this with
        | Ascending -> 1
        | Descending -> -1

/// Index type
[<RequireQualifiedAccess>]
type IndexType =
    | Ascending
    | Descending
    | Text
    | Hashed
    | Geo2D
    | Geo2DSphere

/// Change stream operation type
[<RequireQualifiedAccess>]
type OperationType =
    | Insert
    | Update
    | Replace
    | Delete
    | Invalidate
    | Drop
    | Rename
    | DropDatabase

/// Cursor result representing a single change event
type ChangeEvent<'T> =
    { OperationType: OperationType
      FullDocument: 'T option
      DocumentKey: ObjectId option
      UpdateDescription: UpdateDescription option
      ClusterTime: DateTimeOffset }

and UpdateDescription =
    { UpdatedFields: Map<string, obj>
      RemovedFields: string list }

/// Insert result
type InsertOneResult =
    { InsertedId: ObjectId
      Acknowledged: bool }

/// Insert many result
type InsertManyResult =
    { InsertedIds: ObjectId list
      InsertedCount: int
      Acknowledged: bool }

/// Update result
type UpdateResult =
    { MatchedCount: int64
      ModifiedCount: int64
      UpsertedId: ObjectId option
      Acknowledged: bool }

/// Delete result
type DeleteResult =
    { DeletedCount: int64
      Acknowledged: bool }

/// Replace result
type ReplaceResult =
    { MatchedCount: int64
      ModifiedCount: int64
      UpsertedId: ObjectId option
      Acknowledged: bool }

/// Bulk write result
type BulkWriteResult =
    { InsertedCount: int64
      MatchedCount: int64
      ModifiedCount: int64
      DeletedCount: int64
      UpsertedCount: int64
      UpsertedIds: Map<int, ObjectId>
      Acknowledged: bool }

/// Find options
type FindOptions =
    { Skip: int option
      Limit: int option
      Sort: (string * SortDirection) list
      Projection: string list option
      Hint: string option
      MaxTimeMs: int option
      NoCursorTimeout: bool
      AllowPartialResults: bool
      BatchSize: int option }

    static member Default =
        { Skip = None
          Limit = None
          Sort = []
          Projection = None
          Hint = None
          MaxTimeMs = None
          NoCursorTimeout = false
          AllowPartialResults = false
          BatchSize = None }

/// Aggregate options
type AggregateOptions =
    { AllowDiskUse: bool
      BatchSize: int option
      MaxTimeMs: int option
      Hint: string option }

    static member Default =
        { AllowDiskUse = false
          BatchSize = None
          MaxTimeMs = None
          Hint = None }

/// Update options
type UpdateOptions =
    { Upsert: bool
      BypassDocumentValidation: bool
      Hint: string option
      ArrayFilters: obj list }

    static member Default =
        { Upsert = false
          BypassDocumentValidation = false
          Hint = None
          ArrayFilters = [] }

/// Delete options
type DeleteOptions =
    { Hint: string option }

    static member Default =
        { Hint = None }

/// Index options
type IndexOptions =
    { Name: string option
      Unique: bool
      Sparse: bool
      Background: bool
      ExpireAfterSeconds: int option
      Weights: Map<string, int> option
      DefaultLanguage: string option
      LanguageOverride: string option }

    static member Default =
        { Name = None
          Unique = false
          Sparse = false
          Background = false
          ExpireAfterSeconds = None
          Weights = None
          DefaultLanguage = None
          LanguageOverride = None }

/// Client settings
type MongoClientSettings =
    { Url: string
      ApiKey: string option
      ConnectTimeout: TimeSpan
      ServerSelectionTimeout: TimeSpan
      SocketTimeout: TimeSpan
      MaxConnectionPoolSize: int
      MinConnectionPoolSize: int
      RetryReads: bool
      RetryWrites: bool
      ApplicationName: string option
      ReadConcern: ReadConcern
      WriteConcern: WriteConcern
      ReadPreference: ReadPreference }

    static member Default =
        { Url = "https://mongo.do"
          ApiKey = None
          ConnectTimeout = TimeSpan.FromSeconds(30.)
          ServerSelectionTimeout = TimeSpan.FromSeconds(30.)
          SocketTimeout = TimeSpan.FromMinutes(5.)
          MaxConnectionPoolSize = 100
          MinConnectionPoolSize = 0
          RetryReads = true
          RetryWrites = true
          ApplicationName = None
          ReadConcern = ReadConcern.Local
          WriteConcern = WriteConcern.Acknowledged
          ReadPreference = ReadPreference.Primary }

    static member FromUrl(url: string) =
        { MongoClientSettings.Default with Url = url }

    static member FromEnv() =
        let url = Environment.GetEnvironmentVariable("MONGO_DO_URL") |> Option.ofObj
        let apiKey = Environment.GetEnvironmentVariable("MONGO_DO_API_KEY") |> Option.ofObj
        { MongoClientSettings.Default with
            Url = url |> Option.defaultValue "https://mongo.do"
            ApiKey = apiKey }

/// Database settings
type DatabaseSettings =
    { ReadConcern: ReadConcern option
      WriteConcern: WriteConcern option
      ReadPreference: ReadPreference option }

    static member Default =
        { ReadConcern = None
          WriteConcern = None
          ReadPreference = None }

/// Collection settings
type CollectionSettings =
    { ReadConcern: ReadConcern option
      WriteConcern: WriteConcern option
      ReadPreference: ReadPreference option }

    static member Default =
        { ReadConcern = None
          WriteConcern = None
          ReadPreference = None }
