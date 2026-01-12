require "./spec_helper"

describe Mongo::Cursor do
  describe "#next" do
    it "returns documents in order" do
      docs = test_documents(3)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      cursor.next.should eq docs[0]
      cursor.next.should eq docs[1]
      cursor.next.should eq docs[2]
      cursor.next.should be_nil
    end

    it "returns nil when exhausted" do
      cursor = Mongo::Cursor(JSON::Any).new([] of JSON::Any)
      cursor.next.should be_nil
      cursor.exhausted?.should be_true
    end
  end

  describe "#has_next?" do
    it "returns true when documents remain" do
      docs = test_documents(2)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      cursor.has_next?.should be_true
      cursor.next
      cursor.has_next?.should be_true
      cursor.next
      cursor.has_next?.should be_false
    end
  end

  describe "#each" do
    it "iterates over all documents" do
      docs = test_documents(3)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      collected = [] of JSON::Any
      cursor.each { |doc| collected << doc }

      collected.should eq docs
    end
  end

  describe "#to_a" do
    it "converts cursor to array" do
      docs = test_documents(3)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      result = cursor.to_a
      result.should eq docs
      cursor.exhausted?.should be_true
    end
  end

  describe "#first" do
    it "returns the first document" do
      docs = test_documents(3)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      cursor.first.should eq docs[0]
    end

    it "returns nil for empty cursor" do
      cursor = Mongo::Cursor(JSON::Any).new([] of JSON::Any)
      cursor.first.should be_nil
    end
  end

  describe "#first!" do
    it "returns the first document" do
      docs = test_documents(3)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      cursor.first!.should eq docs[0]
    end

    it "raises for empty cursor" do
      cursor = Mongo::Cursor(JSON::Any).new([] of JSON::Any)
      expect_raises(Mongo::DocumentNotFoundError) { cursor.first! }
    end
  end

  describe "#count" do
    it "returns the number of documents" do
      docs = test_documents(5)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      cursor.count.should eq 5
    end
  end

  describe "#map" do
    it "transforms documents" do
      docs = [
        JSON::Any.new({"value" => JSON::Any.new(1_i64)}),
        JSON::Any.new({"value" => JSON::Any.new(2_i64)}),
        JSON::Any.new({"value" => JSON::Any.new(3_i64)}),
      ]
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      result = cursor.map { |doc| doc["value"].as_i64 * 2 }
      result.should eq [2_i64, 4_i64, 6_i64]
    end
  end

  describe "#select" do
    it "filters documents" do
      docs = [
        JSON::Any.new({"value" => JSON::Any.new(1_i64)}),
        JSON::Any.new({"value" => JSON::Any.new(2_i64)}),
        JSON::Any.new({"value" => JSON::Any.new(3_i64)}),
      ]
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      result = cursor.select { |doc| doc["value"].as_i64 > 1 }
      result.size.should eq 2
    end
  end

  describe "#reduce" do
    it "reduces documents" do
      docs = [
        JSON::Any.new({"value" => JSON::Any.new(1_i64)}),
        JSON::Any.new({"value" => JSON::Any.new(2_i64)}),
        JSON::Any.new({"value" => JSON::Any.new(3_i64)}),
      ]
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      result = cursor.reduce(0_i64) { |acc, doc| acc + doc["value"].as_i64 }
      result.should eq 6_i64
    end
  end

  describe "#skip" do
    it "skips documents" do
      docs = test_documents(5)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      cursor.skip(2)
      cursor.next.should eq docs[2]
    end
  end

  describe "#limit" do
    it "limits documents" do
      docs = test_documents(5)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      result = cursor.limit(3)
      result.size.should eq 3
    end

    it "returns fewer if not enough documents" do
      docs = test_documents(2)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      result = cursor.limit(5)
      result.size.should eq 2
    end
  end

  describe "#close" do
    it "marks cursor as exhausted" do
      docs = test_documents(3)
      cursor = Mongo::Cursor(JSON::Any).new(docs)

      cursor.close
      cursor.exhausted?.should be_true
      cursor.next.should be_nil
    end
  end
end
