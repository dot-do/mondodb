require "spec"
require "../src/mongo-do"

# Mock HTTP response for testing
class MockHTTPResponse
  property status_code : Int32
  property body : String

  def initialize(@status_code : Int32 = 200, @body : String = "{}")
  end

  def success? : Bool
    @status_code >= 200 && @status_code < 300
  end
end

# Mock RPC client for testing without network calls
class MockRPCClient
  property responses : Hash(String, JSON::Any) = {} of String => JSON::Any
  property calls : Array(Tuple(String, Hash(String, JSON::Any))) = [] of Tuple(String, Hash(String, JSON::Any))

  def add_response(method : String, response : JSON::Any)
    @responses[method] = response
  end

  def call(method : String, params : Hash(String, _) = {} of String => String) : JSON::Any
    @calls << {method, params.transform_values { |v| to_json_any(v) }}
    @responses[method]? || JSON::Any.new(nil)
  end

  def clear
    @responses.clear
    @calls.clear
  end

  private def to_json_any(value) : JSON::Any
    case value
    when JSON::Any
      value
    when Hash
      hash = {} of String => JSON::Any
      value.each { |k, v| hash[k.to_s] = to_json_any(v) }
      JSON::Any.new(hash)
    when Array
      JSON::Any.new(value.map { |v| to_json_any(v) })
    when String
      JSON::Any.new(value)
    when Int32, Int64
      JSON::Any.new(value.to_i64)
    when Float32, Float64
      JSON::Any.new(value.to_f64)
    when Bool
      JSON::Any.new(value)
    when Nil
      JSON::Any.new(nil)
    else
      JSON::Any.new(value.to_s)
    end
  end
end

# Helper for creating test documents
def test_document(overrides = {} of String => JSON::Any) : JSON::Any
  doc = {
    "_id"       => JSON::Any.new("test-id-123"),
    "name"      => JSON::Any.new("Test User"),
    "email"     => JSON::Any.new("test@example.com"),
    "createdAt" => JSON::Any.new(Time.utc.to_s),
  }
  overrides.each { |k, v| doc[k] = v }
  JSON::Any.new(doc)
end

# Helper for creating test arrays
def test_documents(count : Int32 = 3) : Array(JSON::Any)
  (0...count).map do |i|
    test_document({"_id" => JSON::Any.new("test-id-#{i}"), "name" => JSON::Any.new("User #{i}")})
  end
end
