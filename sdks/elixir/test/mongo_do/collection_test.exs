defmodule MongoDo.CollectionTest do
  use ExUnit.Case, async: true

  alias MongoDo.{Collection, Database, Client}

  describe "Collection.new/3" do
    test "creates collection reference" do
      db = %Database{name: "test_db", client: %Client{url: "http://localhost"}}
      coll = Collection.new(db, "users")

      assert coll.name == "users"
      assert coll.database == db
      assert coll.schema == nil
    end

    test "creates collection with schema" do
      defmodule TestSchema do
        def cast(doc), do: doc
      end

      db = %Database{name: "test_db", client: %Client{url: "http://localhost"}}
      coll = Collection.new(db, "users", schema: TestSchema)

      assert coll.schema == TestSchema
    end
  end
end
