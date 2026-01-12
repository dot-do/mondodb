defmodule MongoDo.Transport do
  @moduledoc """
  Transport layer abstraction for MongoDB connections.

  Supports both HTTP and WebSocket transports.
  """

  @type t :: %__MODULE__{
          type: :http | :websocket,
          url: String.t(),
          api_key: String.t() | nil,
          conn: term(),
          owner: pid()
        }

  defstruct [:type, :url, :api_key, :conn, :owner]

  @callback connect(String.t(), keyword()) :: {:ok, t()} | {:error, term()}
  @callback send(t(), binary()) :: :ok | {:error, term()}
  @callback close(t()) :: :ok

  @doc """
  Connect to the MongoDB server.

  Automatically selects WebSocket for real-time features or HTTP for simple operations.

  ## Options

    * `:api_key` - API key for authentication
    * `:owner` - Process to receive transport messages
    * `:transport` - Force specific transport (:http or :websocket)
  """
  @spec connect(String.t(), keyword()) :: {:ok, t()} | {:error, term()}
  def connect(url, opts \\ []) do
    transport_type = Keyword.get(opts, :transport, :http)

    case transport_type do
      :http -> MongoDo.Transport.HTTP.connect(url, opts)
      :websocket -> MongoDo.Transport.WebSocket.connect(url, opts)
    end
  end

  @doc """
  Send a message over the transport.
  """
  @spec send(t(), binary()) :: :ok | {:error, term()}
  def send(%__MODULE__{type: :http} = transport, message) do
    MongoDo.Transport.HTTP.send(transport, message)
  end

  def send(%__MODULE__{type: :websocket} = transport, message) do
    MongoDo.Transport.WebSocket.send(transport, message)
  end

  @doc """
  Close the transport connection.
  """
  @spec close(t()) :: :ok
  def close(%__MODULE__{type: :http} = transport) do
    MongoDo.Transport.HTTP.close(transport)
  end

  def close(%__MODULE__{type: :websocket} = transport) do
    MongoDo.Transport.WebSocket.close(transport)
  end
end

defmodule MongoDo.Transport.HTTP do
  @moduledoc """
  HTTP transport for MongoDB operations.

  Uses Req for HTTP requests.
  """

  alias MongoDo.Transport

  @doc """
  Connect via HTTP (stateless, just validates URL).
  """
  @spec connect(String.t(), keyword()) :: {:ok, Transport.t()} | {:error, term()}
  def connect(url, opts) do
    api_key = Keyword.get(opts, :api_key)
    owner = Keyword.get(opts, :owner, self())

    transport = %Transport{
      type: :http,
      url: url,
      api_key: api_key,
      conn: nil,
      owner: owner
    }

    {:ok, transport}
  end

  @doc """
  Send a message via HTTP POST.
  """
  @spec send(Transport.t(), binary()) :: :ok | {:error, term()}
  def send(%Transport{url: url, api_key: api_key, owner: owner}, message) do
    headers = build_headers(api_key)

    case Req.post(url, body: message, headers: headers) do
      {:ok, %{status: status, body: body}} when status in 200..299 ->
        Kernel.send(owner, {:transport_message, body})
        :ok

      {:ok, %{status: status, body: body}} ->
        {:error, {:http_error, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Close HTTP transport (no-op for stateless HTTP).
  """
  @spec close(Transport.t()) :: :ok
  def close(_transport) do
    :ok
  end

  defp build_headers(nil), do: [{"content-type", "application/json"}]

  defp build_headers(api_key) do
    [
      {"content-type", "application/json"},
      {"authorization", "Bearer #{api_key}"}
    ]
  end
end

defmodule MongoDo.Transport.WebSocket do
  @moduledoc """
  WebSocket transport for MongoDB operations.

  Uses WebSockex for persistent connections and real-time features.
  """

  alias MongoDo.Transport

  @doc """
  Connect via WebSocket.
  """
  @spec connect(String.t(), keyword()) :: {:ok, Transport.t()} | {:error, term()}
  def connect(url, opts) do
    api_key = Keyword.get(opts, :api_key)
    owner = Keyword.get(opts, :owner, self())

    ws_url = http_to_ws(url)
    headers = build_headers(api_key)

    case WebSockex.start_link(ws_url, __MODULE__.Handler, %{owner: owner}, extra_headers: headers) do
      {:ok, conn} ->
        transport = %Transport{
          type: :websocket,
          url: ws_url,
          api_key: api_key,
          conn: conn,
          owner: owner
        }

        {:ok, transport}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Send a message via WebSocket.
  """
  @spec send(Transport.t(), binary()) :: :ok | {:error, term()}
  def send(%Transport{conn: conn}, message) do
    WebSockex.send_frame(conn, {:text, message})
  end

  @doc """
  Close WebSocket connection.
  """
  @spec close(Transport.t()) :: :ok
  def close(%Transport{conn: conn}) do
    WebSockex.send_frame(conn, :close)
    :ok
  end

  defp http_to_ws(url) do
    url
    |> String.replace(~r/^http:/, "ws:")
    |> String.replace(~r/^https:/, "wss:")
  end

  defp build_headers(nil), do: []
  defp build_headers(api_key), do: [{"authorization", "Bearer #{api_key}"}]

  defmodule Handler do
    @moduledoc false

    use WebSockex

    def handle_frame({:text, msg}, %{owner: owner} = state) do
      Kernel.send(owner, {:transport_message, msg})
      {:ok, state}
    end

    def handle_frame({:binary, msg}, %{owner: owner} = state) do
      Kernel.send(owner, {:transport_message, msg})
      {:ok, state}
    end

    def handle_disconnect(reason, %{owner: owner} = state) do
      Kernel.send(owner, {:transport_closed, reason})
      {:ok, state}
    end
  end
end
