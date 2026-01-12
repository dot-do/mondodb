// ============================================================================
// Bson.fs - BSON types and operations for Mongo.Do F# SDK
// ============================================================================

namespace Mongo.Do

open System
open System.Collections.Generic
open System.Text.Json
open System.Text.Json.Nodes

/// BSON value types
[<RequireQualifiedAccess>]
type BsonType =
    | Double
    | String
    | Document
    | Array
    | Binary
    | ObjectId
    | Boolean
    | DateTime
    | Null
    | RegularExpression
    | JavaScript
    | Int32
    | Timestamp
    | Int64
    | Decimal128
    | MinKey
    | MaxKey

/// Represents a BSON value
[<RequireQualifiedAccess>]
type BsonValue =
    | Null
    | Boolean of bool
    | Int32 of int
    | Int64 of int64
    | Double of float
    | String of string
    | ObjectId of ObjectId
    | DateTime of DateTimeOffset
    | Binary of byte[]
    | Array of BsonValue list
    | Document of BsonDocument
    | RegularExpression of pattern: string * options: string
    | MinKey
    | MaxKey

    member this.Type =
        match this with
        | Null -> BsonType.Null
        | Boolean _ -> BsonType.Boolean
        | Int32 _ -> BsonType.Int32
        | Int64 _ -> BsonType.Int64
        | Double _ -> BsonType.Double
        | String _ -> BsonType.String
        | ObjectId _ -> BsonType.ObjectId
        | DateTime _ -> BsonType.DateTime
        | Binary _ -> BsonType.Binary
        | Array _ -> BsonType.Array
        | Document _ -> BsonType.Document
        | RegularExpression _ -> BsonType.RegularExpression
        | MinKey -> BsonType.MinKey
        | MaxKey -> BsonType.MaxKey

    member this.AsBoolean =
        match this with
        | Boolean b -> Some b
        | _ -> None

    member this.AsInt32 =
        match this with
        | Int32 i -> Some i
        | Int64 l when l >= int64 Int32.MinValue && l <= int64 Int32.MaxValue -> Some (int l)
        | _ -> None

    member this.AsInt64 =
        match this with
        | Int64 l -> Some l
        | Int32 i -> Some (int64 i)
        | _ -> None

    member this.AsDouble =
        match this with
        | Double d -> Some d
        | Int32 i -> Some (float i)
        | Int64 l -> Some (float l)
        | _ -> None

    member this.AsString =
        match this with
        | String s -> Some s
        | _ -> None

    member this.AsObjectId =
        match this with
        | ObjectId id -> Some id
        | _ -> None

    member this.AsDateTime =
        match this with
        | DateTime dt -> Some dt
        | _ -> None

    member this.AsBinary =
        match this with
        | Binary bytes -> Some bytes
        | _ -> None

    member this.AsArray =
        match this with
        | Array arr -> Some arr
        | _ -> None

    member this.AsDocument =
        match this with
        | Document doc -> Some doc
        | _ -> None

    static member FromObject(value: obj) : BsonValue =
        match value with
        | null -> Null
        | :? bool as b -> Boolean b
        | :? int as i -> Int32 i
        | :? int64 as l -> Int64 l
        | :? float as d -> Double d
        | :? decimal as d -> Double (float d)
        | :? string as s -> String s
        | :? ObjectId as id -> ObjectId id
        | :? DateTimeOffset as dt -> DateTime dt
        | :? System.DateTime as dt -> DateTime (DateTimeOffset(dt))
        | :? (byte[]) as bytes -> Binary bytes
        | :? BsonValue as bv -> bv
        | :? BsonDocument as doc -> Document doc
        | :? IEnumerable<BsonValue> as arr -> Array (arr |> Seq.toList)
        | :? IDictionary<string, obj> as dict ->
            let doc = BsonDocument()
            for kvp in dict do
                doc.Add(kvp.Key, BsonValue.FromObject(kvp.Value))
            Document doc
        | _ -> String (value.ToString())

