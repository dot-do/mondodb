// ============================================================================
// Client.fs - MongoDB Client for Mongo.Do F# SDK
// ============================================================================

namespace Mongo.Do

open System
open System.Text.Json.Nodes
open FSharp.Control

/// MongoDB client for connecting to a mongo.do server
type MongoClient private (transport: IRpcTransport, settings: MongoClientSettings) =

    let databases = System.Collections.Concurrent.ConcurrentDictionary<string, MongoDatabase>()
    let mutable disposed = false

    /// Creates a new MongoDB client with the specified connection string
    new(connectionString: string) =
        let settings = MongoClientSettings.FromUrl(connectionString)
        let transport = WebSocketRpcTransport(connectionString, settings) :> IRpcTransport
        MongoClient(transport, settings)

    /// Creates a new MongoDB client with the specified settings
    new(settings: MongoClientSettings) =
        let transport = WebSocketRpcTransport(settings.Url, settings) :> IRpcTransport
        MongoClient(transport, settings)

    /// Creates a new MongoDB client from environment variables
    static member FromEnv() =
        let settings = MongoClientSettings.FromEnv()
        MongoClient(settings)

    /// Creates a new MongoDB client with a custom transport (for testing)
    static member internal FromTransport(transport: IRpcTransport, ?settings: MongoClientSettings) =
        MongoClient(transport, settings |> Option.defaultValue MongoClientSettings.Default)

    /// Gets the client settings
    member _.Settings = settings

    /// Gets a database by name
    member _.GetDatabase(name: string, ?databaseSettings: DatabaseSettings) : MongoDatabase =
        if disposed then raise (ObjectDisposedException(nameof(MongoClient)))
        let dbSettings = databaseSettings |> Option.defaultValue DatabaseSettings.Default
        databases.GetOrAdd(name, fun _ -> MongoDatabase(transport, name, dbSettings))

    /// Lists all database names
    member _.ListDatabaseNames() : Async<string list> =
        async {
            if disposed then raise (ObjectDisposedException(nameof(MongoClient)))
            let! result = transport.CallAsync("listDatabaseNames")
            match result with
            | Some n when n :? JsonArray ->
                return n :?> JsonArray |> Seq.map (fun v -> v.GetValue<string>()) |> Seq.toList
            | _ -> return []
        }

    /// Lists all databases with their info
    member _.ListDatabases() : Async<BsonDocument list> =
        async {
            if disposed then raise (ObjectDisposedException(nameof(MongoClient)))
            let! result = transport.CallAsync("listDatabases")
            match result with
            | Some n when n :? JsonArray ->
                return n :?> JsonArray
                    |> Seq.map (fun v -> BsonDocument.Parse(v.ToJsonString()))
                    |> Seq.toList
            | _ -> return []
        }

    /// Drops a database
    member _.DropDatabase(name: string) : Async<unit> =
        async {
            if disposed then raise (ObjectDisposedException(nameof(MongoClient)))
            let! _ = transport.CallAsync("dropDatabase", [| name |])
            databases.TryRemove(name) |> ignore
            return ()
        }

    /// Starts a session for transactions
    member _.StartSession(?causalConsistency: bool) : Async<MongoSession> =
        async {
            if disposed then raise (ObjectDisposedException(nameof(MongoClient)))
            let! result = transport.CallAsync("startSession", [| causalConsistency |> Option.defaultValue true |])
            match result with
            | Some n ->
                let sessionId = n.GetValue<string>()
                return MongoSession(transport, sessionId)
            | None ->
                return failwith "Failed to start session"
        }

    /// Watches for changes across all databases
    member _.Watch(?pipeline: BsonDocument list) : AsyncSeq<ChangeEvent<BsonDocument>> =
        asyncSeq {
            let pipelineJson =
                pipeline
                |> Option.map (List.map (fun d -> d.ToJson()) >> List.toArray)
                |> Option.defaultValue [||]

            let! streamId = transport.CallAsync("watch", [| pipelineJson |])

            match streamId with
            | Some id ->
                let sid = id.GetValue<string>()
                let mutable running = true

                while running do
                    let! result = transport.CallAsync("watchNext", [| sid |])
                    match result with
                    | Some n ->
                        let opType =
                            match n.["operationType"].GetValue<string>() with
                            | "insert" -> OperationType.Insert
                            | "update" -> OperationType.Update
                            | "replace" -> OperationType.Replace
                            | "delete" -> OperationType.Delete
                            | "invalidate" -> OperationType.Invalidate
                            | "drop" -> OperationType.Drop
                            | "rename" -> OperationType.Rename
                            | "dropDatabase" -> OperationType.DropDatabase
                            | _ -> OperationType.Insert

                        let fullDoc =
                            let fd = n.["fullDocument"]
                            if fd <> null then Some (BsonDocument.Parse(fd.ToJsonString())) else None

                        let docKey =
                            let dk = n.["documentKey"]
                            if dk <> null then
                                let idNode = dk.["_id"]
                                if idNode <> null then Some { Value = idNode.GetValue<string>() } else None
                            else None

                        let clusterTime =
                            let ct = n.["clusterTime"]
                            if ct <> null then DateTimeOffset.FromUnixTimeMilliseconds(ct.GetValue<int64>())
                            else DateTimeOffset.UtcNow

                        yield
                            { OperationType = opType
                              FullDocument = fullDoc
                              DocumentKey = docKey
                              UpdateDescription = None
                              ClusterTime = clusterTime }

                        if opType = OperationType.Invalidate then
                            running <- false
                    | None ->
                        do! Async.Sleep(100)
            | None -> ()
        }

    /// Closes the client
    member _.Close() : Async<unit> =
        async {
            if not disposed then
                disposed <- true
                do! transport.CloseAsync()
        }

    interface IAsyncDisposable with
        member this.DisposeAsync() =
            this.Close() |> Async.StartAsTask |> Threading.Tasks.ValueTask

