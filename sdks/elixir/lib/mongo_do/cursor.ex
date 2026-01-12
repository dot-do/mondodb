defmodule MongoDo.Cursor do
  @moduledoc """
  Cursor for iterating over MongoDB query results.

  Implements the Enumerable protocol for lazy iteration.

  ## Examples

      {:ok, cursor} = Collection.find(users, %{active: true})

      cursor
      |> Enum.take(10)
      |> Enum.each(&process_user/1)
  """

  @type t :: %__MODULE__{
          id: term(),
          client: MongoDo.Client.t(),
          database: String.t(),
          collection: String.t(),
          batch: [map()],
          exhausted: boolean()
        }

  defstruct [:id, :client, :database, :collection, batch: [], exhausted: false]

  defimpl Enumerable do
    def count(_cursor), do: {:error, __MODULE__}
    def member?(_cursor, _element), do: {:error, __MODULE__}
    def slice(_cursor), do: {:error, __MODULE__}

    def reduce(_cursor, {:halt, acc}, _fun) do
      {:halted, acc}
    end

    def reduce(cursor, {:suspend, acc}, fun) do
      {:suspended, acc, &reduce(cursor, &1, fun)}
    end

    def reduce(%MongoDo.Cursor{exhausted: true, batch: []}, {:cont, acc}, _fun) do
      {:done, acc}
    end

    def reduce(%MongoDo.Cursor{batch: [doc | rest]} = cursor, {:cont, acc}, fun) do
      reduce(%{cursor | batch: rest}, fun.(doc, acc), fun)
    end

    def reduce(%MongoDo.Cursor{batch: [], exhausted: false} = cursor, {:cont, acc}, fun) do
      case MongoDo.Cursor.get_more(cursor) do
        {:ok, %{batch: [], exhausted: true} = cursor} ->
          {:done, acc}

        {:ok, cursor} ->
          reduce(cursor, {:cont, acc}, fun)

        {:error, _reason} ->
          {:done, acc}
      end
    end
  end

  @doc """
  Create a new cursor.
  """
  @spec new(map()) :: t()
  def new(opts) do
    struct(__MODULE__, opts)
  end

  @doc """
  Get the next batch of documents from the cursor.
  """
  @spec get_more(t()) :: {:ok, t()} | {:error, term()}
  def get_more(%__MODULE__{exhausted: true} = cursor) do
    {:ok, cursor}
  end

  def get_more(%__MODULE__{} = cursor) do
    case MongoDo.Client.execute(cursor.client, {:get_more, cursor.id, cursor.database, cursor.collection}) do
      {:ok, %{"cursor" => %{"id" => 0, "nextBatch" => batch}}} ->
        {:ok, %{cursor | batch: batch, exhausted: true}}

      {:ok, %{"cursor" => %{"id" => id, "nextBatch" => batch}}} ->
        {:ok, %{cursor | id: id, batch: batch}}

      {:ok, %{"nextBatch" => batch}} when batch == [] ->
        {:ok, %{cursor | batch: [], exhausted: true}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Close the cursor and release server resources.
  """
  @spec close(t()) :: :ok
  def close(%__MODULE__{id: nil}), do: :ok
  def close(%__MODULE__{exhausted: true}), do: :ok

  def close(%__MODULE__{} = cursor) do
    MongoDo.Client.execute(cursor.client, {:kill_cursors, [cursor.id]})
    :ok
  end

  @doc """
  Convert cursor to a list (fetches all documents).
  """
  @spec to_list(t()) :: [map()]
  def to_list(%__MODULE__{} = cursor) do
    Enum.to_list(cursor)
  end

  @doc """
  Check if cursor has more documents.
  """
  @spec has_next?(t()) :: boolean()
  def has_next?(%__MODULE__{batch: [_ | _]}), do: true
  def has_next?(%__MODULE__{exhausted: true}), do: false
  def has_next?(_cursor), do: true
end