/// Represents a BSON document
and BsonDocument() =
    let elements = Dictionary<string, BsonValue>()
    let order = ResizeArray<string>()

    member _.Item
        with get(key: string) =
            match elements.TryGetValue(key) with
            | true, value -> value
            | false, _ -> BsonValue.Null
        and set (key: string) (value: BsonValue) =
            if not (elements.ContainsKey(key)) then
                order.Add(key)
            elements.[key] <- value

    member _.Add(key: string, value: BsonValue) =
        if not (elements.ContainsKey(key)) then
            order.Add(key)
        elements.[key] <- value

    member _.Add(key: string, value: obj) =
        let bsonValue = BsonValue.FromObject(value)
        if not (elements.ContainsKey(key)) then
            order.Add(key)
        elements.[key] <- bsonValue

    member _.TryGetValue(key: string) =
        match elements.TryGetValue(key) with
        | true, value -> Some value
        | false, _ -> None

    member _.ContainsKey(key: string) =
        elements.ContainsKey(key)

    member _.Remove(key: string) =
        if elements.Remove(key) then
            order.Remove(key) |> ignore
            true
        else
            false

    member _.Keys = order :> seq<string>

    member _.Values = order |> Seq.map (fun k -> elements.[k])

    member _.Count = elements.Count

    member _.Clear() =
        elements.Clear()
        order.Clear()

    member this.ToJson() =
        let rec valueToJson (value: BsonValue) =
            match value with
            | BsonValue.Null -> "null"
            | BsonValue.Boolean b -> if b then "true" else "false"
            | BsonValue.Int32 i -> string i
            | BsonValue.Int64 l -> string l
            | BsonValue.Double d -> string d
            | BsonValue.String s -> sprintf "\"%s\"" (s.Replace("\"", "\\\""))
            | BsonValue.ObjectId id -> sprintf "{\"$oid\":\"%s\"}" id.Value
            | BsonValue.DateTime dt -> sprintf "{\"$date\":\"%s\"}" (dt.ToString("o"))
            | BsonValue.Binary bytes -> sprintf "{\"$binary\":\"%s\"}" (Convert.ToBase64String(bytes))
            | BsonValue.Array arr ->
                let items = arr |> List.map valueToJson |> String.concat ","
                sprintf "[%s]" items
            | BsonValue.Document doc -> doc.ToJson()
            | BsonValue.RegularExpression (pattern, options) ->
                sprintf "{\"$regex\":\"%s\",\"$options\":\"%s\"}" pattern options
            | BsonValue.MinKey -> "{\"$minKey\":1}"
            | BsonValue.MaxKey -> "{\"$maxKey\":1}"

        let pairs =
            order
            |> Seq.map (fun key -> sprintf "\"%s\":%s" key (valueToJson elements.[key]))
            |> String.concat ","
        sprintf "{%s}" pairs

    static member Parse(json: string) : BsonDocument =
        let doc = BsonDocument()
        let node = JsonNode.Parse(json)
        BsonDocument.FromJsonNode(node, doc)
        doc

    static member private FromJsonNode(node: JsonNode, doc: BsonDocument) =
        match node with
        | :? JsonObject as obj ->
            for kvp in obj do
                doc.Add(kvp.Key, BsonDocument.JsonNodeToBsonValue(kvp.Value))
        | _ -> ()

    static member private JsonNodeToBsonValue(node: JsonNode) : BsonValue =
        match node with
        | null -> BsonValue.Null
        | :? JsonValue as value ->
            match value.GetValueKind() with
            | JsonValueKind.True -> BsonValue.Boolean true
            | JsonValueKind.False -> BsonValue.Boolean false
            | JsonValueKind.Number when value.TryGetValue<int>() |> fst -> BsonValue.Int32 (value.GetValue<int>())
            | JsonValueKind.Number when value.TryGetValue<int64>() |> fst -> BsonValue.Int64 (value.GetValue<int64>())
            | JsonValueKind.Number -> BsonValue.Double (value.GetValue<float>())
            | JsonValueKind.String -> BsonValue.String (value.GetValue<string>())
            | _ -> BsonValue.Null
        | :? JsonArray as arr ->
            arr
            |> Seq.map BsonDocument.JsonNodeToBsonValue
            |> Seq.toList
            |> BsonValue.Array
        | :? JsonObject as obj ->
            // Check for special BSON extended JSON types
            if obj.ContainsKey("$oid") then
                let oid = obj.["$oid"].GetValue<string>()
                BsonValue.ObjectId { Value = oid }
            elif obj.ContainsKey("$date") then
                let date = obj.["$date"].GetValue<string>()
                match DateTimeOffset.TryParse(date) with
                | true, dt -> BsonValue.DateTime dt
                | false, _ -> BsonValue.Null
            elif obj.ContainsKey("$binary") then
                let binary = obj.["$binary"].GetValue<string>()
                BsonValue.Binary (Convert.FromBase64String(binary))
            elif obj.ContainsKey("$regex") then
                let pattern = obj.["$regex"].GetValue<string>()
                let options = if obj.ContainsKey("$options") then obj.["$options"].GetValue<string>() else ""
                BsonValue.RegularExpression (pattern, options)
            elif obj.ContainsKey("$minKey") then
                BsonValue.MinKey
            elif obj.ContainsKey("$maxKey") then
                BsonValue.MaxKey
            else
                let doc = BsonDocument()
                for kvp in obj do
                    doc.Add(kvp.Key, BsonDocument.JsonNodeToBsonValue(kvp.Value))
                BsonValue.Document doc
        | _ -> BsonValue.Null

    interface System.Collections.IEnumerable with
        member this.GetEnumerator() =
            (order |> Seq.map (fun k -> KeyValuePair(k, elements.[k]))).GetEnumerator() :> System.Collections.IEnumerator

    interface IEnumerable<KeyValuePair<string, BsonValue>> with
        member this.GetEnumerator() =
            (order |> Seq.map (fun k -> KeyValuePair(k, elements.[k]))).GetEnumerator()

