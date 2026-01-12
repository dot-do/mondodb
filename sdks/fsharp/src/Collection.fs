// ============================================================================
// Collection.fs - MongoDB Collection operations for Mongo.Do F# SDK
// ============================================================================

namespace Mongo.Do

open System
open System.Text.Json
open System.Text.Json.Nodes
open FSharp.Control

/// Represents a MongoDB collection with typed documents
type MongoCollection<'T>(transport: IRpcTransport, database: string, name: string, settings: CollectionSettings) =

    let jsonOptions = JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.CamelCase)

    let serialize (doc: 'T) : JsonNode =
        JsonSerializer.SerializeToNode(doc, jsonOptions)

    let deserialize (node: JsonNode) : 'T =
        JsonSerializer.Deserialize<'T>(node, jsonOptions)

    let deserializeOption (node: JsonNode option) : 'T option =
        node |> Option.map deserialize

    let parseInsertOneResult (node: JsonNode option) : InsertOneResult =
        match node with
        | Some n ->
            { InsertedId = { Value = n.["insertedId"].GetValue<string>() }
              Acknowledged = n.["acknowledged"].GetValue<bool>() }
        | None ->
            { InsertedId = ObjectId.Empty
              Acknowledged = false }

    let parseUpdateResult (node: JsonNode option) : UpdateResult =
        match node with
        | Some n ->
            { MatchedCount = n.["matchedCount"].GetValue<int64>()
              ModifiedCount = n.["modifiedCount"].GetValue<int64>()
              UpsertedId =
                  let id = n.["upsertedId"]
                  if id <> null then Some { Value = id.GetValue<string>() } else None
              Acknowledged = n.["acknowledged"].GetValue<bool>() }
        | None ->
            { MatchedCount = 0L
              ModifiedCount = 0L
              UpsertedId = None
              Acknowledged = false }

    let parseDeleteResult (node: JsonNode option) : DeleteResult =
        match node with
        | Some n ->
            { DeletedCount = n.["deletedCount"].GetValue<int64>()
              Acknowledged = n.["acknowledged"].GetValue<bool>() }
        | None ->
            { DeletedCount = 0L
              Acknowledged = false }

    /// Gets the collection name
    member _.Name = name

    /// Gets the database name
    member _.DatabaseName = database

    /// Gets the collection settings
    member _.Settings = settings

    /// Inserts a single document
    member _.InsertOne(document: 'T) : Async<InsertOneResult> =
        async {
            let! result = transport.CallAsync("insertOne", [| database; name; serialize document |])
            return parseInsertOneResult result
        }

    /// Inserts multiple documents
    member _.InsertMany(documents: 'T seq) : Async<InsertManyResult> =
        async {
            let docs = documents |> Seq.map serialize |> Seq.toArray
            let! result = transport.CallAsync("insertMany", [| database; name; docs |])
            match result with
            | Some n ->
                let ids =
                    n.["insertedIds"] :?> JsonArray
                    |> Seq.map (fun id -> { Value = id.GetValue<string>() })
                    |> Seq.toList
                return
                    { InsertedIds = ids
                      InsertedCount = n.["insertedCount"].GetValue<int>()
                      Acknowledged = n.["acknowledged"].GetValue<bool>() }
            | None ->
                return
                    { InsertedIds = []
                      InsertedCount = 0
                      Acknowledged = false }
        }

    /// Finds documents matching a filter
    member _.Find(filter: BsonDocument, ?options: FindOptions) : Async<'T list> =
        async {
            let opts = options |> Option.defaultValue FindOptions.Default
            let! result = transport.CallAsync("find", [| database; name; filter.ToJson(); opts |])
            match result with
            | Some n when n :? JsonArray ->
                return n :?> JsonArray |> Seq.map deserialize |> Seq.toList
            | _ -> return []
        }

    /// Finds a single document matching a filter
    member _.FindOne(filter: BsonDocument, ?options: FindOptions) : Async<'T option> =
        async {
            let opts = { (options |> Option.defaultValue FindOptions.Default) with Limit = Some 1 }
            let! result = transport.CallAsync("findOne", [| database; name; filter.ToJson(); opts |])
            return deserializeOption result
        }

    /// Finds a document by ID
    member _.FindById(id: ObjectId) : Async<'T option> =
        async {
            let filter = BsonDocument.ofList [ "_id", bObjectId id ]
            let! result = transport.CallAsync("findOne", [| database; name; filter.ToJson() |])
            return deserializeOption result
        }

    /// Counts documents matching a filter
    member _.CountDocuments(filter: BsonDocument) : Async<int64> =
        async {
            let! result = transport.CallAsync("countDocuments", [| database; name; filter.ToJson() |])
            match result with
            | Some n -> return n.GetValue<int64>()
            | None -> return 0L
        }

    /// Estimates the total document count
    member _.EstimatedDocumentCount() : Async<int64> =
        async {
            let! result = transport.CallAsync("estimatedDocumentCount", [| database; name |])
            match result with
            | Some n -> return n.GetValue<int64>()
            | None -> return 0L
        }

    /// Updates a single document
    member _.UpdateOne(filter: BsonDocument, update: BsonDocument, ?options: UpdateOptions) : Async<UpdateResult> =
        async {
            let opts = options |> Option.defaultValue UpdateOptions.Default
            let! result = transport.CallAsync("updateOne", [| database; name; filter.ToJson(); update.ToJson(); opts |])
            return parseUpdateResult result
        }

    /// Updates multiple documents
    member _.UpdateMany(filter: BsonDocument, update: BsonDocument, ?options: UpdateOptions) : Async<UpdateResult> =
        async {
            let opts = options |> Option.defaultValue UpdateOptions.Default
            let! result = transport.CallAsync("updateMany", [| database; name; filter.ToJson(); update.ToJson(); opts |])
            return parseUpdateResult result
        }

    /// Replaces a single document
    member _.ReplaceOne(filter: BsonDocument, replacement: 'T, ?options: UpdateOptions) : Async<ReplaceResult> =
        async {
            let opts = options |> Option.defaultValue UpdateOptions.Default
            let! result = transport.CallAsync("replaceOne", [| database; name; filter.ToJson(); serialize replacement; opts |])
            match result with
            | Some n ->
                return
                    { MatchedCount = n.["matchedCount"].GetValue<int64>()
                      ModifiedCount = n.["modifiedCount"].GetValue<int64>()
                      UpsertedId =
                          let id = n.["upsertedId"]
                          if id <> null then Some { Value = id.GetValue<string>() } else None
                      Acknowledged = n.["acknowledged"].GetValue<bool>() }
            | None ->
                return
                    { MatchedCount = 0L
                      ModifiedCount = 0L
                      UpsertedId = None
                      Acknowledged = false }
        }

    /// Deletes a single document
    member _.DeleteOne(filter: BsonDocument, ?options: DeleteOptions) : Async<DeleteResult> =
        async {
            let opts = options |> Option.defaultValue DeleteOptions.Default
            let! result = transport.CallAsync("deleteOne", [| database; name; filter.ToJson(); opts |])
            return parseDeleteResult result
        }

    /// Deletes multiple documents
    member _.DeleteMany(filter: BsonDocument, ?options: DeleteOptions) : Async<DeleteResult> =
        async {
            let opts = options |> Option.defaultValue DeleteOptions.Default
            let! result = transport.CallAsync("deleteMany", [| database; name; filter.ToJson(); opts |])
            return parseDeleteResult result
        }

    /// Finds and modifies a document
    member _.FindOneAndUpdate(filter: BsonDocument, update: BsonDocument, ?returnDocument: bool) : Async<'T option> =
        async {
            let returnAfter = returnDocument |> Option.defaultValue true
            let! result = transport.CallAsync("findOneAndUpdate", [| database; name; filter.ToJson(); update.ToJson(); returnAfter |])
            return deserializeOption result
        }

    /// Finds and replaces a document
    member _.FindOneAndReplace(filter: BsonDocument, replacement: 'T, ?returnDocument: bool) : Async<'T option> =
        async {
            let returnAfter = returnDocument |> Option.defaultValue true
            let! result = transport.CallAsync("findOneAndReplace", [| database; name; filter.ToJson(); serialize replacement; returnAfter |])
            return deserializeOption result
        }

    /// Finds and deletes a document
    member _.FindOneAndDelete(filter: BsonDocument) : Async<'T option> =
        async {
            let! result = transport.CallAsync("findOneAndDelete", [| database; name; filter.ToJson() |])
            return deserializeOption result
        }

    /// Gets distinct values for a field
    member _.Distinct<'TField>(fieldName: string, filter: BsonDocument) : Async<'TField list> =
        async {
            let! result = transport.CallAsync("distinct", [| database; name; fieldName; filter.ToJson() |])
            match result with
            | Some n when n :? JsonArray ->
                return n :?> JsonArray
                    |> Seq.map (fun v -> JsonSerializer.Deserialize<'TField>(v, jsonOptions))
                    |> Seq.toList
            | _ -> return []
        }

    /// Runs an aggregation pipeline
    member _.Aggregate(pipeline: BsonDocument list, ?options: AggregateOptions) : Async<BsonDocument list> =
        async {
            let opts = options |> Option.defaultValue AggregateOptions.Default
            let pipelineJson = pipeline |> List.map (fun d -> d.ToJson()) |> List.toArray
            let! result = transport.CallAsync("aggregate", [| database; name; pipelineJson; opts |])
            match result with
            | Some n when n :? JsonArray ->
                return n :?> JsonArray
                    |> Seq.map (fun v -> BsonDocument.Parse(v.ToJsonString()))
                    |> Seq.toList
            | _ -> return []
        }

    /// Creates an index
    member _.CreateIndex(keys: (string * IndexType) list, ?options: IndexOptions) : Async<string> =
        async {
            let opts = options |> Option.defaultValue IndexOptions.Default
            let keysDoc = BsonDocument()
            for key, indexType in keys do
                let value =
                    match indexType with
                    | IndexType.Ascending -> bInt 1
                    | IndexType.Descending -> bInt -1
                    | IndexType.Text -> bString "text"
                    | IndexType.Hashed -> bString "hashed"
                    | IndexType.Geo2D -> bString "2d"
                    | IndexType.Geo2DSphere -> bString "2dsphere"
                keysDoc.Add(key, value)
            let! result = transport.CallAsync("createIndex", [| database; name; keysDoc.ToJson(); opts |])
            match result with
            | Some n -> return n.GetValue<string>()
            | None -> return ""
        }

    /// Lists all indexes
    member _.ListIndexes() : Async<BsonDocument list> =
        async {
            let! result = transport.CallAsync("listIndexes", [| database; name |])
            match result with
            | Some n when n :? JsonArray ->
                return n :?> JsonArray
                    |> Seq.map (fun v -> BsonDocument.Parse(v.ToJsonString()))
                    |> Seq.toList
            | _ -> return []
        }

    /// Drops an index
    member _.DropIndex(indexName: string) : Async<unit> =
        async {
            let! _ = transport.CallAsync("dropIndex", [| database; name; indexName |])
            return ()
        }

    /// Drops all indexes
    member _.DropIndexes() : Async<unit> =
        async {
            let! _ = transport.CallAsync("dropIndexes", [| database; name |])
            return ()
        }

    /// Watches for changes
    member this.Watch(?pipeline: BsonDocument list) : AsyncSeq<ChangeEvent<'T>> =
        asyncSeq {
            let pipelineJson =
                pipeline
                |> Option.map (List.map (fun d -> d.ToJson()) >> List.toArray)
                |> Option.defaultValue [||]

            let! streamId = transport.CallAsync("watch", [| database; name; pipelineJson |])

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
                            if fd <> null then Some (deserialize fd) else None

                        let docKey =
                            let dk = n.["documentKey"]
                            if dk <> null then
                                let id = dk.["_id"]
                                if id <> null then Some { Value = id.GetValue<string>() } else None
                            else None

                        let updateDesc =
                            let ud = n.["updateDescription"]
                            if ud <> null then
                                Some
                                    { UpdatedFields =
                                          let uf = ud.["updatedFields"]
                                          if uf <> null then
                                              uf :?> JsonObject
                                              |> Seq.map (fun kvp -> kvp.Key, kvp.Value :> obj)
                                              |> Map.ofSeq
                                          else Map.empty
                                      RemovedFields =
                                          let rf = ud.["removedFields"]
                                          if rf <> null then
                                              rf :?> JsonArray |> Seq.map (fun v -> v.GetValue<string>()) |> Seq.toList
                                          else [] }
                            else None

                        let clusterTime =
                            let ct = n.["clusterTime"]
                            if ct <> null then DateTimeOffset.FromUnixTimeMilliseconds(ct.GetValue<int64>())
                            else DateTimeOffset.UtcNow

                        yield
                            { OperationType = opType
                              FullDocument = fullDoc
                              DocumentKey = docKey
                              UpdateDescription = updateDesc
                              ClusterTime = clusterTime }

                        if opType = OperationType.Invalidate then
                            running <- false
                    | None ->
                        do! Async.Sleep(100)
            | None -> ()
        }
