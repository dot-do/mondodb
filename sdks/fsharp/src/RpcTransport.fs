// ============================================================================
// RpcTransport.fs - RPC transport for Mongo.Do F# SDK
// ============================================================================

namespace Mongo.Do

open System
open System.Net.WebSockets
open System.Text
open System.Text.Json
open System.Text.Json.Nodes
open System.Threading
open System.Threading.Tasks
open System.Collections.Concurrent

/// Interface for RPC transport
type IRpcTransport =
    inherit IAsyncDisposable
    abstract member CallAsync: method: string * ?args: obj[] * ?cancellationToken: CancellationToken -> Async<JsonNode option>
    abstract member CloseAsync: unit -> Async<unit>

/// Mock RPC transport for testing
type MockRpcTransport() =
    let handlers = ConcurrentDictionary<string, obj -> JsonNode option>()
    let calls = ResizeArray<string * obj>()
    let mutable disposed = false

    member _.On(method: string, handler: obj -> JsonNode option) =
        handlers.[method] <- handler

    member _.OnReturn(method: string, result: JsonNode option) =
        handlers.[method] <- fun _ -> result

    member _.OnThrow(method: string, ex: exn) =
        handlers.[method] <- fun _ -> raise ex

    member _.Calls = calls :> seq<string * obj>

    member _.ClearCalls() = calls.Clear()

    interface IRpcTransport with
        member _.CallAsync(method, ?args, ?cancellationToken) =
            async {
                if disposed then
                    raise (ObjectDisposedException(nameof(MockRpcTransport)))

                let argsValue = args |> Option.defaultValue [||] |> box
                calls.Add((method, argsValue))

                match handlers.TryGetValue(method) with
                | true, handler -> return handler argsValue
                | false, _ -> return failwithf "No handler registered for method: %s" method
            }

        member _.CloseAsync() =
            async {
                disposed <- true
            }

    interface IAsyncDisposable with
        member this.DisposeAsync() =
            (this :> IRpcTransport).CloseAsync() |> Async.StartAsTask |> ValueTask

/// WebSocket-based RPC transport
type WebSocketRpcTransport(url: string, settings: MongoClientSettings) =
    let mutable webSocket: ClientWebSocket option = None
    let mutable connected = false
    let mutable messageId = 0
    let pendingRequests = ConcurrentDictionary<int, TaskCompletionSource<JsonNode option>>()
    let sendLock = SemaphoreSlim(1, 1)
    let mutable receiveLoopCts: CancellationTokenSource option = None
    let mutable receiveLoopTask: Task option = None

    let ensureConnectedAsync (cancellationToken: CancellationToken) =
        async {
            if connected && webSocket.IsSome && webSocket.Value.State = WebSocketState.Open then
                return ()
            else
                let ws = new ClientWebSocket()

                let wsUrl =
                    url
                        .Replace("http://", "ws://")
                        .Replace("https://", "wss://")

                match settings.ApiKey with
                | Some apiKey -> ws.Options.SetRequestHeader("Authorization", sprintf "Bearer %s" apiKey)
                | None -> ()

                match settings.ApplicationName with
                | Some appName -> ws.Options.SetRequestHeader("X-Application-Name", appName)
                | None -> ()

                use cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken)
                cts.CancelAfter(settings.ConnectTimeout)

                do! ws.ConnectAsync(Uri(wsUrl), cts.Token) |> Async.AwaitTask
                webSocket <- Some ws
                connected <- true

                receiveLoopCts <- Some (new CancellationTokenSource())
                receiveLoopTask <- Some (Task.Run(fun () -> receiveLoopAsync receiveLoopCts.Value.Token))
        }

    and receiveLoopAsync (cancellationToken: CancellationToken) =
        task {
            let buffer = Array.zeroCreate<byte> 16384

            try
                while not cancellationToken.IsCancellationRequested && webSocket.IsSome && webSocket.Value.State = WebSocketState.Open do
                    let! result = webSocket.Value.ReceiveAsync(ArraySegment(buffer), cancellationToken)

                    if result.MessageType = WebSocketMessageType.Close then
                        return ()

                    if result.MessageType = WebSocketMessageType.Text then
                        let json = Encoding.UTF8.GetString(buffer, 0, result.Count)
                        let response = JsonNode.Parse(json)

                        let id = response.["id"]
                        if id <> null then
                            let msgId = id.GetValue<int>()
                            match pendingRequests.TryRemove(msgId) with
                            | true, tcs ->
                                let error = response.["error"]
                                if error <> null then
                                    let errorMessage =
                                        let msg = error.["message"]
                                        if msg <> null then msg.GetValue<string>() else "Unknown error"
                                    tcs.SetException(Exception(errorMessage))
                                else
                                    tcs.SetResult(response.["result"] |> Option.ofObj)
                            | false, _ -> ()
            with
            | :? OperationCanceledException -> ()
            | ex ->
                for kvp in pendingRequests do
                    kvp.Value.TrySetException(Exception(sprintf "Connection lost: %s" ex.Message)) |> ignore
        }

    interface IRpcTransport with
        member _.CallAsync(method, ?args, ?cancellationToken) =
            async {
                let ct = cancellationToken |> Option.defaultValue CancellationToken.None
                do! ensureConnectedAsync ct

                let msgId = Interlocked.Increment(&messageId)

                let request = JsonObject()
                request.["id"] <- JsonValue.Create(msgId)
                request.["method"] <- JsonValue.Create(method)
                request.["params"] <- JsonSerializer.SerializeToNode(args |> Option.defaultValue [||])

                let tcs = TaskCompletionSource<JsonNode option>()
                pendingRequests.[msgId] <- tcs

                try
                    let json = request.ToJsonString()
                    let bytes = Encoding.UTF8.GetBytes(json)

                    do! sendLock.WaitAsync(ct) |> Async.AwaitTask
                    try
                        do! webSocket.Value.SendAsync(ArraySegment(bytes), WebSocketMessageType.Text, true, ct) |> Async.AwaitTask
                    finally
                        sendLock.Release() |> ignore

                    use cts = CancellationTokenSource.CreateLinkedTokenSource(ct)
                    cts.CancelAfter(settings.SocketTimeout)

                    return! tcs.Task |> Async.AwaitTask
                finally
                    pendingRequests.TryRemove(msgId) |> ignore
            }

        member _.CloseAsync() =
            async {
                match receiveLoopCts with
                | Some cts -> cts.Cancel()
                | None -> ()

                match webSocket with
                | Some ws when ws.State = WebSocketState.Open ->
                    try
                        do! ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Client closed", CancellationToken.None) |> Async.AwaitTask
                    with
                    | _ -> ()
                | _ -> ()

                match receiveLoopTask with
                | Some task ->
                    try
                        do! task |> Async.AwaitTask
                    with
                    | _ -> ()
                | None -> ()

                match webSocket with
                | Some ws -> ws.Dispose()
                | None -> ()

                match receiveLoopCts with
                | Some cts -> cts.Dispose()
                | None -> ()

                sendLock.Dispose()
                connected <- false
            }

    interface IAsyncDisposable with
        member this.DisposeAsync() =
            (this :> IRpcTransport).CloseAsync() |> Async.StartAsTask |> ValueTask
