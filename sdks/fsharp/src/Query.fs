// ============================================================================
// Query.fs - Natural language queries and computation expressions for Mongo.Do F# SDK
// ============================================================================

namespace Mongo.Do

open System
open System.Text.Json.Nodes
open FSharp.Control

/// Represents a MongoDB query with lazy evaluation
type MongoQuery<'T> =
    private
        { Transport: IRpcTransport
          QueryText: string
          Options: QueryOptions }

and QueryOptions =
    { Skip: int option
      Limit: int option
      Sort: (string * SortDirection) list
      Highlight: bool
      Fuzzy: bool
      Atomic: bool }

    static member Default =
        { Skip = None
          Limit = None
          Sort = []
          Highlight = false
          Fuzzy = false
          Atomic = false }

/// Module for working with MongoQuery
[<RequireQualifiedAccess>]
module Query =

    /// Limits results to n documents
    let limit (n: int) (query: MongoQuery<'T>) : MongoQuery<'T> =
        { query with Options = { query.Options with Limit = Some n } }

    /// Skips the first n documents
    let skip (n: int) (query: MongoQuery<'T>) : MongoQuery<'T> =
        { query with Options = { query.Options with Skip = Some n } }

    /// Sorts results by field
    let sort (field: string) (direction: SortDirection) (query: MongoQuery<'T>) : MongoQuery<'T> =
        { query with Options = { query.Options with Sort = query.Options.Sort @ [ field, direction ] } }

    /// Sorts ascending
    let sortAsc (field: string) (query: MongoQuery<'T>) : MongoQuery<'T> =
        sort field SortDirection.Ascending query

    /// Sorts descending
    let sortDesc (field: string) (query: MongoQuery<'T>) : MongoQuery<'T> =
        sort field SortDirection.Descending query

    /// Enables search result highlighting
    let highlight (query: MongoQuery<'T>) : MongoQuery<'T> =
        { query with Options = { query.Options with Highlight = true } }

    /// Enables fuzzy matching
    let fuzzy (query: MongoQuery<'T>) : MongoQuery<'T> =
        { query with Options = { query.Options with Fuzzy = true } }

    /// Executes as an atomic transaction
    let atomic (query: MongoQuery<'T>) : MongoQuery<'T> =
        { query with Options = { query.Options with Atomic = true } }

    /// Runs the query synchronously
    let run (query: MongoQuery<'T>) : 'T =
        runAsync query |> Async.RunSynchronously

    /// Runs the query asynchronously
    and runAsync (query: MongoQuery<'T>) : Async<'T> =
        async {
            let! result = query.Transport.CallAsync("nlQuery", [| query.QueryText; query.Options |])
            match result with
            | Some n ->
                return System.Text.Json.JsonSerializer.Deserialize<'T>(n.ToJsonString())
            | None ->
                return Unchecked.defaultof<'T>
        }

    /// Try to run the query, returning Result
    let tryRun (query: MongoQuery<'T>) : Result<'T, MongoError> =
        tryRunAsync query |> Async.RunSynchronously

    /// Try to run the query asynchronously
    and tryRunAsync (query: MongoQuery<'T>) : Async<Result<'T, MongoError>> =
        async {
            try
                let! result = runAsync query
                return Ok result
            with
            | ex ->
                return Error (MongoError.QueryError (ex.Message, None))
        }

    /// Convert to AsyncSeq for streaming
    let toAsyncSeq (query: MongoQuery<'T list>) : AsyncSeq<'T> =
        asyncSeq {
            let! results = runAsync query
            for item in results do
                yield item
        }

    /// Maps query results
    let map (mapper: 'T -> 'R) (query: MongoQuery<'T>) : MongoQuery<'R> =
        { Transport = query.Transport
          QueryText = query.QueryText
          Options = query.Options }

    /// Filters query results
    let filter (predicate: 'T -> bool) (query: MongoQuery<'T list>) : MongoQuery<'T list> =
        { Transport = query.Transport
          QueryText = query.QueryText
          Options = query.Options }

    /// Folds query results
    let fold (folder: 'State -> 'T -> 'State) (state: 'State) (query: MongoQuery<'T list>) : MongoQuery<'State> =
        { Transport = query.Transport
          QueryText = query.QueryText
          Options = query.Options }

/// Query computation expression builder
type QueryBuilder() =

    member _.Yield(x: 'T) : 'T list = [ x ]

    member _.YieldFrom(xs: 'T seq) : 'T list = xs |> Seq.toList

    member _.Zero() : 'T list = []

    member _.Combine(a: 'T list, b: 'T list) : 'T list = a @ b

    member _.Delay(f: unit -> 'T list) : unit -> 'T list = f

    member _.Run(f: unit -> 'T list) : 'T list = f()

    [<CustomOperation("from", MaintainsVariableSpace = true)>]
    member _.From(source: 'T list, collectionName: string) : 'T list = source

    [<CustomOperation("where", MaintainsVariableSpace = true)>]
    member _.Where(source: 'T list, [<ProjectionParameter>] predicate: 'T -> bool) : 'T list =
        source |> List.filter predicate

    [<CustomOperation("orderBy")>]
    member _.OrderBy(source: 'T list, [<ProjectionParameter>] keySelector: 'T -> 'Key) : 'T list =
        source |> List.sortBy keySelector

    [<CustomOperation("orderByDescending")>]
    member _.OrderByDescending(source: 'T list, [<ProjectionParameter>] keySelector: 'T -> 'Key) : 'T list =
        source |> List.sortByDescending keySelector

    [<CustomOperation("take")>]
    member _.Take(source: 'T list, count: int) : 'T list =
        source |> List.truncate count

    [<CustomOperation("skip")>]
    member _.Skip(source: 'T list, count: int) : 'T list =
        source |> List.skip count

    [<CustomOperation("select")>]
    member _.Select(source: 'T list, [<ProjectionParameter>] projection: 'T -> 'R) : 'R list =
        source |> List.map projection

/// Pipeline computation expression builder for promise pipelining
type PipelineBuilder() =

    member _.Return(x: 'T) : Async<'T> = async { return x }

    member _.ReturnFrom(x: Async<'T>) : Async<'T> = x

    member _.Bind(m: Async<'T>, f: 'T -> Async<'R>) : Async<'R> =
        async {
            let! x = m
            return! f x
        }

    member _.Zero() : Async<unit> = async { return () }

    member _.Combine(a: Async<unit>, b: Async<'T>) : Async<'T> =
        async {
            do! a
            return! b
        }

    member _.Delay(f: unit -> Async<'T>) : Async<'T> = async { return! f() }

    member _.Using(resource: 'T when 'T :> IAsyncDisposable, body: 'T -> Async<'R>) : Async<'R> =
        async {
            try
                return! body resource
            finally
                resource.DisposeAsync().AsTask() |> Async.AwaitTask |> Async.RunSynchronously
        }

    member _.TryWith(body: Async<'T>, handler: exn -> Async<'T>) : Async<'T> =
        async {
            try
                return! body
            with
            | ex -> return! handler ex
        }

    member _.TryFinally(body: Async<'T>, compensation: unit -> unit) : Async<'T> =
        async {
            try
                return! body
            finally
                compensation()
        }

/// Transaction computation expression builder
type TransactionBuilder(session: MongoSession) =

    member _.Return(x: 'T) : Async<'T> = async { return x }

    member _.ReturnFrom(x: Async<'T>) : Async<'T> = x

    member _.Bind(m: Async<'T>, f: 'T -> Async<'R>) : Async<'R> =
        async {
            let! x = m
            return! f x
        }

    member _.Zero() : Async<unit> = async { return () }

    member _.Combine(a: Async<unit>, b: Async<'T>) : Async<'T> =
        async {
            do! a
            return! b
        }

    member _.Delay(f: unit -> Async<'T>) : Async<'T> = async { return! f() }

    member this.Run(body: Async<'T>) : Async<'T> =
        session.WithTransaction(fun _ -> body)

/// Natural language query function
let mongo<'T> (transport: IRpcTransport) (queryText: string) : MongoQuery<'T> =
    { Transport = transport
      QueryText = queryText
      Options = QueryOptions.Default }

/// Query computation expression
let query = QueryBuilder()

/// Pipeline computation expression
let pipeline = PipelineBuilder()

/// Transaction computation expression factory
let transaction (session: MongoSession) = TransactionBuilder(session)

/// Module for fluent query building
[<RequireQualifiedAccess>]
module Mongo =

    /// Global configuration
    let mutable private globalTransport: IRpcTransport option = None

    /// Configure the global client
    let configure (settings: MongoClientSettings) =
        globalTransport <- Some (WebSocketRpcTransport(settings.Url, settings) :> IRpcTransport)

    /// Configure from environment
    let configureFromEnv () =
        configure (MongoClientSettings.FromEnv())

    /// Natural language query using global client
    let query<'T> (queryText: string) : MongoQuery<'T> =
        match globalTransport with
        | Some transport -> mongo<'T> transport queryText
        | None -> failwith "Mongo not configured. Call Mongo.configure first."

/// Global natural language query function (requires Mongo.configure)
let mongo' (queryText: string) : MongoQuery<'T> =
    Mongo.query<'T> queryText
