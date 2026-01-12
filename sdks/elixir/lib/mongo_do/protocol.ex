defmodule MongoDo.Protocol do
  @moduledoc """
  Protocol encoding/decoding for MongoDB operations.

  Handles serialization of commands and deserialization of responses.
  """

  @doc """
  Encode a command to JSON for transport.
  """
  @spec encode(term(), reference()) :: {:ok, binary()} | {:error, term()}
  def encode(command, ref) do
    message = %{
      "id" => ref_to_string(ref),
      "command" => encode_command(command)
    }

    case Jason.encode(message) do
      {:ok, json} -> {:ok, json}
      {:error, reason} -> {:error, {:encode_error, reason}}
    end
  end

  @doc """
  Decode a response from JSON.
  """
  @spec decode(binary()) :: {:ok, {reference(), term()}} | {:error, term()}
  def decode(message) when is_binary(message) do
    case Jason.decode(message) do
      {:ok, %{"id" => id, "result" => result}} ->
        ref = string_to_ref(id)
        {:ok, {ref, decode_result(result)}}

      {:ok, %{"id" => id, "error" => error}} ->
        ref = string_to_ref(id)
        {:ok, {ref, {:error, decode_error(error)}}}

      {:error, reason} ->
        {:error, {:decode_error, reason}}

      _ ->
        {:error, :invalid_response}
    end
  end

  # Command encoding

  defp encode_command({:natural_query, query}) do
    %{"type" => "natural_query", "query" => query}
  end

  defp encode_command({:admin, :list_databases}) do
    %{"type" => "admin", "operation" => "listDatabases"}
  end

  defp encode_command({:database, db_name, {:list_collections}}) do
    %{"type" => "database", "database" => db_name, "operation" => "listCollections"}
  end

  defp encode_command({:database, db_name, {:create_collection, name, opts}}) do
    %{
      "type" => "database",
      "database" => db_name,
      "operation" => "createCollection",
      "name" => name,
      "options" => encode_opts(opts)
    }
  end

  defp encode_command({:database, db_name, {:drop_collection, name}}) do
    %{
      "type" => "database",
      "database" => db_name,
      "operation" => "dropCollection",
      "name" => name
    }
  end

  defp encode_command({:database, db_name, {:run_command, command}}) do
    %{
      "type" => "database",
      "database" => db_name,
      "operation" => "runCommand",
      "command" => command
    }
  end

  defp encode_command({:collection, db_name, coll_name, operation}) do
    %{
      "type" => "collection",
      "database" => db_name,
      "collection" => coll_name,
      "operation" => encode_collection_operation(operation)
    }
  end

  defp encode_command(command) do
    %{"type" => "raw", "command" => inspect(command)}
  end

  # Collection operation encoding

  defp encode_collection_operation({:find, filter, opts}) do
    %{
      "operation" => "find",
      "filter" => filter,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:find_one, filter, opts}) do
    %{
      "operation" => "findOne",
      "filter" => filter,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:insert_one, document}) do
    %{
      "operation" => "insertOne",
      "document" => document
    }
  end

  defp encode_collection_operation({:insert_many, documents, opts}) do
    %{
      "operation" => "insertMany",
      "documents" => documents,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:update_one, filter, update, opts}) do
    %{
      "operation" => "updateOne",
      "filter" => filter,
      "update" => update,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:update_many, filter, update, opts}) do
    %{
      "operation" => "updateMany",
      "filter" => filter,
      "update" => update,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:replace_one, filter, replacement, opts}) do
    %{
      "operation" => "replaceOne",
      "filter" => filter,
      "replacement" => replacement,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:delete_one, filter}) do
    %{
      "operation" => "deleteOne",
      "filter" => filter
    }
  end

  defp encode_collection_operation({:delete_many, filter}) do
    %{
      "operation" => "deleteMany",
      "filter" => filter
    }
  end

  defp encode_collection_operation({:count_documents, filter, opts}) do
    %{
      "operation" => "countDocuments",
      "filter" => filter,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:estimated_document_count}) do
    %{"operation" => "estimatedDocumentCount"}
  end

  defp encode_collection_operation({:distinct, field, filter}) do
    %{
      "operation" => "distinct",
      "field" => field,
      "filter" => filter
    }
  end

  defp encode_collection_operation({:aggregate, pipeline, opts}) do
    %{
      "operation" => "aggregate",
      "pipeline" => pipeline,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:create_index, keys, opts}) do
    %{
      "operation" => "createIndex",
      "keys" => keys,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:create_indexes, indexes}) do
    %{
      "operation" => "createIndexes",
      "indexes" => indexes
    }
  end

  defp encode_collection_operation({:list_indexes}) do
    %{"operation" => "listIndexes"}
  end

  defp encode_collection_operation({:drop_index, index_name}) do
    %{
      "operation" => "dropIndex",
      "index" => index_name
    }
  end

  defp encode_collection_operation({:drop_indexes}) do
    %{"operation" => "dropIndexes"}
  end

  defp encode_collection_operation({:watch, opts}) do
    %{
      "operation" => "watch",
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:find_one_and_update, filter, update, opts}) do
    %{
      "operation" => "findOneAndUpdate",
      "filter" => filter,
      "update" => update,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:find_one_and_replace, filter, replacement, opts}) do
    %{
      "operation" => "findOneAndReplace",
      "filter" => filter,
      "replacement" => replacement,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:find_one_and_delete, filter, opts}) do
    %{
      "operation" => "findOneAndDelete",
      "filter" => filter,
      "options" => encode_opts(opts)
    }
  end

  defp encode_collection_operation({:bulk_write, operations, opts}) do
    %{
      "operation" => "bulkWrite",
      "operations" => Enum.map(operations, &encode_bulk_operation/1),
      "options" => encode_opts(opts)
    }
  end

  defp encode_bulk_operation({:insert_one, doc}) do
    %{"insertOne" => %{"document" => doc}}
  end

  defp encode_bulk_operation({:update_one, filter, update}) do
    %{"updateOne" => %{"filter" => filter, "update" => update}}
  end

  defp encode_bulk_operation({:update_many, filter, update}) do
    %{"updateMany" => %{"filter" => filter, "update" => update}}
  end

  defp encode_bulk_operation({:delete_one, filter}) do
    %{"deleteOne" => %{"filter" => filter}}
  end

  defp encode_bulk_operation({:delete_many, filter}) do
    %{"deleteMany" => %{"filter" => filter}}
  end

  defp encode_bulk_operation({:replace_one, filter, replacement}) do
    %{"replaceOne" => %{"filter" => filter, "replacement" => replacement}}
  end

  # Options encoding

  defp encode_opts(opts) when is_list(opts) do
    Enum.into(opts, %{}, fn {k, v} -> {to_camel_case(k), v} end)
  end

  defp encode_opts(opts), do: opts

  defp to_camel_case(atom) when is_atom(atom) do
    atom
    |> Atom.to_string()
    |> to_camel_case()
  end

  defp to_camel_case(string) when is_binary(string) do
    [first | rest] = String.split(string, "_")
    first <> Enum.map_join(rest, &String.capitalize/1)
  end

  # Result decoding

  defp decode_result(%{"ok" => true} = result) do
    {:ok, Map.drop(result, ["ok"])}
  end

  defp decode_result(%{"documents" => docs}) do
    {:ok, docs}
  end

  defp decode_result(result), do: {:ok, result}

  defp decode_error(%{"code" => code, "message" => message}) do
    %MongoDo.Error{code: code, message: message}
  end

  defp decode_error(error) when is_binary(error) do
    %MongoDo.Error{code: nil, message: error}
  end

  defp decode_error(error) do
    %MongoDo.Error{code: nil, message: inspect(error)}
  end

  # Reference helpers

  defp ref_to_string(ref) when is_reference(ref) do
    ref
    |> :erlang.ref_to_list()
    |> List.to_string()
  end

  defp string_to_ref(string) when is_binary(string) do
    # Create a new reference since we can't recreate the original
    # The server should echo back the ID we sent
    make_ref()
  end
end
