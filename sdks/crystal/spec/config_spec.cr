require "./spec_helper"

describe Mongo::StorageConfig do
  it "has default values" do
    config = Mongo::StorageConfig.new
    config.hot.should eq "sqlite"
    config.warm.should eq "r2"
    config.cold.should eq "archive"
  end

  it "allows modifying values" do
    config = Mongo::StorageConfig.new
    config.hot = "memory"
    config.hot.should eq "memory"
  end
end

describe Mongo::Config do
  it "has sensible defaults" do
    config = Mongo::Config.new
    config.name.should eq "default"
    config.domain.should eq "mongo.do"
    config.timeout.should eq 30.seconds
    config.max_retries.should eq 3
    config.vector.should be_false
    config.fulltext.should be_false
    config.analytics.should be_false
  end

  it "builds URI from domain" do
    config = Mongo::Config.new
    config.domain = "my-db.example.com"
    config.uri.should eq "https://my-db.example.com"
  end

  it "uses explicit URL if provided" do
    config = Mongo::Config.new
    config.url = "https://custom.example.com"
    config.uri.should eq "https://custom.example.com"
  end

  it "creates headers with content type" do
    config = Mongo::Config.new
    headers = config.headers
    headers["Content-Type"].should eq "application/json"
  end

  it "includes authorization header when API key is set" do
    config = Mongo::Config.new
    config.api_key = "test-key-123"
    headers = config.headers
    headers["Authorization"].should eq "Bearer test-key-123"
  end

  it "excludes authorization header when no API key" do
    config = Mongo::Config.new
    headers = config.headers
    headers["Authorization"]?.should be_nil
  end
end

describe Mongo do
  it "provides global configuration" do
    config = Mongo.config
    config.should be_a(Mongo::Config)
  end

  it "allows configuring via block" do
    original_name = Mongo.config.name

    Mongo.configure do |config|
      config.name = "test-db"
      config.vector = true
    end

    Mongo.config.name.should eq "test-db"
    Mongo.config.vector.should be_true

    # Reset for other tests
    Mongo.configure do |config|
      config.name = original_name
      config.vector = false
    end
  end
end
