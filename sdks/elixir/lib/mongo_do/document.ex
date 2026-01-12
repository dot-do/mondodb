defmodule MongoDo.Document do
  @moduledoc """
  Schema definition for type-safe MongoDB documents.

  ## Examples

      defmodule User do
        use MongoDo.Document

        document do
          field :_id, :object_id
          field :name, :string
          field :email, :string
          field :age, :integer
          field :created_at, :datetime, default: &DateTime.utc_now/0
        end
      end

      # Usage
      users = Collection.new(db, "users", schema: User)
      {:ok, user} = Collection.find_one(users, %{email: "alice@example.com"})
      # user is a %User{} struct
  """

  @doc """
  Define a document schema.
  """
  defmacro __using__(_opts) do
    quote do
      import MongoDo.Document, only: [document: 1, field: 2, field: 3]

      Module.register_attribute(__MODULE__, :mongo_fields, accumulate: true)
      Module.register_attribute(__MODULE__, :mongo_defaults, accumulate: true)

      @before_compile MongoDo.Document
    end
  end

  @doc """
  Define the document schema block.
  """
  defmacro document(do: block) do
    quote do
      unquote(block)
    end
  end

  @doc """
  Define a field in the document schema.
  """
  defmacro field(name, type, opts \\ []) do
    quote do
      @mongo_fields {unquote(name), unquote(type)}

      if Keyword.has_key?(unquote(opts), :default) do
        @mongo_defaults {unquote(name), Keyword.get(unquote(opts), :default)}
      end
    end
  end

  defmacro __before_compile__(env) do
    fields = Module.get_attribute(env.module, :mongo_fields) |> Enum.reverse()
    defaults = Module.get_attribute(env.module, :mongo_defaults) |> Enum.reverse()

    field_names = Enum.map(fields, fn {name, _type} -> name end)

    struct_fields =
      Enum.map(fields, fn {name, _type} ->
        default = Keyword.get(defaults, name)
        {name, default}
      end)

    quote do
      defstruct unquote(struct_fields)

      @type t :: %__MODULE__{unquote_splicing(type_specs(fields))}

      @doc """
      Cast a map to this document type.
      """
      @spec cast(map()) :: t()
      def cast(data) when is_map(data) do
        attrs =
          Enum.reduce(unquote(Macro.escape(fields)), %{}, fn {name, type}, acc ->
            key = Atom.to_string(name)

            value =
              cond do
                Map.has_key?(data, name) -> Map.get(data, name)
                Map.has_key?(data, key) -> Map.get(data, key)
                true -> nil
              end

            Map.put(acc, name, MongoDo.Document.cast_value(value, type))
          end)

        struct(__MODULE__, attrs)
      end

      @doc """
      Dump this document to a map for storage.
      """
      @spec dump(t()) :: map()
      def dump(%__MODULE__{} = doc) do
        Enum.reduce(unquote(Macro.escape(fields)), %{}, fn {name, type}, acc ->
          value = Map.get(doc, name)
          Map.put(acc, Atom.to_string(name), MongoDo.Document.dump_value(value, type))
        end)
      end

      @doc """
      Get field names.
      """
      @spec __fields__() :: [atom()]
      def __fields__, do: unquote(field_names)

      @doc """
      Get field types.
      """
      @spec __types__() :: [{atom(), atom()}]
      def __types__, do: unquote(Macro.escape(fields))
    end
  end

  defp type_specs(fields) do
    Enum.map(fields, fn {name, type} ->
      {name, type_to_spec(type)}
    end)
  end

  defp type_to_spec(:string), do: quote(do: String.t() | nil)
  defp type_to_spec(:integer), do: quote(do: integer() | nil)
  defp type_to_spec(:float), do: quote(do: float() | nil)
  defp type_to_spec(:boolean), do: quote(do: boolean() | nil)
  defp type_to_spec(:datetime), do: quote(do: DateTime.t() | nil)
  defp type_to_spec(:date), do: quote(do: Date.t() | nil)
  defp type_to_spec(:object_id), do: quote(do: String.t() | nil)
  defp type_to_spec(:map), do: quote(do: map() | nil)
  defp type_to_spec(:list), do: quote(do: list() | nil)
  defp type_to_spec(_), do: quote(do: term())

  @doc """
  Cast a value to the specified type.
  """
  @spec cast_value(term(), atom()) :: term()
  def cast_value(nil, _type), do: nil

  def cast_value(value, :string) when is_binary(value), do: value
  def cast_value(value, :string), do: to_string(value)

  def cast_value(value, :integer) when is_integer(value), do: value
  def cast_value(value, :integer) when is_float(value), do: trunc(value)
  def cast_value(value, :integer) when is_binary(value), do: String.to_integer(value)

  def cast_value(value, :float) when is_float(value), do: value
  def cast_value(value, :float) when is_integer(value), do: value / 1
  def cast_value(value, :float) when is_binary(value), do: String.to_float(value)

  def cast_value(value, :boolean) when is_boolean(value), do: value
  def cast_value("true", :boolean), do: true
  def cast_value("false", :boolean), do: false

  def cast_value(%DateTime{} = value, :datetime), do: value

  def cast_value(value, :datetime) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, dt, _} -> dt
      _ -> nil
    end
  end

  def cast_value(%{"$date" => ms}, :datetime) when is_integer(ms) do
    DateTime.from_unix!(ms, :millisecond)
  end

  def cast_value(%Date{} = value, :date), do: value

  def cast_value(value, :date) when is_binary(value) do
    case Date.from_iso8601(value) do
      {:ok, date} -> date
      _ -> nil
    end
  end

  def cast_value(%{"$oid" => id}, :object_id), do: id
  def cast_value(value, :object_id) when is_binary(value), do: value

  def cast_value(value, :map) when is_map(value), do: value
  def cast_value(value, :list) when is_list(value), do: value

  def cast_value(value, _type), do: value

  @doc """
  Dump a value to storage format.
  """
  @spec dump_value(term(), atom()) :: term()
  def dump_value(nil, _type), do: nil
  def dump_value(value, :string), do: to_string(value)
  def dump_value(value, :integer) when is_number(value), do: trunc(value)
  def dump_value(value, :float) when is_number(value), do: value / 1
  def dump_value(value, :boolean), do: !!value

  def dump_value(%DateTime{} = dt, :datetime) do
    %{"$date" => DateTime.to_unix(dt, :millisecond)}
  end

  def dump_value(%Date{} = date, :date) do
    Date.to_iso8601(date)
  end

  def dump_value(value, :object_id) when is_binary(value) do
    %{"$oid" => value}
  end

  def dump_value(value, _type), do: value
end
