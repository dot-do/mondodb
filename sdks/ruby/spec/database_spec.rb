# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Mongo::Database do
  let(:transport) { MongoDo::MockRpcTransport.new }
  let(:database) { described_class.new(transport, 'testdb') }

  after do
    transport.close
  end

  describe '#initialize' do
    it 'creates a database with name' do
      expect(database.name).to eq('testdb')
      expect(database.database_name).to eq('testdb')
    end
  end

  describe '#collection' do
    it 'returns a collection instance' do
      coll = database.collection('users')
      expect(coll).to be_a(Mongo::Collection)
      expect(coll.name).to eq('users')
    end

    it 'caches collection instances' do
      coll1 = database.collection('users')
      coll2 = database.collection('users')
      expect(coll1).to be(coll2)
    end

    it 'accepts symbol names' do
      coll = database.collection(:users)
      expect(coll.name).to eq('users')
    end
  end

  describe '#[]' do
    it 'returns a collection using bracket syntax' do
      coll = database[:users]
      expect(coll).to be_a(Mongo::Collection)
      expect(coll.name).to eq('users')
    end
  end

  describe '#create_collection' do
    it 'creates a new collection' do
      coll = database.create_collection('new_collection')
      expect(coll).to be_a(Mongo::Collection)
      expect(coll.name).to eq('new_collection')
    end

    it 'accepts options' do
      coll = database.create_collection('capped_coll', capped: true, size: 10_000)
      expect(coll).to be_a(Mongo::Collection)
    end
  end

  describe '#drop' do
    it 'drops the database' do
      result = database.drop
      expect(result).to be(true)
    end
  end

  describe '#list_collections' do
    it 'returns collection info' do
      database.create_collection('test_coll')
      infos = database.list_collections
      expect(infos).to be_an(Array)
    end

    it 'returns empty array for new database' do
      new_db = described_class.new(transport, 'empty_db')
      infos = new_db.list_collections
      expect(infos).to eq([])
    end
  end

  describe '#collections' do
    it 'returns collection objects' do
      database.create_collection('coll1')
      database.create_collection('coll2')
      collections = database.collections
      expect(collections).to all(be_a(Mongo::Collection))
    end
  end

  describe '#collection_names' do
    it 'returns collection names as strings' do
      database.create_collection('test_coll')
      names = database.collection_names
      expect(names).to include('test_coll')
    end
  end

  describe '#command' do
    it 'runs a database command' do
      result = database.command(ping: 1)
      expect(result['ok']).to eq(1)
    end
  end

  describe '#stats' do
    it 'returns database statistics' do
      stats = database.stats
      expect(stats['db']).to eq('testdb')
      expect(stats['ok']).to eq(1)
    end
  end

  describe '#admin' do
    it 'returns an AdminDb instance' do
      admin = database.admin
      expect(admin).to be_a(Mongo::AdminDb)
    end
  end

  describe '#rename_collection' do
    it 'renames a collection' do
      database.create_collection('old_name')
      database[:old_name].insert_one(name: 'test')
      database.rename_collection('old_name', 'new_name')

      expect(database.collection_names).to include('new_name')
      expect(database.collection_names).not_to include('old_name')
    end
  end
end

RSpec.describe Mongo::AdminDb do
  let(:transport) { MongoDo::MockRpcTransport.new }
  let(:admin) { described_class.new(transport) }

  after do
    transport.close
  end

  describe '#list_databases' do
    it 'returns database list' do
      result = admin.list_databases
      expect(result).to have_key('databases')
      expect(result).to have_key('totalSize')
    end
  end

  describe '#server_status' do
    it 'returns server status' do
      result = admin.server_status
      expect(result['ok']).to eq(1)
      expect(result['host']).to eq('localhost')
    end
  end

  describe '#ping' do
    it 'pings the server' do
      result = admin.ping
      expect(result['ok']).to eq(1)
    end
  end

  describe '#command' do
    it 'runs an admin command' do
      result = admin.command(serverStatus: 1)
      expect(result['ok']).to eq(1)
    end
  end
end
