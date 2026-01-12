# MongoDB SDK for the .do platform
# Natural Language First, AI-Native
#
# Example:
#   require "mongo-do"
#
#   users = Mongo.query "users who haven't logged in this month"
#   vips = Mongo.query "customers with orders over $1000"

require "json"
require "http/client"
require "uri"

require "./mongo-do/client"
require "./mongo-do/database"
require "./mongo-do/collection"
require "./mongo-do/cursor"
require "./mongo-do/query"
require "./mongo-do/errors"
require "./mongo-do/results"
require "./mongo-do/config"

module Mongo
  VERSION = "0.1.0"

  # Global configuration
  @@config : Config = Config.new

  # Configure the Mongo client globally
  def self.configure(&)
    yield @@config
  end

  # Get the current configuration
  def self.config : Config
    @@config
  end

  # Execute a natural language query
  #
  # Example:
  #   users = Mongo.query "users who haven't logged in this month"
  #   vips = Mongo.query "customers with orders over $1000"
  def self.query(query_string : String) : MongoQuery(JSON::Any)
    MongoQuery(JSON::Any).new(query_string, @@config)
  end

  # Execute a query within a transaction
  #
  # Example:
  #   Mongo.transaction do |tx|
  #     tx.query("alice account").debit(100)
  #     tx.query("bob account").credit(100)
  #   end
  def self.transaction(&)
    tx = Transaction.new(@@config)
    begin
      yield tx
      tx.commit
    rescue ex
      tx.rollback
      raise ex
    end
  end
end
