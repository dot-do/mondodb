require "./spec_helper"

describe Mongo::InsertOneResult do
  it "creates from JSON" do
    json = JSON::Any.new({
      "insertedId"   => JSON::Any.new("abc123"),
      "acknowledged" => JSON::Any.new(true),
    })

    result = Mongo::InsertOneResult.from_json(json)
    result.inserted_id.should eq "abc123"
    result.acknowledged.should be_true
  end

  it "handles missing fields gracefully" do
    json = JSON::Any.new({} of String => JSON::Any)
    result = Mongo::InsertOneResult.from_json(json)
    result.inserted_id.should eq ""
    result.acknowledged.should be_true
  end
end

describe Mongo::InsertManyResult do
  it "creates from JSON" do
    json = JSON::Any.new({
      "insertedIds"  => JSON::Any.new([JSON::Any.new("id1"), JSON::Any.new("id2"), JSON::Any.new("id3")]),
      "acknowledged" => JSON::Any.new(true),
    })

    result = Mongo::InsertManyResult.from_json(json)
    result.inserted_ids.should eq ["id1", "id2", "id3"]
    result.inserted_count.should eq 3
    result.acknowledged.should be_true
  end

  it "handles empty array" do
    json = JSON::Any.new({
      "insertedIds" => JSON::Any.new([] of JSON::Any),
    })

    result = Mongo::InsertManyResult.from_json(json)
    result.inserted_ids.should eq [] of String
    result.inserted_count.should eq 0
  end
end

describe Mongo::UpdateResult do
  it "creates from JSON with upsert" do
    json = JSON::Any.new({
      "matchedCount"  => JSON::Any.new(0_i64),
      "modifiedCount" => JSON::Any.new(0_i64),
      "upsertedId"    => JSON::Any.new("new-id"),
      "acknowledged"  => JSON::Any.new(true),
    })

    result = Mongo::UpdateResult.from_json(json)
    result.matched_count.should eq 0
    result.modified_count.should eq 0
    result.upserted_id.should eq "new-id"
    result.upserted?.should be_true
  end

  it "creates from JSON without upsert" do
    json = JSON::Any.new({
      "matchedCount"  => JSON::Any.new(5_i64),
      "modifiedCount" => JSON::Any.new(3_i64),
      "acknowledged"  => JSON::Any.new(true),
    })

    result = Mongo::UpdateResult.from_json(json)
    result.matched_count.should eq 5
    result.modified_count.should eq 3
    result.upserted_id.should be_nil
    result.upserted?.should be_false
  end
end

describe Mongo::DeleteResult do
  it "creates from JSON" do
    json = JSON::Any.new({
      "deletedCount" => JSON::Any.new(10_i64),
      "acknowledged" => JSON::Any.new(true),
    })

    result = Mongo::DeleteResult.from_json(json)
    result.deleted_count.should eq 10
    result.acknowledged.should be_true
  end

  it "handles zero deletes" do
    json = JSON::Any.new({
      "deletedCount" => JSON::Any.new(0_i64),
    })

    result = Mongo::DeleteResult.from_json(json)
    result.deleted_count.should eq 0
  end
end

describe Mongo::BulkWriteResult do
  it "creates from JSON" do
    json = JSON::Any.new({
      "insertedCount" => JSON::Any.new(5_i64),
      "matchedCount"  => JSON::Any.new(3_i64),
      "modifiedCount" => JSON::Any.new(2_i64),
      "deletedCount"  => JSON::Any.new(1_i64),
      "upsertedCount" => JSON::Any.new(0_i64),
      "acknowledged"  => JSON::Any.new(true),
    })

    result = Mongo::BulkWriteResult.from_json(json)
    result.inserted_count.should eq 5
    result.matched_count.should eq 3
    result.modified_count.should eq 2
    result.deleted_count.should eq 1
    result.upserted_count.should eq 0
    result.acknowledged.should be_true
  end

  it "initializes with defaults" do
    result = Mongo::BulkWriteResult.new
    result.inserted_count.should eq 0
    result.matched_count.should eq 0
    result.modified_count.should eq 0
    result.deleted_count.should eq 0
    result.upserted_count.should eq 0
    result.acknowledged.should be_true
  end
end