/// Module for creating BsonDocument values
[<RequireQualifiedAccess>]
module BsonDocument =
    /// Create an empty document
    let empty = BsonDocument()

    /// Create a document from key-value pairs
    let ofList (pairs: (string * BsonValue) list) =
        let doc = BsonDocument()
        for key, value in pairs do
            doc.Add(key, value)
        doc

    /// Create a document from a sequence
    let ofSeq (pairs: seq<string * BsonValue>) =
        let doc = BsonDocument()
        for key, value in pairs do
            doc.Add(key, value)
        doc

    /// Get a value from the document
    let get (key: string) (doc: BsonDocument) =
        doc.TryGetValue(key)

    /// Set a value in the document
    let set (key: string) (value: BsonValue) (doc: BsonDocument) =
        doc.[key] <- value
        doc

    /// Add a value to the document
    let add (key: string) (value: BsonValue) (doc: BsonDocument) =
        doc.Add(key, value)
        doc

    /// Remove a key from the document
    let remove (key: string) (doc: BsonDocument) =
        doc.Remove(key) |> ignore
        doc

    /// Check if document contains a key
    let containsKey (key: string) (doc: BsonDocument) =
        doc.ContainsKey(key)

    /// Get all keys
    let keys (doc: BsonDocument) =
        doc.Keys

    /// Get all values
    let values (doc: BsonDocument) =
        doc.Values

    /// Convert to JSON string
    let toJson (doc: BsonDocument) =
        doc.ToJson()

    /// Parse from JSON string
    let parse (json: string) =
        BsonDocument.Parse(json)

/// Helper functions for creating BsonValues
[<AutoOpen>]
module BsonValueHelpers =
    let bNull = BsonValue.Null
    let bBool b = BsonValue.Boolean b
    let bInt i = BsonValue.Int32 i
    let bLong l = BsonValue.Int64 l
    let bDouble d = BsonValue.Double d
    let bString s = BsonValue.String s
    let bObjectId id = BsonValue.ObjectId id
    let bDateTime dt = BsonValue.DateTime dt
    let bBinary bytes = BsonValue.Binary bytes
    let bArray arr = BsonValue.Array arr
    let bDocument doc = BsonValue.Document doc
    let bRegex pattern options = BsonValue.RegularExpression (pattern, options)
    let bMinKey = BsonValue.MinKey
    let bMaxKey = BsonValue.MaxKey
