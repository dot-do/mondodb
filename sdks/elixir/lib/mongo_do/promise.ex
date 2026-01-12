defmodule MongoDo.Promise do
  @moduledoc """
  Promise pipelining for MongoDB operations.

  Allows chaining operations with minimal round trips using RPC pipelining.

  ## Examples

      result =
        mongo("active users")
        |> MongoDo.rmap(fn u -> mongo("pending orders for \#{u.id}") end)
        |> MongoDo.rmap(fn o -> o.total end)
        |> MongoDo.await()
  """

  @type t :: %__MODULE__{
          operations: [operation()],
          resolved: boolean(),
          value: term()
        }

  @type operation :: {:map, (term() -> term())}

  defstruct operations: [], resolved: false, value: nil

  @doc """
  Create a new promise from a value.
  """
  @spec new(term()) :: t()
  def new(value) do
    %__MODULE__{
      operations: [],
      resolved: true,
      value: value
    }
  end

  @doc """
  Map over a promise with a function.

  The function is queued and executed when the promise is awaited.
  """
  @spec map(t() | term(), (term() -> term())) :: t()
  def map(%__MODULE__{} = promise, fun) when is_function(fun, 1) do
    %{promise | operations: [{:map, fun} | promise.operations]}
  end

  def map(value, fun) when is_function(fun, 1) do
    promise = new(value)
    map(promise, fun)
  end

  @doc """
  Flat map over a promise.

  Like map, but unwraps nested promises.
  """
  @spec flat_map(t() | term(), (term() -> t() | term())) :: t()
  def flat_map(promise, fun) do
    map(promise, fn value ->
      case fun.(value) do
        %__MODULE__{} = inner -> await(inner)
        other -> other
      end
    end)
  end

  @doc """
  Await a promise, executing all queued operations.

  Returns the final resolved value.
  """
  @spec await(t()) :: term()
  def await(%__MODULE__{resolved: true, operations: [], value: value}) do
    value
  end

  def await(%__MODULE__{resolved: true, operations: operations, value: initial}) do
    operations
    |> Enum.reverse()
    |> Enum.reduce(initial, fn
      {:map, fun}, acc ->
        apply_to_result(fun, acc)
    end)
  end

  def await(%__MODULE__{resolved: false}) do
    raise ArgumentError, "cannot await unresolved promise without a value"
  end

  def await(value), do: value

  @doc """
  Await multiple promises in parallel.

  ## Examples

      [users, orders, products] = Promise.await_all([
        mongo("active users"),
        mongo("pending orders"),
        mongo("low stock products")
      ])
  """
  @spec await_all([t()]) :: [term()]
  def await_all(promises) when is_list(promises) do
    promises
    |> Task.async_stream(&await/1, ordered: true)
    |> Enum.map(fn {:ok, result} -> result end)
  end

  @doc """
  Race multiple promises, returning the first to resolve.
  """
  @spec race([t()]) :: term()
  def race(promises) when is_list(promises) do
    promises
    |> Enum.map(&Task.async(fn -> await(&1) end))
    |> Task.await_many(10)
    |> List.first()
  end

  @doc """
  Chain multiple operations into a single promise.

  ## Examples

      Promise.chain([
        fn _ -> mongo("users") end,
        fn users -> mongo("orders for \#{List.first(users)}") end,
        fn orders -> calculate_total(orders) end
      ])
      |> Promise.await()
  """
  @spec chain([function()]) :: t()
  def chain(functions) when is_list(functions) do
    Enum.reduce(functions, new(nil), fn fun, promise ->
      map(promise, fun)
    end)
  end

  # Private helpers

  defp apply_to_result(fun, {:ok, value}) do
    {:ok, fun.(value)}
  end

  defp apply_to_result(_fun, {:error, _} = error) do
    error
  end

  defp apply_to_result(fun, value) when is_list(value) do
    Enum.map(value, fun)
  end

  defp apply_to_result(fun, value) do
    fun.(value)
  end
end
