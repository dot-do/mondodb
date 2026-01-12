// ============================================================================
// Database.fs - MongoDB Database operations for Mongo.Do F# SDK
// ============================================================================

namespace Mongo.Do

open System.Text.Json.Nodes

/// Represents a MongoDB database
type MongoDatabase(transport: IRpcTransport, name: string, settings: DatabaseSettings) =

    let collections = System.Collections.Concurrent.ConcurrentDictionary<string, obj>()

    /// Gets the database name
    member _.Name = name

    /// Gets the database settings
    member _.Settings = settings

    /// Gets a typed collection
    member _.GetCollection<'T>(collectionName: string, ?collectionSettings: CollectionSettings) : MongoCollection<'T> =
        let key = sprintf "%s<%s>" collectionName typeof<'T>.FullName
        let settings = collectionSettings |> Option.defaultValue CollectionSettings.Default
        collections.GetOrAdd(key, fun _ ->
            MongoCollection<'T>(transport, name, collectionName, settings) :> obj)
        :?> MongoCollection<'T>

    /// Lists all collection names
    member _.ListCollectionNames() : Async<string list> =
        async {
            let! result = transport.CallAsync("listCollectionNames", [| name |])
            match result with
            | Some n when n :? JsonArray ->
                return n :?> JsonArray |> Seq.map (fun v -> v.GetValue<string>()) |> Seq.toList
            | _ -> return []
        }

    /// Lists all collections with their info
    member _.ListCollections() : Async<BsonDocument list> =
        async {
            let! result = transport.CallAsync("listCollections", [| name |])
            match result with
            | Some n when n :? JsonArray ->
                return n :?> JsonArray
                    |> Seq.map (fun v -> BsonDocument.Parse(v.ToJsonString()))
                    |> Seq.toList
            | _ -> return []
        }

    /// Creates a collection
    member _.CreateCollection(collectionName: string, ?options: BsonDocument) : Async<unit> =
        async {
            let opts = options |> Option.map (fun d -> d.ToJson()) |> Option.defaultValue "{}"
            let! _ = transport.CallAsync("createCollection", [| name; collectionName; opts |])
            return ()
        }

    /// Drops a collection
    member _.DropCollection(collectionName: string) : Async<unit> =
        async {
            let! _ = transport.CallAsync("dropCollection", [| name; collectionName |])
            return ()
        }

    /// Renames a collection
    member _.RenameCollection(oldName: string, newName: string, ?dropTarget: bool) : Async<unit> =
        async {
            let drop = dropTarget |> Option.defaultValue false
            let! _ = transport.CallAsync("renameCollection", [| name; oldName; newName; drop |])
            return ()
        }

    /// Runs a command on the database
    member _.RunCommand(command: BsonDocument) : Async<BsonDocument> =
        async {
            let! result = transport.CallAsync("runCommand", [| name; command.ToJson() |])
            match result with
            | Some n -> return BsonDocument.Parse(n.ToJsonString())
            | None -> return BsonDocument()
        }

    /// Gets database statistics
    member _.Stats() : Async<BsonDocument> =
        async {
            let command = BsonDocument.ofList [ "dbStats", bInt 1 ]
            return! this.RunCommand(command)
        }

    /// Drops the database
    member _.Drop() : Async<unit> =
        async {
            let! _ = transport.CallAsync("dropDatabase", [| name |])
            return ()
        }
