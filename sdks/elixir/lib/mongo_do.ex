defmodule MongoDo do
  @moduledoc """
  MongoDB on the Edge. Natural Language First. AI-Native.

  ## Quick Start

      import MongoDo

      # Natural language queries
      users = mongo("users who haven't logged in this month")
      vips = mongo("customers with orders over $1000")

      # Chain with pipes
      result =
        mongo("users in Austin")
        |> MongoDo.rmap(fn user -> mongo("recent orders for \#{user}") end)
        |> MongoDo.rmap(fn orders -> mongo("shipping status for \#{orders}") end)

  ## Configuration

      config :mongo_do,
        url: "https://your-worker.workers.dev",
        api_key: "your-api-key"
  """

  alias MongoDo.{Client, Connection, Query, Promise}

  @type query_result :: term() | {:error, term()}
  @type query_opts :: keyword()

  @doc """
  Execute a natural language MongoDB query.

  ## Examples

      mongo("users who haven't logged in this month")
      mongo("customers with orders over $1000")
      mongo("most popular products this week")
  """
  @spec mongo(String.t()) :: query_result()
  defmacro mongo(query) do
    quote do
      MongoDo.execute(unquote(query))
    end
  end

  @doc """
  Execute a natural language MongoDB query with options.

  ## Options

    * `:timeout` - Query timeout in milliseconds (default: 30_000)
    * `:pool` - Connection pool name (default: :default)

  ## Examples

      mongo("users in Austin", timeout: 60_000)
  """
  @spec mongo(String.t(), query_opts()) :: query_result()
  defmacro mongo(query, opts) do
    quote do
      MongoDo.execute(unquote(query), unquote(opts))
    end
  end

  @doc """
  Execute a natural language query, raising on error.

  ## Examples

      result = mongo!("users who haven't logged in this month")
  """
  @spec mongo!(String.t()) :: term()
  defmacro mongo!(query) do
    quote do
      case MongoDo.execute(unquote(query)) do
        {:error, error} -> raise MongoDo.QueryError, error
        result -> result
      end
    end
  end

  @doc """
  Execute a query (internal implementation).
  """
  @spec execute(String.t(), query_opts()) :: query_result()
  def execute(query, opts \\ []) do
    pool = Keyword.get(opts, :pool, :default)
    timeout = Keyword.get(opts, :timeout, 30_000)

    Connection.execute(pool, {:natural_query, query}, timeout)
  end

  @doc """
  Map over a promise result with a function.

  Used for promise pipelining - chains operations with minimal round trips.

  ## Examples

      mongo("active users")
      |> MongoDo.rmap(fn u -> mongo("pending orders for \#{u.id}") end)
      |> MongoDo.rmap(fn o -> o.total end)
      |> MongoDo.await()
  """
  @spec rmap(Promise.t() | term(), (term() -> term())) :: Promise.t()
  def rmap(promise_or_result, fun) do
    Promise.map(promise_or_result, fun)
  end

  @doc """
  Await a promise, executing the pipeline and returning the result.

  ## Examples

      result =
        mongo("active users")
        |> MongoDo.rmap(fn u -> mongo("orders for \#{u}") end)
        |> MongoDo.await()
  """
  @spec await(Promise.t()) :: term()
  def await(promise) do
    Promise.await(promise)
  end

  @doc """
  Execute a transaction with a function.

  All operations within the function are executed atomically.

  ## Examples

      MongoDo.transaction(fn tx ->
        tx |> query("alice account") |> debit(100)
        tx |> query("bob account") |> credit(100)
      end)
  """
  @spec transaction((MongoDo.Transaction.t() -> term())) :: {:ok, term()} | {:error, term()}
  def transaction(fun) when is_function(fun, 1) do
    MongoDo.Transaction.execute(fun)
  end

  @doc """
  Connect to a MongoDB instance.

  ## Examples

      {:ok, client} = MongoDo.connect("https://your-worker.workers.dev")
  """
  @spec connect(String.t(), keyword()) :: {:ok, Client.t()} | {:error, term()}
  def connect(uri, opts \\ []) do
    Client.connect(uri, opts)
  end

  @doc """
  Get a database from a client.

  ## Examples

      db = MongoDo.database(client, "myapp")
  """
  @spec database(Client.t(), String.t()) :: MongoDo.Database.t()
  def database(client, name) do
    Client.database(client, name)
  end
end
