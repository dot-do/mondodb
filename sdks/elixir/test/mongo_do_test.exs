defmodule MongoDoTest do
  use ExUnit.Case, async: true

  alias MongoDo.{Query, Promise, Document}

  describe "Query builder" do
    test "creates query with limit" do
      query = Query.new("users") |> Query.limit(10)
      assert query.limit == 10
    end

    test "creates query with skip" do
      query = Query.new("users") |> Query.skip(20)
      assert query.skip == 20
    end

    test "creates query with sort" do
      query = Query.new("users") |> Query.sort("created_at", :desc)
      assert query.sort == [{"created_at", :desc}]
    end

    test "chains multiple query options" do
      query =
        Query.new("users")
        |> Query.limit(10)
        |> Query.skip(5)
        |> Query.sort("name", :asc)
        |> Query.highlight()

      assert query.limit == 10
      assert query.skip == 5
      assert query.sort == [{"name", :asc}]
      assert query.highlight == true
    end

    test "converts query to options" do
      query =
        Query.new("users")
        |> Query.limit(10)
        |> Query.skip(5)
        |> Query.sort("name", :asc)

      opts = Query.to_opts(query)

      assert Keyword.get(opts, :limit) == 10
      assert Keyword.get(opts, :skip) == 5
      assert Keyword.get(opts, :sort) == %{"name" => 1}
    end
  end

  describe "Promise" do
    test "creates resolved promise from value" do
      promise = Promise.new([1, 2, 3])
      assert promise.resolved == true
      assert promise.value == [1, 2, 3]
    end

    test "maps over promise" do
      result =
        Promise.new([1, 2, 3])
        |> Promise.map(fn list -> Enum.map(list, &(&1 * 2)) end)
        |> Promise.await()

      assert result == [2, 4, 6]
    end

    test "chains multiple maps" do
      result =
        Promise.new(5)
        |> Promise.map(&(&1 * 2))
        |> Promise.map(&(&1 + 1))
        |> Promise.await()

      assert result == 11
    end

    test "await_all resolves multiple promises" do
      promises = [
        Promise.new(1),
        Promise.new(2),
        Promise.new(3)
      ]

      results = Promise.await_all(promises)
      assert results == [1, 2, 3]
    end

    test "maps over lists element-wise" do
      result =
        Promise.new([1, 2, 3])
        |> Promise.map(&(&1 * 10))
        |> Promise.await()

      assert result == [10, 20, 30]
    end
  end

  describe "Document schema" do
    defmodule TestUser do
      use MongoDo.Document

      document do
        field :_id, :object_id
        field :name, :string
        field :email, :string
        field :age, :integer
        field :active, :boolean
      end
    end

    test "defines struct with fields" do
      user = %TestUser{name: "Alice", email: "alice@example.com"}
      assert user.name == "Alice"
      assert user.email == "alice@example.com"
    end

    test "casts map to struct" do
      data = %{
        "_id" => %{"$oid" => "507f1f77bcf86cd799439011"},
        "name" => "Alice",
        "email" => "alice@example.com",
        "age" => 30,
        "active" => true
      }

      user = TestUser.cast(data)

      assert user.__struct__ == TestUser
      assert user._id == "507f1f77bcf86cd799439011"
      assert user.name == "Alice"
      assert user.email == "alice@example.com"
      assert user.age == 30
      assert user.active == true
    end

    test "casts with atom keys" do
      data = %{
        name: "Bob",
        email: "bob@example.com",
        age: 25
      }

      user = TestUser.cast(data)

      assert user.name == "Bob"
      assert user.email == "bob@example.com"
      assert user.age == 25
    end

    test "dumps struct to map" do
      user = %TestUser{
        _id: "507f1f77bcf86cd799439011",
        name: "Alice",
        email: "alice@example.com",
        age: 30,
        active: true
      }

      data = TestUser.dump(user)

      assert data["_id"] == %{"$oid" => "507f1f77bcf86cd799439011"}
      assert data["name"] == "Alice"
      assert data["email"] == "alice@example.com"
      assert data["age"] == 30
      assert data["active"] == true
    end

    test "__fields__ returns field names" do
      assert TestUser.__fields__() == [:_id, :name, :email, :age, :active]
    end
  end

  describe "Document.cast_value" do
    test "casts string values" do
      assert Document.cast_value("hello", :string) == "hello"
      assert Document.cast_value(123, :string) == "123"
    end

    test "casts integer values" do
      assert Document.cast_value(42, :integer) == 42
      assert Document.cast_value(42.9, :integer) == 42
      assert Document.cast_value("42", :integer) == 42
    end

    test "casts float values" do
      assert Document.cast_value(3.14, :float) == 3.14
      assert Document.cast_value(42, :float) == 42.0
    end

    test "casts boolean values" do
      assert Document.cast_value(true, :boolean) == true
      assert Document.cast_value(false, :boolean) == false
      assert Document.cast_value("true", :boolean) == true
      assert Document.cast_value("false", :boolean) == false
    end

    test "casts datetime values" do
      dt = DateTime.utc_now()
      assert Document.cast_value(dt, :datetime) == dt

      iso = "2024-01-15T10:30:00Z"
      {:ok, expected, _} = DateTime.from_iso8601(iso)
      assert Document.cast_value(iso, :datetime) == expected
    end

    test "casts MongoDB date format" do
      ms = 1705315800000
      result = Document.cast_value(%{"$date" => ms}, :datetime)
      assert result == DateTime.from_unix!(ms, :millisecond)
    end

    test "casts object_id values" do
      assert Document.cast_value(%{"$oid" => "abc123"}, :object_id) == "abc123"
      assert Document.cast_value("abc123", :object_id) == "abc123"
    end

    test "preserves nil values" do
      assert Document.cast_value(nil, :string) == nil
      assert Document.cast_value(nil, :integer) == nil
    end
  end
end
