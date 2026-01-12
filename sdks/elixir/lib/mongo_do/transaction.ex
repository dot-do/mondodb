defmodule MongoDo.Transaction do
  @moduledoc """
  Transaction support for atomic MongoDB operations.

  ## Examples

      MongoDo.transaction(fn tx ->
        tx |> query("alice account") |> debit(100)
        tx |> query("bob account") |> credit(100)
      end)
  """

  alias MongoDo.Pool

  @type t :: %__MODULE__{
          id: String.t(),
          operations: [operation()],
          state: :pending | :committed | :aborted
        }

  @type operation :: {atom(), list()}

  defstruct [:id, operations: [], state: :pending]

  @doc """
  Execute a function within a transaction.

  All operations in the function are executed atomically.
  If the function returns :ok or {:ok, _}, the transaction commits.
  If the function raises or returns {:error, _}, the transaction aborts.

  ## Examples

      MongoDo.Transaction.execute(fn tx ->
        tx
        |> MongoDo.Transaction.insert("users", %{name: "Alice"})
        |> MongoDo.Transaction.update("accounts", %{user: "alice"}, %{"$inc" => %{balance: -100}})
      end)
  """
  @spec execute((t() -> term())) :: {:ok, term()} | {:error, term()}
  def execute(fun) when is_function(fun, 1) do
    tx = %__MODULE__{
      id: generate_id(),
      operations: [],
      state: :pending
    }

    try do
      result = fun.(tx)
      commit(tx, result)
    rescue
      e ->
        abort(tx, e)
        {:error, e}
    catch
      kind, reason ->
        abort(tx, {kind, reason})
        {:error, {kind, reason}}
    end
  end

  @doc """
  Queue an insert operation in the transaction.
  """
  @spec insert(t(), String.t(), map()) :: t()
  def insert(%__MODULE__{} = tx, collection, document) do
    add_operation(tx, {:insert, collection, document})
  end

  @doc """
  Queue an update operation in the transaction.
  """
  @spec update(t(), String.t(), map(), map()) :: t()
  def update(%__MODULE__{} = tx, collection, filter, update) do
    add_operation(tx, {:update, collection, filter, update})
  end

  @doc """
  Queue a delete operation in the transaction.
  """
  @spec delete(t(), String.t(), map()) :: t()
  def delete(%__MODULE__{} = tx, collection, filter) do
    add_operation(tx, {:delete, collection, filter})
  end

  @doc """
  Queue a natural language query in the transaction.
  """
  @spec query(t(), String.t()) :: t()
  def query(%__MODULE__{} = tx, natural_query) do
    add_operation(tx, {:natural_query, natural_query})
  end

  # Private helpers

  defp add_operation(%__MODULE__{operations: ops} = tx, operation) do
    %{tx | operations: ops ++ [operation]}
  end

  defp commit(%__MODULE__{} = tx, result) do
    case execute_transaction(tx) do
      {:ok, _} ->
        case result do
          :ok -> {:ok, nil}
          {:ok, value} -> {:ok, value}
          %__MODULE__{} -> {:ok, nil}
          other -> {:ok, other}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp abort(%__MODULE__{id: id}, reason) do
    Pool.execute(:default, {:abort_transaction, id, reason}, 5_000)
  end

  defp execute_transaction(%__MODULE__{id: id, operations: ops}) do
    Pool.execute(:default, {:execute_transaction, id, ops}, 30_000)
  end

  defp generate_id do
    :crypto.strong_rand_bytes(16)
    |> Base.encode16(case: :lower)
  end
end
