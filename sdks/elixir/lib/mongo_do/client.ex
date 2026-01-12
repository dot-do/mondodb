defmodule MongoDo.Client do
  @moduledoc """
  MongoDB client for direct connection management.

  Provides a MongoDB-compatible API for database operations.

  ## Examples

      {:ok, client} = MongoDo.Client.connect("https://your-worker.workers.dev")
      db = MongoDo.Client.database(client, "myapp")
      MongoDo.Client.close(client)
  """

  alias MongoDo.{Connection, Database}

  @type t :: %__MODULE__{
          url: String.t(),
          api_key: String.t() | nil,
          connection: pid()
        }

  defstruct [:url, :api_key, :connection]

  @doc """
  Connect to a MongoDB server.

  ## Options

    * `:api_key` - API key for authentication
    * `:timeout` - Connection timeout in milliseconds

  ## Examples

      {:ok, client} = Client.connect("https://db.example.com")
      {:ok, client} = Client.connect("https://db.example.com", api_key: "secret")
  """
  @spec connect(String.t(), keyword()) :: {:ok, t()} | {:error, term()}
  def connect(url, opts \\ []) do
    api_key = Keyword.get(opts, :api_key) || Application.get_env(:mongo_do, :api_key)

    case Connection.start_link(url: url, api_key: api_key) do
      {:ok, pid} ->
        client = %__MODULE__{
          url: url,
          api_key: api_key,
          connection: pid
        }

        {:ok, client}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Get a database reference from the client.

  ## Examples

      db = Client.database(client, "myapp")
  """
  @spec database(t(), String.t()) :: Database.t()
  def database(%__MODULE__{} = client, name) when is_binary(name) do
    %Database{
      name: name,
      client: client
    }
  end

  @doc """
  Close the client connection.

  ## Examples

      :ok = Client.close(client)
  """
  @spec close(t()) :: :ok
  def close(%__MODULE__{connection: conn}) do
    Connection.close(conn)
  end

  @doc """
  Execute a command on the connection.
  """
  @spec execute(t(), term(), timeout()) :: term()
  def execute(%__MODULE__{connection: conn}, command, timeout \\ 30_000) do
    Connection.execute(conn, command, timeout)
  end

  @doc """
  List all databases.

  ## Examples

      {:ok, databases} = Client.list_databases(client)
  """
  @spec list_databases(t()) :: {:ok, [map()]} | {:error, term()}
  def list_databases(%__MODULE__{} = client) do
    execute(client, {:admin, :list_databases})
  end

  @doc """
  Check if client connection is alive.
  """
  @spec alive?(t()) :: boolean()
  def alive?(%__MODULE__{connection: conn}) do
    Connection.alive?(conn)
  end
end
