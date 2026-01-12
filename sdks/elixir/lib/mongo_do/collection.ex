defmodule MongoDo.Collection do
  @moduledoc """
  MongoDB collection operations.

  Provides CRUD operations on MongoDB collections.

  ## Examples

      users = Collection.new(db, "users")

      # Insert
      {:ok, _} = Collection.insert_one(users, %{name: "Alice"})

      # Find
      {:ok, user} = Collection.find_one(users, %{name: "Alice"})

      # Update
      {:ok, _} = Collection.update_one(users, %{name: "Alice"}, %{"$set" => %{active: true}})

      # Delete
      {:ok, _} = Collection.delete_one(users, %{name: "Alice"})
  """

  alias MongoDo.{Database, Client, Cursor}

  @type t :: %__MODULE__{
          database: Database.t(),
          name: String.t(),
          schema: module() | nil
        }

  defstruct [:database, :name, :schema]

  @doc """
  Create a new collection reference.

  ## Options

    * `:schema` - Optional schema module for type-safe operations

  ## Examples

      users = Collection.new(db, "users")
      users = Collection.new(db, "users", schema: User)
  """
  @spec new(Database.t(), String.t(), keyword()) :: t()
  def new(%Database{} = db, name, opts \\ []) when is_binary(name) do
    %__MODULE__{
      database: db,
      name: name,
      schema: Keyword.get(opts, :schema)
    }
  end

  @doc """
  Find documents matching the filter.

  ## Options

    * `:sort` - Sort specification
    * `:skip` - Number of documents to skip
    * `:limit` - Maximum number of documents to return
    * `:projection` - Fields to include/exclude

  ## Examples

      {:ok, users} = Collection.find(users, %{active: true})
      {:ok, users} = Collection.find(users, %{}, limit: 10, sort: %{created_at: -1})
  """
  @spec find(t(), map(), keyword()) :: {:ok, [map()]} | {:error, term()}
  def find(%__MODULE__{} = coll, filter \\ %{}, opts \\ []) do
    case execute(coll, {:find, filter, opts}) do
      {:ok, docs} -> {:ok, cast_documents(coll, docs)}
      error -> error
    end
  end

  @doc """
  Find a single document matching the filter.

  ## Examples

      {:ok, user} = Collection.find_one(users, %{email: "alice@example.com"})
  """
  @spec find_one(t(), map(), keyword()) :: {:ok, map() | nil} | {:error, term()}
  def find_one(%__MODULE__{} = coll, filter, opts \\ []) do
    case execute(coll, {:find_one, filter, opts}) do
      {:ok, nil} -> {:ok, nil}
      {:ok, doc} -> {:ok, cast_document(coll, doc)}
      error -> error
    end
  end

  @doc """
  Find a document by ID.

  ## Examples

      {:ok, user} = Collection.find_by_id(users, "507f1f77bcf86cd799439011")
  """
  @spec find_by_id(t(), String.t() | map()) :: {:ok, map() | nil} | {:error, term()}
  def find_by_id(%__MODULE__{} = coll, id) do
    find_one(coll, %{_id: normalize_id(id)})
  end

  @doc """
  Insert a single document.

  ## Examples

      {:ok, result} = Collection.insert_one(users, %{name: "Alice", email: "alice@example.com"})
      result.inserted_id
  """
  @spec insert_one(t(), map()) :: {:ok, MongoDo.InsertOneResult.t()} | {:error, term()}
  def insert_one(%__MODULE__{} = coll, document) when is_map(document) do
    execute(coll, {:insert_one, document})
  end

  @doc """
  Insert multiple documents.

  ## Options

    * `:ordered` - Whether to stop on first error (default: true)

  ## Examples

      {:ok, result} = Collection.insert_many(users, [%{name: "Alice"}, %{name: "Bob"}])
      result.inserted_ids
  """
  @spec insert_many(t(), [map()], keyword()) :: {:ok, MongoDo.InsertManyResult.t()} | {:error, term()}
  def insert_many(%__MODULE__{} = coll, documents, opts \\ []) when is_list(documents) do
    execute(coll, {:insert_many, documents, opts})
  end

  @doc """
  Update a single document matching the filter.

  ## Options

    * `:upsert` - Insert if no document matches (default: false)

  ## Examples

      {:ok, result} = Collection.update_one(users, %{name: "Alice"}, %{"$set" => %{active: true}})
      result.modified_count
  """
  @spec update_one(t(), map(), map(), keyword()) :: {:ok, MongoDo.UpdateResult.t()} | {:error, term()}
  def update_one(%__MODULE__{} = coll, filter, update, opts \\ []) do
    execute(coll, {:update_one, filter, update, opts})
  end

  @doc """
  Update multiple documents matching the filter.

  ## Options

    * `:upsert` - Insert if no document matches (default: false)

  ## Examples

      {:ok, result} = Collection.update_many(users, %{active: false}, %{"$set" => %{archived: true}})
      result.modified_count
  """
  @spec update_many(t(), map(), map(), keyword()) :: {:ok, MongoDo.UpdateResult.t()} | {:error, term()}
  def update_many(%__MODULE__{} = coll, filter, update, opts \\ []) do
    execute(coll, {:update_many, filter, update, opts})
  end

  @doc """
  Replace a single document.

  ## Examples

      {:ok, result} = Collection.replace_one(users, %{name: "Alice"}, %{name: "Alice", role: "admin"})
  """
  @spec replace_one(t(), map(), map(), keyword()) :: {:ok, MongoDo.UpdateResult.t()} | {:error, term()}
  def replace_one(%__MODULE__{} = coll, filter, replacement, opts \\ []) do
    execute(coll, {:replace_one, filter, replacement, opts})
  end

  @doc """
  Delete a single document matching the filter.

  ## Examples

      {:ok, result} = Collection.delete_one(users, %{name: "Alice"})
      result.deleted_count
  """
  @spec delete_one(t(), map()) :: {:ok, MongoDo.DeleteResult.t()} | {:error, term()}
  def delete_one(%__MODULE__{} = coll, filter) do
    execute(coll, {:delete_one, filter})
  end

  @doc """
  Delete multiple documents matching the filter.

  ## Examples

      {:ok, result} = Collection.delete_many(users, %{archived: true})
      result.deleted_count
  """
  @spec delete_many(t(), map()) :: {:ok, MongoDo.DeleteResult.t()} | {:error, term()}
  def delete_many(%__MODULE__{} = coll, filter) do
    execute(coll, {:delete_many, filter})
  end

  @doc """
  Count documents matching the filter.

  ## Examples

      {:ok, count} = Collection.count_documents(users, %{active: true})
  """
  @spec count_documents(t(), map(), keyword()) :: {:ok, non_neg_integer()} | {:error, term()}
  def count_documents(%__MODULE__{} = coll, filter \\ %{}, opts \\ []) do
    execute(coll, {:count_documents, filter, opts})
  end

  @doc """
  Get estimated document count (faster, uses metadata).

  ## Examples

      {:ok, count} = Collection.estimated_document_count(users)
  """
  @spec estimated_document_count(t()) :: {:ok, non_neg_integer()} | {:error, term()}
  def estimated_document_count(%__MODULE__{} = coll) do
    execute(coll, {:estimated_document_count})
  end

  @doc """
  Find distinct values for a field.

  ## Examples

      {:ok, cities} = Collection.distinct(users, "city", %{active: true})
  """
  @spec distinct(t(), String.t(), map()) :: {:ok, [term()]} | {:error, term()}
  def distinct(%__MODULE__{} = coll, field, filter \\ %{}) do
    execute(coll, {:distinct, field, filter})
  end

  @doc """
  Run an aggregation pipeline.

  ## Examples

      {:ok, results} = Collection.aggregate(users, [
        %{"$match" => %{active: true}},
        %{"$group" => %{"_id" => "$city", "count" => %{"$sum" => 1}}}
      ])
  """
  @spec aggregate(t(), [map()], keyword()) :: {:ok, [map()]} | {:error, term()}
  def aggregate(%__MODULE__{} = coll, pipeline, opts \\ []) when is_list(pipeline) do
    execute(coll, {:aggregate, pipeline, opts})
  end

  @doc """
  Create an index on the collection.

  ## Options

    * `:unique` - Whether the index should be unique
    * `:sparse` - Whether to skip documents without the indexed field
    * `:name` - Custom name for the index

  ## Examples

      {:ok, _} = Collection.create_index(users, %{email: 1}, unique: true)
      {:ok, _} = Collection.create_index(users, %{location: "2dsphere"})
  """
  @spec create_index(t(), map(), keyword()) :: {:ok, String.t()} | {:error, term()}
  def create_index(%__MODULE__{} = coll, keys, opts \\ []) do
    execute(coll, {:create_index, keys, opts})
  end

  @doc """
  Create multiple indexes.

  ## Examples

      {:ok, _} = Collection.create_indexes(users, [
        %{keys: %{email: 1}, unique: true},
        %{keys: %{name: 1}}
      ])
  """
  @spec create_indexes(t(), [map()]) :: {:ok, [String.t()]} | {:error, term()}
  def create_indexes(%__MODULE__{} = coll, indexes) when is_list(indexes) do
    execute(coll, {:create_indexes, indexes})
  end

  @doc """
  List all indexes on the collection.

  ## Examples

      {:ok, indexes} = Collection.list_indexes(users)
  """
  @spec list_indexes(t()) :: {:ok, [map()]} | {:error, term()}
  def list_indexes(%__MODULE__{} = coll) do
    execute(coll, {:list_indexes})
  end

  @doc """
  Drop an index.

  ## Examples

      {:ok, _} = Collection.drop_index(users, "email_1")
  """
  @spec drop_index(t(), String.t()) :: {:ok, map()} | {:error, term()}
  def drop_index(%__MODULE__{} = coll, index_name) do
    execute(coll, {:drop_index, index_name})
  end

  @doc """
  Drop all indexes on the collection.

  ## Examples

      {:ok, _} = Collection.drop_indexes(users)
  """
  @spec drop_indexes(t()) :: {:ok, map()} | {:error, term()}
  def drop_indexes(%__MODULE__{} = coll) do
    execute(coll, {:drop_indexes})
  end

  @doc """
  Watch for changes on the collection.

  Returns a cursor that yields change events.

  ## Options

    * `:full_document` - Include full document in change events
    * `:pipeline` - Aggregation pipeline to filter changes

  ## Examples

      {:ok, cursor} = Collection.watch(orders)
      for change <- cursor do
        IO.inspect(change)
      end
  """
  @spec watch(t(), keyword()) :: {:ok, Cursor.t()} | {:error, term()}
  def watch(%__MODULE__{} = coll, opts \\ []) do
    execute(coll, {:watch, opts})
  end

  @doc """
  Find one document and update it atomically.

  ## Options

    * `:return_document` - :before or :after (default: :before)
    * `:upsert` - Insert if no document matches (default: false)
    * `:sort` - Sort to determine which document to update

  ## Examples

      {:ok, doc} = Collection.find_one_and_update(
        users,
        %{email: "alice@example.com"},
        %{"$set" => %{last_login: DateTime.utc_now()}},
        return_document: :after
      )
  """
  @spec find_one_and_update(t(), map(), map(), keyword()) :: {:ok, map() | nil} | {:error, term()}
  def find_one_and_update(%__MODULE__{} = coll, filter, update, opts \\ []) do
    case execute(coll, {:find_one_and_update, filter, update, opts}) do
      {:ok, nil} -> {:ok, nil}
      {:ok, doc} -> {:ok, cast_document(coll, doc)}
      error -> error
    end
  end

  @doc """
  Find one document and replace it atomically.
  """
  @spec find_one_and_replace(t(), map(), map(), keyword()) :: {:ok, map() | nil} | {:error, term()}
  def find_one_and_replace(%__MODULE__{} = coll, filter, replacement, opts \\ []) do
    case execute(coll, {:find_one_and_replace, filter, replacement, opts}) do
      {:ok, nil} -> {:ok, nil}
      {:ok, doc} -> {:ok, cast_document(coll, doc)}
      error -> error
    end
  end

  @doc """
  Find one document and delete it atomically.
  """
  @spec find_one_and_delete(t(), map(), keyword()) :: {:ok, map() | nil} | {:error, term()}
  def find_one_and_delete(%__MODULE__{} = coll, filter, opts \\ []) do
    case execute(coll, {:find_one_and_delete, filter, opts}) do
      {:ok, nil} -> {:ok, nil}
      {:ok, doc} -> {:ok, cast_document(coll, doc)}
      error -> error
    end
  end

  @doc """
  Perform bulk write operations.

  ## Examples

      {:ok, result} = Collection.bulk_write(users, [
        {:insert_one, %{name: "Alice"}},
        {:update_one, %{name: "Bob"}, %{"$set" => %{active: true}}},
        {:delete_one, %{name: "Charlie"}}
      ])
  """
  @spec bulk_write(t(), [tuple()], keyword()) :: {:ok, MongoDo.BulkWriteResult.t()} | {:error, term()}
  def bulk_write(%__MODULE__{} = coll, operations, opts \\ []) when is_list(operations) do
    execute(coll, {:bulk_write, operations, opts})
  end

  # Private helpers

  defp execute(%__MODULE__{database: db, name: coll_name}, command) do
    Client.execute(db.client, {:collection, db.name, coll_name, command})
  end

  defp normalize_id(id) when is_binary(id), do: %{"$oid" => id}
  defp normalize_id(id), do: id

  defp cast_documents(%{schema: nil}, docs), do: docs
  defp cast_documents(%{schema: schema}, docs) do
    Enum.map(docs, &schema.cast/1)
  end

  defp cast_document(%{schema: nil}, doc), do: doc
  defp cast_document(%{schema: schema}, doc), do: schema.cast(doc)
end
