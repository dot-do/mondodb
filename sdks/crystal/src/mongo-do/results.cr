module Mongo
  # Result of an insert_one operation
  struct InsertOneResult
    getter inserted_id : String
    getter acknowledged : Bool

    def initialize(@inserted_id : String, @acknowledged : Bool = true)
    end

    def self.from_json(json : JSON::Any) : InsertOneResult
      InsertOneResult.new(
        inserted_id: json["insertedId"]?.try(&.as_s) || "",
        acknowledged: json["acknowledged"]?.try(&.as_bool) || true
      )
    end
  end

  # Result of an insert_many operation
  struct InsertManyResult
    getter inserted_ids : Array(String)
    getter inserted_count : Int32
    getter acknowledged : Bool

    def initialize(@inserted_ids : Array(String), @acknowledged : Bool = true)
      @inserted_count = @inserted_ids.size
    end

    def self.from_json(json : JSON::Any) : InsertManyResult
      ids = json["insertedIds"]?.try(&.as_a.map(&.as_s)) || [] of String
      InsertManyResult.new(
        inserted_ids: ids,
        acknowledged: json["acknowledged"]?.try(&.as_bool) || true
      )
    end
  end

  # Result of an update operation
  struct UpdateResult
    getter matched_count : Int64
    getter modified_count : Int64
    getter upserted_id : String?
    getter acknowledged : Bool

    def initialize(
      @matched_count : Int64,
      @modified_count : Int64,
      @upserted_id : String? = nil,
      @acknowledged : Bool = true
    )
    end

    def upserted? : Bool
      !@upserted_id.nil?
    end

    def self.from_json(json : JSON::Any) : UpdateResult
      UpdateResult.new(
        matched_count: json["matchedCount"]?.try(&.as_i64) || 0_i64,
        modified_count: json["modifiedCount"]?.try(&.as_i64) || 0_i64,
        upserted_id: json["upsertedId"]?.try(&.as_s?),
        acknowledged: json["acknowledged"]?.try(&.as_bool) || true
      )
    end
  end

  # Result of a delete operation
  struct DeleteResult
    getter deleted_count : Int64
    getter acknowledged : Bool

    def initialize(@deleted_count : Int64, @acknowledged : Bool = true)
    end

    def self.from_json(json : JSON::Any) : DeleteResult
      DeleteResult.new(
        deleted_count: json["deletedCount"]?.try(&.as_i64) || 0_i64,
        acknowledged: json["acknowledged"]?.try(&.as_bool) || true
      )
    end
  end

  # Result of a bulk write operation
  struct BulkWriteResult
    getter inserted_count : Int64
    getter matched_count : Int64
    getter modified_count : Int64
    getter deleted_count : Int64
    getter upserted_count : Int64
    getter upserted_ids : Hash(Int32, String)
    getter acknowledged : Bool

    def initialize(
      @inserted_count : Int64 = 0_i64,
      @matched_count : Int64 = 0_i64,
      @modified_count : Int64 = 0_i64,
      @deleted_count : Int64 = 0_i64,
      @upserted_count : Int64 = 0_i64,
      @upserted_ids : Hash(Int32, String) = {} of Int32 => String,
      @acknowledged : Bool = true
    )
    end

    def self.from_json(json : JSON::Any) : BulkWriteResult
      upserted = {} of Int32 => String
      json["upsertedIds"]?.try(&.as_h.each do |k, v|
        upserted[k.to_i32] = v.as_s
      end)

      BulkWriteResult.new(
        inserted_count: json["insertedCount"]?.try(&.as_i64) || 0_i64,
        matched_count: json["matchedCount"]?.try(&.as_i64) || 0_i64,
        modified_count: json["modifiedCount"]?.try(&.as_i64) || 0_i64,
        deleted_count: json["deletedCount"]?.try(&.as_i64) || 0_i64,
        upserted_count: json["upsertedCount"]?.try(&.as_i64) || 0_i64,
        upserted_ids: upserted,
        acknowledged: json["acknowledged"]?.try(&.as_bool) || true
      )
    end
  end
end