/// MongoDB session for transactions
and MongoSession internal (transport: IRpcTransport, sessionId: string) =

    let mutable inTransaction = false
    let mutable disposed = false

    /// Gets the session ID
    member _.SessionId = sessionId

    /// Gets whether a transaction is in progress
    member _.IsInTransaction = inTransaction

    /// Starts a transaction
    member _.StartTransaction(?readConcern: ReadConcern, ?writeConcern: WriteConcern) : unit =
        if disposed then raise (ObjectDisposedException(nameof(MongoSession)))
        if inTransaction then invalidOp "Transaction already in progress"
        inTransaction <- true

    /// Commits the current transaction
    member _.CommitTransaction() : Async<unit> =
        async {
            if disposed then raise (ObjectDisposedException(nameof(MongoSession)))
            if not inTransaction then invalidOp "No transaction in progress"
            let! _ = transport.CallAsync("commitTransaction", [| sessionId |])
            inTransaction <- false
        }

    /// Aborts the current transaction
    member _.AbortTransaction() : Async<unit> =
        async {
            if disposed then raise (ObjectDisposedException(nameof(MongoSession)))
            if not inTransaction then invalidOp "No transaction in progress"
            let! _ = transport.CallAsync("abortTransaction", [| sessionId |])
            inTransaction <- false
        }

    /// Executes a function within a transaction
    member this.WithTransaction<'T>(operation: MongoSession -> Async<'T>, ?readConcern: ReadConcern, ?writeConcern: WriteConcern) : Async<'T> =
        async {
            if disposed then raise (ObjectDisposedException(nameof(MongoSession)))
            this.StartTransaction(?readConcern = readConcern, ?writeConcern = writeConcern)
            try
                let! result = operation this
                do! this.CommitTransaction()
                return result
            with
            | ex ->
                do! this.AbortTransaction()
                return raise ex
        }

    /// Ends the session
    member _.EndSession() : Async<unit> =
        async {
            if not disposed then
                disposed <- true
                if inTransaction then
                    try
                        let! _ = transport.CallAsync("abortTransaction", [| sessionId |])
                        ()
                    with
                    | _ -> ()
                let! _ = transport.CallAsync("endSession", [| sessionId |])
                ()
        }

    interface IAsyncDisposable with
        member this.DisposeAsync() =
            this.EndSession() |> Async.StartAsTask |> Threading.Tasks.ValueTask
