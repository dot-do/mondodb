defmodule MongoDo.Pool do
  @moduledoc """
  Connection pool for MongoDo.

  Manages a pool of connections for load balancing and fault tolerance.
  """

  use GenServer
  require Logger

  alias MongoDo.Connection

  @type t :: %__MODULE__{
          name: atom(),
          size: pos_integer(),
          url: String.t(),
          api_key: String.t() | nil,
          connections: [pid()],
          next_index: non_neg_integer()
        }

  defstruct [
    :name,
    :size,
    :url,
    :api_key,
    connections: [],
    next_index: 0
  ]

  @default_pool_size 5

  # Client API

  @doc """
  Start the connection pool.
  """
  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @doc """
  Execute a command using a connection from the pool.
  """
  @spec execute(atom(), term(), timeout()) :: term()
  def execute(pool \\ __MODULE__, command, timeout \\ 30_000) do
    case checkout(pool) do
      {:ok, conn} ->
        try do
          Connection.execute(conn, command, timeout)
        after
          checkin(pool, conn)
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Checkout a connection from the pool.
  """
  @spec checkout(atom()) :: {:ok, pid()} | {:error, term()}
  def checkout(pool \\ __MODULE__) do
    GenServer.call(pool, :checkout)
  end

  @doc """
  Return a connection to the pool.
  """
  @spec checkin(atom(), pid()) :: :ok
  def checkin(pool \\ __MODULE__, conn) do
    GenServer.cast(pool, {:checkin, conn})
  end

  @doc """
  Get pool status.
  """
  @spec status(atom()) :: map()
  def status(pool \\ __MODULE__) do
    GenServer.call(pool, :status)
  end

  # Server callbacks

  @impl true
  def init(opts) do
    url = Keyword.get(opts, :url) || get_config(:url)
    api_key = Keyword.get(opts, :api_key) || get_config(:api_key)
    size = Keyword.get(opts, :size) || get_config(:pool_size, @default_pool_size)
    name = Keyword.get(opts, :name, :default)

    state = %__MODULE__{
      name: name,
      size: size,
      url: url,
      api_key: api_key
    }

    # Start connections asynchronously
    if url do
      send(self(), :start_connections)
    else
      Logger.warning("[MongoDo.Pool] No URL configured, pool will be empty")
    end

    {:ok, state}
  end

  @impl true
  def handle_call(:checkout, _from, %{connections: []} = state) do
    {:reply, {:error, :no_connections_available}, state}
  end

  def handle_call(:checkout, _from, state) do
    # Round-robin selection
    index = rem(state.next_index, length(state.connections))
    conn = Enum.at(state.connections, index)

    # Verify connection is alive
    if Connection.alive?(conn) do
      {:reply, {:ok, conn}, %{state | next_index: state.next_index + 1}}
    else
      # Remove dead connection and try next
      connections = List.delete(state.connections, conn)
      new_state = %{state | connections: connections}

      if connections == [] do
        {:reply, {:error, :no_connections_available}, new_state}
      else
        handle_call(:checkout, nil, new_state)
      end
    end
  end

  def handle_call(:status, _from, state) do
    alive_count = Enum.count(state.connections, &Connection.alive?/1)

    status = %{
      name: state.name,
      size: state.size,
      connections: length(state.connections),
      alive: alive_count,
      url: state.url
    }

    {:reply, status, state}
  end

  @impl true
  def handle_cast({:checkin, _conn}, state) do
    # Connections are not actually removed on checkout, just round-robin
    {:noreply, state}
  end

  @impl true
  def handle_info(:start_connections, state) do
    connections =
      for i <- 1..state.size do
        name = via_tuple({state.name, i})

        case start_connection(state, name) do
          {:ok, pid} -> pid
          {:error, _reason} -> nil
        end
      end
      |> Enum.reject(&is_nil/1)

    Logger.info("[MongoDo.Pool] Started #{length(connections)} connections")

    {:noreply, %{state | connections: connections}}
  end

  def handle_info({:DOWN, _ref, :process, pid, reason}, state) do
    Logger.warning("[MongoDo.Pool] Connection #{inspect(pid)} died: #{inspect(reason)}")

    connections = List.delete(state.connections, pid)

    # Try to start a replacement
    send(self(), {:replace_connection, pid})

    {:noreply, %{state | connections: connections}}
  end

  def handle_info({:replace_connection, _old_pid}, state) do
    if length(state.connections) < state.size do
      index = state.size - length(state.connections)
      name = via_tuple({state.name, index})

      case start_connection(state, name) do
        {:ok, pid} ->
          {:noreply, %{state | connections: [pid | state.connections]}}

        {:error, _reason} ->
          # Retry later
          Process.send_after(self(), {:replace_connection, nil}, 5_000)
          {:noreply, state}
      end
    else
      {:noreply, state}
    end
  end

  # Private functions

  defp start_connection(state, name) do
    spec = {
      Connection,
      [
        url: state.url,
        api_key: state.api_key,
        name: name
      ]
    }

    case DynamicSupervisor.start_child(MongoDo.ConnectionSupervisor, spec) do
      {:ok, pid} ->
        Process.monitor(pid)
        {:ok, pid}

      {:error, reason} ->
        Logger.error("[MongoDo.Pool] Failed to start connection: #{inspect(reason)}")
        {:error, reason}
    end
  end

  defp via_tuple(id) do
    {:via, Registry, {MongoDo.Registry, {:connection, id}}}
  end

  defp get_config(key, default \\ nil) do
    Application.get_env(:mongo_do, key, default)
  end
end
