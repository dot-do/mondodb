defmodule MongoDo.Query do
  @moduledoc """
  Query builder for MongoDB operations.

  Provides chainable query methods.

  ## Examples

      mongo("active users")
      |> limit(10)
      |> skip(5)
      |> sort("created_at", :desc)
      |> highlight()
  """

  @type t :: %__MODULE__{
          source: term(),
          limit: non_neg_integer() | nil,
          skip: non_neg_integer() | nil,
          sort: [{String.t(), :asc | :desc}],
          projection: map() | nil,
          highlight: boolean(),
          fuzzy: boolean(),
          atomic: boolean()
        }

  defstruct [
    :source,
    :limit,
    :skip,
    :projection,
    sort: [],
    highlight: false,
    fuzzy: false,
    atomic: false
  ]

  @doc """
  Create a new query from a source value.
  """
  @spec new(term()) :: t()
  def new(source) do
    %__MODULE__{source: source}
  end

  @doc """
  Limit the number of results.

  ## Examples

      query |> limit(10)
  """
  @spec limit(t() | term(), non_neg_integer()) :: t()
  def limit(%__MODULE__{} = query, n) when is_integer(n) and n >= 0 do
    %{query | limit: n}
  end

  def limit(source, n) do
    new(source) |> limit(n)
  end

  @doc """
  Skip a number of results.

  ## Examples

      query |> skip(20)
  """
  @spec skip(t() | term(), non_neg_integer()) :: t()
  def skip(%__MODULE__{} = query, n) when is_integer(n) and n >= 0 do
    %{query | skip: n}
  end

  def skip(source, n) do
    new(source) |> skip(n)
  end

  @doc """
  Sort results by a field.

  ## Examples

      query |> sort("created_at", :desc)
      query |> sort("name")  # defaults to :asc
  """
  @spec sort(t() | term(), String.t(), :asc | :desc) :: t()
  def sort(%__MODULE__{sort: sorts} = query, field, direction \\ :asc)
      when direction in [:asc, :desc] do
    %{query | sort: sorts ++ [{field, direction}]}
  end

  def sort(source, field, direction) do
    new(source) |> sort(field, direction)
  end

  @doc """
  Project specific fields.

  ## Examples

      query |> project(%{"name" => 1, "email" => 1})
  """
  @spec project(t() | term(), map()) :: t()
  def project(%__MODULE__{} = query, projection) when is_map(projection) do
    %{query | projection: projection}
  end

  def project(source, projection) do
    new(source) |> project(projection)
  end

  @doc """
  Enable highlighting for full-text search results.

  ## Examples

      mongo("articles about elixir") |> highlight()
  """
  @spec highlight(t() | term()) :: t()
  def highlight(%__MODULE__{} = query) do
    %{query | highlight: true}
  end

  def highlight(source) do
    new(source) |> highlight()
  end

  @doc """
  Enable fuzzy matching for search queries.

  ## Examples

      mongo("find articles matching 'elxir'") |> fuzzy()
  """
  @spec fuzzy(t() | term()) :: t()
  def fuzzy(%__MODULE__{} = query) do
    %{query | fuzzy: true}
  end

  def fuzzy(source) do
    new(source) |> fuzzy()
  end

  @doc """
  Mark the query as atomic (transactional).

  ## Examples

      mongo("transfer funds") |> atomic()
  """
  @spec atomic(t() | term()) :: t()
  def atomic(%__MODULE__{} = query) do
    %{query | atomic: true}
  end

  def atomic(source) do
    new(source) |> atomic()
  end

  @doc """
  Convert query to options map for execution.
  """
  @spec to_opts(t()) :: keyword()
  def to_opts(%__MODULE__{} = query) do
    opts = []

    opts =
      if query.limit do
        [{:limit, query.limit} | opts]
      else
        opts
      end

    opts =
      if query.skip do
        [{:skip, query.skip} | opts]
      else
        opts
      end

    opts =
      if query.sort != [] do
        [{:sort, sort_to_map(query.sort)} | opts]
      else
        opts
      end

    opts =
      if query.projection do
        [{:projection, query.projection} | opts]
      else
        opts
      end

    opts =
      if query.highlight do
        [{:highlight, true} | opts]
      else
        opts
      end

    opts =
      if query.fuzzy do
        [{:fuzzy, true} | opts]
      else
        opts
      end

    opts =
      if query.atomic do
        [{:atomic, true} | opts]
      else
        opts
      end

    opts
  end

  defp sort_to_map(sorts) do
    Enum.into(sorts, %{}, fn {field, direction} ->
      {field, if(direction == :asc, do: 1, else: -1)}
    end)
  end
end
