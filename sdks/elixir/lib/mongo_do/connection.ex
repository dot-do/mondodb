defmodule MongoDo.Connection do
  @moduledoc """
  GenServer for managing MongoDB connections.

  Handles connection lifecycle, request/response tracking,
  and automatic reconnection.
  """

  use GenServer
  require Logger

  alias MongoDo.{Transport, Protocol}

  @type t :: %__MODULE__{
          url: String.t(),
          api_key: String.t() | nil,
          transport: Transport.t() | nil,
          pending_requests: %{reference() => {pid(), term()}},
          reconnect_attempts: non_neg_integer(),
          status: :disconnected | :connecting | :connected
        }

  defstruct [
    :url,
    :api_key,
    :transport,
    pending_requests: %{},
    reconnect_attempts: 0,
    status: :disconnected
  ]

  @max_reconnect_attempts 5
  @base_reconnect_delay 1_000
  @request_timeout 30_000

  # Client API

  @doc """
  Start a connection GenServer.

  ## Options

    * `:url` - MongoDB connection URL (required)
    * `:api_key` - API key for authentication
    * `:name` - Process name
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    url = Keyword.fetch!(opts, :url)
    api_key = Keyword.get(opts, :api_key)
    name = Keyword.get(opts, :name)

    state = %__MODULE__{
      url: url,
      api_key: api_key
    }

    GenServer.start_link(__MODULE__, state, name: name)
  end

  @doc """
  Execute a command on the connection.
  """
  @spec execute(GenServer.server(), term(), timeout()) :: term()
  def execute(server, command, timeout \\ @request_timeout) do
    GenServer.call(server, {:execute, command}, timeout)
  end

  @doc """
  Check if connection is alive and connected.
  """
  @spec alive?(GenServer.server()) :: boolean()
  def alive?(server) do
    GenServer.call(server, :alive?)
  catch
    :exit, _ -> false
  end

  @doc """
  Close the connection.
  """
  @spec close(GenServer.server()) :: :ok
  def close(server) do
    GenServer.stop(server, :normal)
  end

  # Server callbacks

  @impl true
  def init(state) do
    Process.flag(:trap_exit, true)
    send(self(), :connect)
    {:ok, state}
  end

  @impl true
  def handle_call({:execute, command}, from, %{status: :connected} = state) do
    ref = make_ref()

    case Protocol.encode(command, ref) do
      {:ok, message} ->
        case Transport.send(state.transport, message) do
          :ok ->
            pending = Map.put(state.pending_requests, ref, from)
            {:noreply, %{state | pending_requests: pending}}

          {:error, reason} ->
            {:reply, {:error, reason}, state}
        end

      {:error, reason} ->
        {:reply, {:error, reason}, state}
    end
  end

  def handle_call({:execute, _command}, _from, %{status: status} = state) do
    {:reply, {:error, {:not_connected, status}}, state}
  end

  def handle_call(:alive?, _from, state) do
    {:reply, state.status == :connected, state}
  end

  @impl true
  def handle_info(:connect, state) do
    case do_connect(state) do
      {:ok, transport} ->
        Logger.info("[MongoDo] Connected to #{state.url}")

        :telemetry.execute(
          [:mongo_do, :connection, :connected],
          %{count: 1},
          %{url: state.url}
        )

        {:noreply, %{state | transport: transport, status: :connected, reconnect_attempts: 0}}

      {:error, reason} ->
        Logger.warning("[MongoDo] Connection failed: #{inspect(reason)}")
        schedule_reconnect(state)
        {:noreply, %{state | status: :disconnected}}
    end
  end

  def handle_info({:transport_message, message}, state) do
    case Protocol.decode(message) do
      {:ok, {ref, result}} ->
        case Map.pop(state.pending_requests, ref) do
          {nil, _pending} ->
            Logger.warning("[MongoDo] Received response for unknown request: #{inspect(ref)}")
            {:noreply, state}

          {from, pending} ->
            GenServer.reply(from, result)
            {:noreply, %{state | pending_requests: pending}}
        end

      {:error, reason} ->
        Logger.error("[MongoDo] Failed to decode message: #{inspect(reason)}")
        {:noreply, state}
    end
  end

  def handle_info({:transport_closed, reason}, state) do
    Logger.warning("[MongoDo] Connection closed: #{inspect(reason)}")

    # Reply to all pending requests with error
    for {_ref, from} <- state.pending_requests do
      GenServer.reply(from, {:error, :connection_closed})
    end

    :telemetry.execute(
      [:mongo_do, :connection, :disconnected],
      %{count: 1},
      %{url: state.url, reason: reason}
    )

    schedule_reconnect(state)

    {:noreply, %{state | transport: nil, status: :disconnected, pending_requests: %{}}}
  end

  def handle_info({:EXIT, _pid, reason}, state) do
    Logger.warning("[MongoDo] Transport process exited: #{inspect(reason)}")
    schedule_reconnect(state)
    {:noreply, %{state | transport: nil, status: :disconnected}}
  end

  def handle_info(:reconnect, state) do
    send(self(), :connect)
    {:noreply, state}
  end

  @impl true
  def terminate(_reason, state) do
    if state.transport do
      Transport.close(state.transport)
    end

    :ok
  end

  # Private functions

  defp do_connect(state) do
    Transport.connect(state.url, api_key: state.api_key, owner: self())
  end

  defp schedule_reconnect(%{reconnect_attempts: attempts} = state)
       when attempts < @max_reconnect_attempts do
    delay = calculate_backoff(attempts)
    Logger.info("[MongoDo] Reconnecting in #{delay}ms (attempt #{attempts + 1})")
    Process.send_after(self(), :reconnect, delay)
    %{state | reconnect_attempts: attempts + 1}
  end

  defp schedule_reconnect(state) do
    Logger.error("[MongoDo] Max reconnection attempts reached for #{state.url}")
    state
  end

  defp calculate_backoff(attempts) do
    # Exponential backoff with jitter
    base = @base_reconnect_delay * :math.pow(2, attempts) |> round()
    jitter = :rand.uniform(div(base, 10))
    min(base + jitter, 30_000)
  end
end
