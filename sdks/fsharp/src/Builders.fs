// ============================================================================
// Builders.fs - Fluent builders for filters, updates, and projections
// ============================================================================

namespace Mongo.Do

open System

/// Filter definition module
[<RequireQualifiedAccess>]
module Filter =

    /// Empty filter (matches all documents)
    let empty = BsonDocument()

    /// Equality filter
    let eq (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ field, BsonValue.FromObject(value) ]

    /// Not equal filter
    let ne (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$ne", BsonValue.FromObject(value) ]) ]

    /// Greater than filter
    let gt (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$gt", BsonValue.FromObject(value) ]) ]

    /// Greater than or equal filter
    let gte (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$gte", BsonValue.FromObject(value) ]) ]

    /// Less than filter
    let lt (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$lt", BsonValue.FromObject(value) ]) ]

    /// Less than or equal filter
    let lte (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$lte", BsonValue.FromObject(value) ]) ]

    /// In filter
    let in' (field: string) (values: 'T list) : BsonDocument =
        let arr = values |> List.map BsonValue.FromObject |> bArray
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$in", arr ]) ]

    /// Not in filter
    let nin (field: string) (values: 'T list) : BsonDocument =
        let arr = values |> List.map BsonValue.FromObject |> bArray
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$nin", arr ]) ]

    /// Exists filter
    let exists (field: string) (exists: bool) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$exists", bBool exists ]) ]

    /// Type filter
    let typeIs (field: string) (bsonType: BsonType) : BsonDocument =
        let typeNum =
            match bsonType with
            | BsonType.Double -> 1
            | BsonType.String -> 2
            | BsonType.Document -> 3
            | BsonType.Array -> 4
            | BsonType.Binary -> 5
            | BsonType.ObjectId -> 7
            | BsonType.Boolean -> 8
            | BsonType.DateTime -> 9
            | BsonType.Null -> 10
            | BsonType.RegularExpression -> 11
            | BsonType.JavaScript -> 13
            | BsonType.Int32 -> 16
            | BsonType.Timestamp -> 17
            | BsonType.Int64 -> 18
            | BsonType.Decimal128 -> 19
            | BsonType.MinKey -> -1
            | BsonType.MaxKey -> 127
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$type", bInt typeNum ]) ]

    /// Regex filter
    let regex (field: string) (pattern: string) (?options: string) : BsonDocument =
        let opts = options |> Option.defaultValue ""
        let regexDoc = BsonDocument.ofList [ "$regex", bString pattern; "$options", bString opts ]
        BsonDocument.ofList [ field, bDocument regexDoc ]

    /// Text search filter
    let text (search: string) (?language: string) : BsonDocument =
        let textDoc =
            match language with
            | Some lang -> BsonDocument.ofList [ "$search", bString search; "$language", bString lang ]
            | None -> BsonDocument.ofList [ "$search", bString search ]
        BsonDocument.ofList [ "$text", bDocument textDoc ]

    /// AND filter
    let and' (filters: BsonDocument list) : BsonDocument =
        let arr = filters |> List.map (fun f -> bDocument f) |> bArray
        BsonDocument.ofList [ "$and", arr ]

    /// OR filter
    let or' (filters: BsonDocument list) : BsonDocument =
        let arr = filters |> List.map (fun f -> bDocument f) |> bArray
        BsonDocument.ofList [ "$or", arr ]

    /// NOR filter
    let nor (filters: BsonDocument list) : BsonDocument =
        let arr = filters |> List.map (fun f -> bDocument f) |> bArray
        BsonDocument.ofList [ "$nor", arr ]

    /// NOT filter
    let not' (filter: BsonDocument) : BsonDocument =
        BsonDocument.ofList [ "$not", bDocument filter ]

    /// Element match filter for arrays
    let elemMatch (field: string) (filter: BsonDocument) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$elemMatch", bDocument filter ]) ]

    /// Size filter for arrays
    let size (field: string) (size: int) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$size", bInt size ]) ]

    /// All filter for arrays
    let all (field: string) (values: 'T list) : BsonDocument =
        let arr = values |> List.map BsonValue.FromObject |> bArray
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$all", arr ]) ]

    /// By ObjectId
    let byId (id: ObjectId) : BsonDocument =
        eq "_id" id

    /// Combine filters with AND (using operator)
    let (&&&) (a: BsonDocument) (b: BsonDocument) : BsonDocument =
        and' [ a; b ]

    /// Combine filters with OR (using operator)
    let (|||) (a: BsonDocument) (b: BsonDocument) : BsonDocument =
        or' [ a; b ]

/// Update definition module
[<RequireQualifiedAccess>]
module Update =

    /// Set a field value
    let set (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ "$set", bDocument (BsonDocument.ofList [ field, BsonValue.FromObject(value) ]) ]

    /// Set on insert only
    let setOnInsert (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ "$setOnInsert", bDocument (BsonDocument.ofList [ field, BsonValue.FromObject(value) ]) ]

    /// Unset a field
    let unset (field: string) : BsonDocument =
        BsonDocument.ofList [ "$unset", bDocument (BsonDocument.ofList [ field, bString "" ]) ]

    /// Increment a field
    let inc (field: string) (value: int64) : BsonDocument =
        BsonDocument.ofList [ "$inc", bDocument (BsonDocument.ofList [ field, bLong value ]) ]

    /// Increment by double
    let incDouble (field: string) (value: float) : BsonDocument =
        BsonDocument.ofList [ "$inc", bDocument (BsonDocument.ofList [ field, bDouble value ]) ]

    /// Multiply a field
    let mul (field: string) (value: int64) : BsonDocument =
        BsonDocument.ofList [ "$mul", bDocument (BsonDocument.ofList [ field, bLong value ]) ]

    /// Multiply by double
    let mulDouble (field: string) (value: float) : BsonDocument =
        BsonDocument.ofList [ "$mul", bDocument (BsonDocument.ofList [ field, bDouble value ]) ]

    /// Set to minimum
    let min (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ "$min", bDocument (BsonDocument.ofList [ field, BsonValue.FromObject(value) ]) ]

    /// Set to maximum
    let max (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ "$max", bDocument (BsonDocument.ofList [ field, BsonValue.FromObject(value) ]) ]

    /// Rename a field
    let rename (field: string) (newName: string) : BsonDocument =
        BsonDocument.ofList [ "$rename", bDocument (BsonDocument.ofList [ field, bString newName ]) ]

    /// Set to current date
    let currentDate (field: string) : BsonDocument =
        BsonDocument.ofList [ "$currentDate", bDocument (BsonDocument.ofList [ field, bBool true ]) ]

    /// Set to current timestamp
    let currentTimestamp (field: string) : BsonDocument =
        let typeDoc = BsonDocument.ofList [ "$type", bString "timestamp" ]
        BsonDocument.ofList [ "$currentDate", bDocument (BsonDocument.ofList [ field, bDocument typeDoc ]) ]

    /// Push to array
    let push (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ "$push", bDocument (BsonDocument.ofList [ field, BsonValue.FromObject(value) ]) ]

    /// Push each to array
    let pushEach (field: string) (values: 'T list) (?slice: int) (?position: int) : BsonDocument =
        let arr = values |> List.map BsonValue.FromObject |> bArray
        let eachDoc = BsonDocument.ofList [ "$each", arr ]
        slice |> Option.iter (fun s -> eachDoc.Add("$slice", bInt s))
        position |> Option.iter (fun p -> eachDoc.Add("$position", bInt p))
        BsonDocument.ofList [ "$push", bDocument (BsonDocument.ofList [ field, bDocument eachDoc ]) ]

    /// Pull from array
    let pull (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ "$pull", bDocument (BsonDocument.ofList [ field, BsonValue.FromObject(value) ]) ]

    /// Pull all from array
    let pullAll (field: string) (values: 'T list) : BsonDocument =
        let arr = values |> List.map BsonValue.FromObject |> bArray
        BsonDocument.ofList [ "$pullAll", bDocument (BsonDocument.ofList [ field, arr ]) ]

    /// Pop from array
    let pop (field: string) (fromEnd: bool) : BsonDocument =
        let value = if fromEnd then 1 else -1
        BsonDocument.ofList [ "$pop", bDocument (BsonDocument.ofList [ field, bInt value ]) ]

    /// Add to set
    let addToSet (field: string) (value: 'T) : BsonDocument =
        BsonDocument.ofList [ "$addToSet", bDocument (BsonDocument.ofList [ field, BsonValue.FromObject(value) ]) ]

    /// Add each to set
    let addToSetEach (field: string) (values: 'T list) : BsonDocument =
        let arr = values |> List.map BsonValue.FromObject |> bArray
        let eachDoc = BsonDocument.ofList [ "$each", arr ]
        BsonDocument.ofList [ "$addToSet", bDocument (BsonDocument.ofList [ field, bDocument eachDoc ]) ]

    /// Combine updates
    let combine (updates: BsonDocument list) : BsonDocument =
        let result = BsonDocument()
        for update in updates do
            for kvp in update do
                match result.TryGetValue(kvp.Key) with
                | Some (BsonValue.Document existing) when kvp.Value.AsDocument.IsSome ->
                    let newDoc = kvp.Value.AsDocument.Value
                    for innerKvp in newDoc do
                        existing.Add(innerKvp.Key, innerKvp.Value)
                | _ ->
                    result.Add(kvp.Key, kvp.Value)
        result

    /// Combine updates with operator
    let (+++) (a: BsonDocument) (b: BsonDocument) : BsonDocument =
        combine [ a; b ]

/// Projection definition module
[<RequireQualifiedAccess>]
module Projection =

    /// Include fields
    let include' (fields: string list) : BsonDocument =
        fields
        |> List.map (fun f -> f, bInt 1)
        |> BsonDocument.ofList

    /// Exclude fields
    let exclude (fields: string list) : BsonDocument =
        fields
        |> List.map (fun f -> f, bInt 0)
        |> BsonDocument.ofList

    /// Exclude _id field
    let excludeId : BsonDocument =
        BsonDocument.ofList [ "_id", bInt 0 ]

    /// Slice array
    let slice (field: string) (count: int) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$slice", bInt count ]) ]

    /// Slice array with skip
    let sliceWithSkip (field: string) (skip: int) (count: int) : BsonDocument =
        let arr = bArray [ bInt skip; bInt count ]
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$slice", arr ]) ]

    /// Element match projection
    let elemMatch (field: string) (filter: BsonDocument) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$elemMatch", bDocument filter ]) ]

    /// Text score projection
    let textScore (field: string) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$meta", bString "textScore" ]) ]

/// Sort definition module
[<RequireQualifiedAccess>]
module Sort =

    /// Sort ascending
    let asc (field: string) : BsonDocument =
        BsonDocument.ofList [ field, bInt 1 ]

    /// Sort descending
    let desc (field: string) : BsonDocument =
        BsonDocument.ofList [ field, bInt -1 ]

    /// Sort by text score
    let textScore (field: string) : BsonDocument =
        BsonDocument.ofList [ field, bDocument (BsonDocument.ofList [ "$meta", bString "textScore" ]) ]

    /// Combine sorts
    let combine (sorts: BsonDocument list) : BsonDocument =
        let result = BsonDocument()
        for sort in sorts do
            for kvp in sort do
                result.Add(kvp.Key, kvp.Value)
        result

    /// Combine sorts with operator
    let (>>>) (a: BsonDocument) (b: BsonDocument) : BsonDocument =
        combine [ a; b ]

/// Index definition module
[<RequireQualifiedAccess>]
module Index =

    /// Ascending index
    let asc (field: string) : (string * IndexType) =
        field, IndexType.Ascending

    /// Descending index
    let desc (field: string) : (string * IndexType) =
        field, IndexType.Descending

    /// Text index
    let text (field: string) : (string * IndexType) =
        field, IndexType.Text

    /// Hashed index
    let hashed (field: string) : (string * IndexType) =
        field, IndexType.Hashed

    /// 2D geo index
    let geo2d (field: string) : (string * IndexType) =
        field, IndexType.Geo2D

    /// 2DSphere geo index
    let geo2dsphere (field: string) : (string * IndexType) =
        field, IndexType.Geo2DSphere

/// Aggregation pipeline module
[<RequireQualifiedAccess>]
module Pipeline =

    /// $match stage
    let match' (filter: BsonDocument) : BsonDocument =
        BsonDocument.ofList [ "$match", bDocument filter ]

    /// $project stage
    let project (projection: BsonDocument) : BsonDocument =
        BsonDocument.ofList [ "$project", bDocument projection ]

    /// $group stage
    let group (groupBy: BsonValue) (accumulators: (string * BsonDocument) list) : BsonDocument =
        let groupDoc = BsonDocument()
        groupDoc.Add("_id", groupBy)
        for field, acc in accumulators do
            groupDoc.Add(field, bDocument acc)
        BsonDocument.ofList [ "$group", bDocument groupDoc ]

    /// $sort stage
    let sort (sortDoc: BsonDocument) : BsonDocument =
        BsonDocument.ofList [ "$sort", bDocument sortDoc ]

    /// $limit stage
    let limit (n: int) : BsonDocument =
        BsonDocument.ofList [ "$limit", bInt n ]

    /// $skip stage
    let skip (n: int) : BsonDocument =
        BsonDocument.ofList [ "$skip", bInt n ]

    /// $unwind stage
    let unwind (path: string) : BsonDocument =
        BsonDocument.ofList [ "$unwind", bString path ]

    /// $lookup stage
    let lookup (from: string) (localField: string) (foreignField: string) (as': string) : BsonDocument =
        let lookupDoc =
            BsonDocument.ofList
                [ "from", bString from
                  "localField", bString localField
                  "foreignField", bString foreignField
                  "as", bString as' ]
        BsonDocument.ofList [ "$lookup", bDocument lookupDoc ]

    /// $out stage
    let out (collection: string) : BsonDocument =
        BsonDocument.ofList [ "$out", bString collection ]

    /// $count stage
    let count (field: string) : BsonDocument =
        BsonDocument.ofList [ "$count", bString field ]

    /// $addFields stage
    let addFields (fields: (string * BsonValue) list) : BsonDocument =
        BsonDocument.ofList [ "$addFields", bDocument (BsonDocument.ofList fields) ]

    /// $replaceRoot stage
    let replaceRoot (newRoot: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$replaceRoot", bDocument (BsonDocument.ofList [ "newRoot", newRoot ]) ]

    /// Accumulator: $sum
    let sum (expr: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$sum", expr ]

    /// Accumulator: $avg
    let avg (expr: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$avg", expr ]

    /// Accumulator: $min
    let min (expr: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$min", expr ]

    /// Accumulator: $max
    let max (expr: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$max", expr ]

    /// Accumulator: $first
    let first (expr: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$first", expr ]

    /// Accumulator: $last
    let last (expr: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$last", expr ]

    /// Accumulator: $push
    let push (expr: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$push", expr ]

    /// Accumulator: $addToSet
    let addToSet (expr: BsonValue) : BsonDocument =
        BsonDocument.ofList [ "$addToSet", expr ]
