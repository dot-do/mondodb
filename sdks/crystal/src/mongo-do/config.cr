module Mongo
  # Storage configuration for tiered storage
  class StorageConfig
    property hot : String = "sqlite"
    property warm : String = "r2"
    property cold : String = "archive"

    def initialize
    end
  end

  # Main configuration class
  class Config
    property name : String = "default"
    property domain : String = "mongo.do"
    property url : String?
    property api_key : String?
    property timeout : Time::Span = 30.seconds
    property max_retries : Int32 = 3
    property vector : Bool = false
    property fulltext : Bool = false
    property analytics : Bool = false
    property storage : StorageConfig = StorageConfig.new

    def initialize
      # Load from environment if available
      @url = ENV["MONGO_DO_URL"]? || ENV["MONGODB_URI"]?
      @api_key = ENV["MONGO_DO_API_KEY"]?
    end

    # Build the full URI from configuration
    def uri : String
      @url || "https://#{@domain}"
    end

    # Get headers for API requests
    def headers : HTTP::Headers
      headers = HTTP::Headers.new
      headers["Content-Type"] = "application/json"
      if key = @api_key
        headers["Authorization"] = "Bearer #{key}"
      end
      headers
    end
  end
end
