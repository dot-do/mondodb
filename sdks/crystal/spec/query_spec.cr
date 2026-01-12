require "./spec_helper"

describe Mongo::SortDirection do
  it "has correct values" do
    Mongo::SortDirection::Asc.value.should eq 1
    Mongo::SortDirection::Desc.value.should eq -1
  end
end

describe Mongo::MongoQuery do
  describe "#limit" do
    it "returns a new query with limit" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("test query", config)
      limited = query.limit(10)

      # Original should be unmodified
      query.should_not eq limited
    end
  end

  describe "#skip" do
    it "returns a new query with skip" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("test query", config)
      skipped = query.skip(5)

      query.should_not eq skipped
    end
  end

  describe "#sort" do
    it "returns a new query with sort" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("test query", config)
      sorted = query.sort("name", Mongo::SortDirection::Desc)

      query.should_not eq sorted
    end
  end

  describe "#highlight" do
    it "returns a new query with highlight enabled" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("test query", config)
      highlighted = query.highlight

      query.should_not eq highlighted
    end
  end

  describe "#fuzzy" do
    it "returns a new query with fuzzy enabled" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("test query", config)
      fuzzy = query.fuzzy

      query.should_not eq fuzzy
    end
  end

  describe "#atomic" do
    it "returns a new query with atomic enabled" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("test query", config)
      atomic = query.atomic

      query.should_not eq atomic
    end
  end

  describe "#to_json" do
    it "generates valid JSON-RPC request" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("users in Texas", config)
        .limit(10)
        .skip(5)
        .sort("name", Mongo::SortDirection::Desc)
        .highlight
        .fuzzy

      json = JSON.parse(query.to_json)

      json["jsonrpc"].should eq "2.0"
      json["method"].should eq "mongo.query"
      json["params"]["query"].should eq "users in Texas"
      json["params"]["limit"].should eq 10
      json["params"]["skip"].should eq 5
      json["params"]["highlight"].should eq true
      json["params"]["fuzzy"].should eq true
      json["params"]["sort"]["field"].should eq "name"
      json["params"]["sort"]["direction"].should eq -1
    end

    it "excludes unset options" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("simple query", config)

      json = JSON.parse(query.to_json)

      json["params"]["query"].should eq "simple query"
      json["params"]["limit"]?.should be_nil
      json["params"]["skip"]?.should be_nil
      json["params"]["sort"]?.should be_nil
      json["params"]["highlight"]?.should be_nil
    end
  end

  describe "chaining" do
    it "allows method chaining" do
      config = Mongo::Config.new
      query = Mongo::MongoQuery(JSON::Any).new("test", config)
        .limit(10)
        .skip(5)
        .sort("name")
        .highlight
        .fuzzy
        .atomic

      # Should not raise
      query.should be_a(Mongo::MongoQuery(JSON::Any))
    end
  end
end

describe "Mongo.query" do
  it "creates a MongoQuery" do
    query = Mongo.query("users")
    query.should be_a(Mongo::MongoQuery(JSON::Any))
  end
end
