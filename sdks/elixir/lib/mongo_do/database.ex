defmodule MongoDo.Database do
  @moduledoc """
  MongoDB database reference.

  Provides access to collections within a database.

  ## Examples

      db = Client.database(client, "myapp")
      users = Database.collection(db, "users")
  """

  alias MongoDo.{Client, Collection}

  @type t :: %__MODULE__{
          name: String.t(),
          client: Client.t()
        }

  defstruct [:name, :client]

  @doc """
  Get a collection from the database.

  ## Options

    * `:schema` - Optional schema module for type-safe operations

  ## Examples

      users = Database.collection(db, "users")
      users = Database.collection(db, "users", schema: User)
  """
  @spec collection(t(), String.t(), keyword()) :: Collection.t()
  def collection(%__MODULE__{} = db, name, opts \\ []) when is_binary(name) do
    Collection.new(db, name, opts)
  end

  @doc """
  List all collections in the database.

  ## Examples

      {:ok, collections} = Database.list_collections(db)
  """
  @spec list_collections(t()) :: {:ok, [String.t()]} | {:error, term()}
  def list_collections(%__MODULE__{} = db) do
    execute(db, {:list_collections})
  end

  @doc """
  Create a new collection.

  ## Options

    * `:capped` - Whether the collection is capped
    * `:size` - Maximum size in bytes for capped collections
    * `:max` - Maximum number of documents for capped collections

  ## Examples

      {:ok, _} = Database.create_collection(db, "logs", capped: true, size: 1_000_000)
  """
  @spec create_collection(t(), String.t(), keyword()) :: {:ok, map()} | {:error, term()}
  def create_collection(%__MODULE__{} = db, name, opts \\ []) do
    execute(db, {:create_collection, name, opts})
  end

  @doc """
  Drop a collection.

  ## Examples

      {:ok, _} = Database.drop_collection(db, "old_logs")
  """
  @spec drop_collection(t(), String.t()) :: {:ok, map()} | {:error, term()}
  def drop_collection(%__MODULE__{} = db, name) do
    execute(db, {:drop_collection, name})
  end

  @doc """
  Run a command on the database.

  ## Examples

      {:ok, result} = Database.run_command(db, %{"ping" => 1})
  """
  @spec run_command(t(), map()) :: {:ok, map()} | {:error, term()}
  def run_command(%__MODULE__{} = db, command) when is_map(command) do
    execute(db, {:run_command, command})
  end

  @doc """
  Get database statistics.
  """
  @spec stats(t()) :: {:ok, map()} | {:error, term()}
  def stats(%__MODULE__{} = db) do
    run_command(db, %{"dbStats" => 1})
  end

  # Internal

  defp execute(%__MODULE__{name: db_name, client: client}, command) do
    Client.execute(client, {:database, db_name, command})
  end
end
