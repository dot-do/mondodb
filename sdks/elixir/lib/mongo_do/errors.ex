defmodule MongoDo.Error do
  @moduledoc """
  Base error struct for MongoDB operations.
  """

  @type t :: %__MODULE__{
          code: integer() | nil,
          message: String.t(),
          details: map() | nil
        }

  defexception [:code, :message, :details]

  @impl true
  def message(%__MODULE__{code: nil, message: msg}) do
    msg
  end

  def message(%__MODULE__{code: code, message: msg}) do
    "[#{code}] #{msg}"
  end
end

defmodule MongoDo.QueryError do
  @moduledoc """
  Error for query execution failures.
  """

  @type t :: %__MODULE__{
          message: String.t(),
          query: String.t() | nil,
          suggestion: String.t() | nil
        }

  defexception [:message, :query, :suggestion]

  @impl true
  def message(%__MODULE__{message: msg, suggestion: nil}) do
    "Query error: #{msg}"
  end

  def message(%__MODULE__{message: msg, suggestion: suggestion}) do
    "Query error: #{msg}\nSuggestion: #{suggestion}"
  end
end

defmodule MongoDo.ConnectionError do
  @moduledoc """
  Error for connection failures.
  """

  @type t :: %__MODULE__{
          message: String.t(),
          url: String.t() | nil,
          reason: term()
        }

  defexception [:message, :url, :reason]

  @impl true
  def message(%__MODULE__{message: msg, url: nil}) do
    "Connection error: #{msg}"
  end

  def message(%__MODULE__{message: msg, url: url}) do
    "Connection error to #{url}: #{msg}"
  end
end

defmodule MongoDo.ValidationError do
  @moduledoc """
  Error for document validation failures.
  """

  @type t :: %__MODULE__{
          message: String.t(),
          field: atom() | nil,
          errors: [map()]
        }

  defexception [:message, :field, errors: []]

  @impl true
  def message(%__MODULE__{message: msg, field: nil}) do
    "Validation error: #{msg}"
  end

  def message(%__MODULE__{message: msg, field: field}) do
    "Validation error on #{field}: #{msg}"
  end
end

defmodule MongoDo.TimeoutError do
  @moduledoc """
  Error for operation timeouts.
  """

  @type t :: %__MODULE__{
          message: String.t(),
          timeout: non_neg_integer()
        }

  defexception [:message, :timeout]

  @impl true
  def message(%__MODULE__{timeout: timeout}) do
    "Operation timed out after #{timeout}ms"
  end
end

defmodule MongoDo.DuplicateKeyError do
  @moduledoc """
  Error for duplicate key violations.
  """

  @type t :: %__MODULE__{
          message: String.t(),
          key: term(),
          collection: String.t() | nil
        }

  defexception [:message, :key, :collection]

  @impl true
  def message(%__MODULE__{key: key, collection: collection}) do
    "Duplicate key error#{if collection, do: " in #{collection}", else: ""}: #{inspect(key)}"
  end
end

defmodule MongoDo.WriteError do
  @moduledoc """
  Error for write operation failures.
  """

  @type t :: %__MODULE__{
          message: String.t(),
          code: integer() | nil,
          write_errors: [map()]
        }

  defexception [:message, :code, write_errors: []]

  @impl true
  def message(%__MODULE__{message: msg, write_errors: []}) do
    "Write error: #{msg}"
  end

  def message(%__MODULE__{message: msg, write_errors: errors}) do
    "Write error: #{msg} (#{length(errors)} errors)"
  end
end
