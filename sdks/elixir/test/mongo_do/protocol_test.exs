defmodule MongoDo.ProtocolTest do
  use ExUnit.Case, async: true

  alias MongoDo.Protocol

  describe "encode/2" do
    test "encodes natural query command" do
      ref = make_ref()
      {:ok, json} = Protocol.encode({:natural_query, "find all users"}, ref)

      decoded = Jason.decode!(json)
      assert decoded["command"]["type"] == "natural_query"
      assert decoded["command"]["query"] == "find all users"
      assert is_binary(decoded["id"])
    end

    test "encodes admin list_databases command" do
      ref = make_ref()
      {:ok, json} = Protocol.encode({:admin, :list_databases}, ref)

      decoded = Jason.decode!(json)
      assert decoded["command"]["type"] == "admin"
      assert decoded["command"]["operation"] == "listDatabases"
    end

    test "encodes collection find command" do
      ref = make_ref()

      {:ok, json} =
        Protocol.encode(
          {:collection, "test_db", "users", {:find, %{active: true}, [limit: 10]}},
          ref
        )

      decoded = Jason.decode!(json)
      assert decoded["command"]["type"] == "collection"
      assert decoded["command"]["database"] == "test_db"
      assert decoded["command"]["collection"] == "users"
      assert decoded["command"]["operation"]["operation"] == "find"
      assert decoded["command"]["operation"]["filter"] == %{"active" => true}
      assert decoded["command"]["operation"]["options"]["limit"] == 10
    end

    test "encodes collection insert_one command" do
      ref = make_ref()
      doc = %{name: "Alice", email: "alice@example.com"}

      {:ok, json} =
        Protocol.encode(
          {:collection, "test_db", "users", {:insert_one, doc}},
          ref
        )

      decoded = Jason.decode!(json)
      assert decoded["command"]["operation"]["operation"] == "insertOne"
      assert decoded["command"]["operation"]["document"]["name"] == "Alice"
    end

    test "encodes collection update_one command" do
      ref = make_ref()

      {:ok, json} =
        Protocol.encode(
          {:collection, "test_db", "users",
           {:update_one, %{name: "Alice"}, %{"$set" => %{active: true}}, [upsert: true]}},
          ref
        )

      decoded = Jason.decode!(json)
      assert decoded["command"]["operation"]["operation"] == "updateOne"
      assert decoded["command"]["operation"]["filter"] == %{"name" => "Alice"}
      assert decoded["command"]["operation"]["update"] == %{"$set" => %{"active" => true}}
      assert decoded["command"]["operation"]["options"]["upsert"] == true
    end

    test "encodes collection delete_one command" do
      ref = make_ref()

      {:ok, json} =
        Protocol.encode(
          {:collection, "test_db", "users", {:delete_one, %{name: "Alice"}}},
          ref
        )

      decoded = Jason.decode!(json)
      assert decoded["command"]["operation"]["operation"] == "deleteOne"
      assert decoded["command"]["operation"]["filter"] == %{"name" => "Alice"}
    end

    test "encodes aggregate pipeline" do
      ref = make_ref()

      pipeline = [
        %{"$match" => %{active: true}},
        %{"$group" => %{"_id" => "$city", "count" => %{"$sum" => 1}}}
      ]

      {:ok, json} =
        Protocol.encode(
          {:collection, "test_db", "users", {:aggregate, pipeline, []}},
          ref
        )

      decoded = Jason.decode!(json)
      assert decoded["command"]["operation"]["operation"] == "aggregate"
      assert length(decoded["command"]["operation"]["pipeline"]) == 2
    end

    test "encodes bulk_write operations" do
      ref = make_ref()

      operations = [
        {:insert_one, %{name: "Alice"}},
        {:update_one, %{name: "Bob"}, %{"$set" => %{active: true}}},
        {:delete_one, %{name: "Charlie"}}
      ]

      {:ok, json} =
        Protocol.encode(
          {:collection, "test_db", "users", {:bulk_write, operations, []}},
          ref
        )

      decoded = Jason.decode!(json)
      assert decoded["command"]["operation"]["operation"] == "bulkWrite"
      assert length(decoded["command"]["operation"]["operations"]) == 3
    end
  end

  describe "decode/1" do
    test "decodes successful result" do
      response = Jason.encode!(%{
        "id" => "test-id",
        "result" => %{"documents" => [%{"name" => "Alice"}]}
      })

      {:ok, {_ref, result}} = Protocol.decode(response)
      assert result == {:ok, [%{"name" => "Alice"}]}
    end

    test "decodes error result" do
      response = Jason.encode!(%{
        "id" => "test-id",
        "error" => %{"code" => 11000, "message" => "Duplicate key error"}
      })

      {:ok, {_ref, {:error, error}}} = Protocol.decode(response)
      assert error.code == 11000
      assert error.message == "Duplicate key error"
    end

    test "handles malformed JSON" do
      {:error, {:decode_error, _}} = Protocol.decode("not json")
    end
  end
end
