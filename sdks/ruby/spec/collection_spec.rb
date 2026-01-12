# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Mongo::Collection do
  let(:transport) { MongoDo::MockRpcTransport.new }
  let(:collection) { described_class.new(transport, 'testdb', 'users') }

  after do
    transport.close
  end

  describe '#initialize' do
    it 'creates a collection with name' do
      expect(collection.name).to eq('users')
      expect(collection.database_name).to eq('testdb')
    end
  end

  describe '#namespace' do
    it 'returns the full namespace' do
      expect(collection.namespace).to eq('testdb.users')
    end
  end

  describe '#insert_one' do
    it 'inserts a document' do
      result = collection.insert_one(name: 'John', age: 30)
      expect(result).to be_a(Mongo::InsertOneResult)
      expect(result).to be_acknowledged
      expect(result.inserted_id).not_to be_nil
    end

    it 'preserves document _id' do
      result = collection.insert_one(_id: 'custom_id', name: 'Jane')
      expect(result.inserted_id).to eq('custom_id')
    end

    it 'converts symbol keys to strings' do
      collection.insert_one(name: 'Test')
      doc = collection.find_one('name' => 'Test')
      expect(doc).not_to be_nil
    end
  end

  describe '#insert_many' do
    it 'inserts multiple documents' do
      result = collection.insert_many([
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' }
      ])
      expect(result).to be_a(Mongo::InsertManyResult)
      expect(result).to be_acknowledged
      expect(result.inserted_count).to eq(3)
      expect(result.inserted_ids.size).to eq(3)
    end
  end

  describe '#find' do
    before do
      collection.insert_many([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 30, status: 'active' },
        { name: 'Charlie', age: 35, status: 'inactive' }
      ])
    end

    it 'returns a cursor' do
      cursor = collection.find
      expect(cursor).to be_a(Mongo::FindCursor)
    end

    it 'finds all documents with empty filter' do
      docs = collection.find.to_a
      expect(docs.length).to eq(3)
    end

    it 'finds documents matching filter' do
      docs = collection.find(status: 'active').to_a
      expect(docs.length).to eq(2)
    end

    it 'supports limit' do
      docs = collection.find.limit(2).to_a
      expect(docs.length).to eq(2)
    end

    it 'supports skip' do
      docs = collection.find.skip(1).to_a
      expect(docs.length).to eq(2)
    end

    it 'supports sort' do
      docs = collection.find.sort(age: -1).to_a
      expect(docs.first['name']).to eq('Charlie')
    end

    it 'supports projection' do
      docs = collection.find.project(name: 1).to_a
      expect(docs.first).to have_key('name')
      expect(docs.first).to have_key('_id')
      expect(docs.first).not_to have_key('age')
    end

    it 'supports combined options' do
      docs = collection.find(status: 'active')
                       .sort(age: -1)
                       .limit(1)
                       .project(name: 1)
                       .to_a
      expect(docs.length).to eq(1)
      expect(docs.first['name']).to eq('Bob')
    end
  end

  describe '#find_one' do
    before do
      collection.insert_one(name: 'Alice', email: 'alice@example.com')
    end

    it 'returns a single document' do
      doc = collection.find_one(name: 'Alice')
      expect(doc['name']).to eq('Alice')
      expect(doc['email']).to eq('alice@example.com')
    end

    it 'returns nil when not found' do
      doc = collection.find_one(name: 'Unknown')
      expect(doc).to be_nil
    end
  end

  describe '#find_one_and_update' do
    before do
      collection.insert_one(name: 'Alice', age: 25)
    end

    it 'updates and returns the original document' do
      doc = collection.find_one_and_update(
        { name: 'Alice' },
        { '$set' => { age: 26 } }
      )
      expect(doc['age']).to eq(25)
    end

    it 'returns updated document with return_document: after' do
      doc = collection.find_one_and_update(
        { name: 'Alice' },
        { '$set' => { age: 26 } },
        return_document: 'after'
      )
      expect(doc['age']).to eq(26)
    end

    it 'returns nil when not found' do
      doc = collection.find_one_and_update(
        { name: 'Unknown' },
        { '$set' => { age: 26 } }
      )
      expect(doc).to be_nil
    end

    it 'supports upsert' do
      doc = collection.find_one_and_update(
        { name: 'NewUser' },
        { '$set' => { age: 20 } },
        upsert: true,
        return_document: 'after'
      )
      expect(doc['age']).to eq(20)
    end
  end

  describe '#find_one_and_delete' do
    before do
      collection.insert_one(name: 'Alice', age: 25)
    end

    it 'deletes and returns the document' do
      doc = collection.find_one_and_delete(name: 'Alice')
      expect(doc['name']).to eq('Alice')
      expect(collection.find_one(name: 'Alice')).to be_nil
    end

    it 'returns nil when not found' do
      doc = collection.find_one_and_delete(name: 'Unknown')
      expect(doc).to be_nil
    end
  end

  describe '#find_one_and_replace' do
    before do
      collection.insert_one(name: 'Alice', age: 25)
    end

    it 'replaces and returns the original document' do
      doc = collection.find_one_and_replace(
        { name: 'Alice' },
        { name: 'Alice2', age: 30 }
      )
      expect(doc['name']).to eq('Alice')
      expect(doc['age']).to eq(25)
    end

    it 'returns replaced document with return_document: after' do
      doc = collection.find_one_and_replace(
        { name: 'Alice' },
        { name: 'Alice2', age: 30 },
        return_document: 'after'
      )
      expect(doc['name']).to eq('Alice2')
      expect(doc['age']).to eq(30)
    end
  end

  describe '#update_one' do
    before do
      collection.insert_many([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 25 }
      ])
    end

    it 'updates a single document' do
      result = collection.update_one({ name: 'Alice' }, { '$set' => { age: 26 } })
      expect(result).to be_a(Mongo::UpdateResult)
      expect(result).to be_acknowledged
      expect(result.matched_count).to eq(1)
      expect(result.modified_count).to eq(1)
    end

    it 'only updates first matching document' do
      result = collection.update_one({ age: 25 }, { '$set' => { updated: true } })
      expect(result.modified_count).to eq(1)
    end

    it 'supports upsert' do
      result = collection.update_one(
        { name: 'NewUser' },
        { '$set' => { age: 20 } },
        upsert: true
      )
      expect(result.upserted_id).not_to be_nil
      expect(result.upserted_count).to eq(1)
    end
  end

  describe '#update_many' do
    before do
      collection.insert_many([
        { name: 'Alice', age: 25, status: 'active' },
        { name: 'Bob', age: 25, status: 'active' },
        { name: 'Charlie', age: 30, status: 'active' }
      ])
    end

    it 'updates multiple documents' do
      result = collection.update_many({ status: 'active' }, { '$set' => { verified: true } })
      expect(result).to be_a(Mongo::UpdateResult)
      expect(result.matched_count).to eq(3)
      expect(result.modified_count).to eq(3)
    end

    it 'updates only matching documents' do
      result = collection.update_many({ age: 25 }, { '$inc' => { age: 1 } })
      expect(result.matched_count).to eq(2)
      expect(result.modified_count).to eq(2)
    end
  end

  describe '#replace_one' do
    before do
      collection.insert_one(name: 'Alice', age: 25)
    end

    it 'replaces a document' do
      result = collection.replace_one({ name: 'Alice' }, { name: 'Alice2', age: 30 })
      expect(result).to be_a(Mongo::UpdateResult)
      expect(result.matched_count).to eq(1)
      expect(result.modified_count).to eq(1)

      doc = collection.find_one('name' => 'Alice2')
      expect(doc['age']).to eq(30)
    end
  end

  describe '#delete_one' do
    before do
      collection.insert_many([
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 25 }
      ])
    end

    it 'deletes a single document' do
      result = collection.delete_one(name: 'Alice')
      expect(result).to be_a(Mongo::DeleteResult)
      expect(result).to be_acknowledged
      expect(result.deleted_count).to eq(1)
    end

    it 'only deletes first matching document' do
      result = collection.delete_one(age: 25)
      expect(result.deleted_count).to eq(1)
      expect(collection.count_documents(age: 25)).to eq(1)
    end

    it 'returns 0 when not found' do
      result = collection.delete_one(name: 'Unknown')
      expect(result.deleted_count).to eq(0)
    end
  end

  describe '#delete_many' do
    before do
      collection.insert_many([
        { name: 'Alice', status: 'inactive' },
        { name: 'Bob', status: 'inactive' },
        { name: 'Charlie', status: 'active' }
      ])
    end

    it 'deletes multiple documents' do
      result = collection.delete_many(status: 'inactive')
      expect(result).to be_a(Mongo::DeleteResult)
      expect(result.deleted_count).to eq(2)
    end

    it 'deletes all documents with empty filter' do
      result = collection.delete_many({})
      expect(result.deleted_count).to eq(3)
    end
  end

  describe '#count_documents' do
    before do
      collection.insert_many([
        { name: 'Alice', status: 'active' },
        { name: 'Bob', status: 'active' },
        { name: 'Charlie', status: 'inactive' }
      ])
    end

    it 'counts all documents' do
      count = collection.count_documents
      expect(count).to eq(3)
    end

    it 'counts documents matching filter' do
      count = collection.count_documents(status: 'active')
      expect(count).to eq(2)
    end

    it 'supports skip and limit' do
      count = collection.count_documents({}, skip: 1, limit: 1)
      expect(count).to eq(1)
    end
  end

  describe '#estimated_document_count' do
    before do
      collection.insert_many([{ name: 'A' }, { name: 'B' }, { name: 'C' }])
    end

    it 'returns estimated count' do
      count = collection.estimated_document_count
      expect(count).to eq(3)
    end
  end

  describe '#aggregate' do
    before do
      collection.insert_many([
        { category: 'A', amount: 10 },
        { category: 'A', amount: 20 },
        { category: 'B', amount: 30 }
      ])
    end

    it 'returns an aggregation cursor' do
      cursor = collection.aggregate([])
      expect(cursor).to be_a(Mongo::AggregationCursor)
    end

    it 'executes match stage' do
      results = collection.aggregate([
        { '$match' => { category: 'A' } }
      ]).to_a
      expect(results.length).to eq(2)
    end

    it 'executes group stage' do
      results = collection.aggregate([
        { '$group' => { _id: '$category', total: { '$sum' => '$amount' } } }
      ]).to_a
      expect(results.length).to eq(2)

      category_a = results.find { |r| r['_id'] == 'A' }
      expect(category_a['total']).to eq(30)
    end

    it 'executes sort and limit stages' do
      results = collection.aggregate([
        { '$sort' => { amount: -1 } },
        { '$limit' => 2 }
      ]).to_a
      expect(results.length).to eq(2)
      expect(results.first['amount']).to eq(30)
    end
  end

  describe '#distinct' do
    before do
      collection.insert_many([
        { category: 'A', status: 'active' },
        { category: 'B', status: 'active' },
        { category: 'A', status: 'inactive' }
      ])
    end

    it 'returns distinct values' do
      values = collection.distinct(:category)
      expect(values.sort).to eq(%w[A B])
    end

    it 'supports filter' do
      values = collection.distinct(:category, status: 'active')
      expect(values.sort).to eq(%w[A B])
    end
  end

  describe 'index operations' do
    describe '#create_index' do
      it 'creates an index' do
        result = collection.create_index(name: 1)
        expect(result).to eq('index_name')
      end
    end

    describe '#create_indexes' do
      it 'creates multiple indexes' do
        result = collection.create_indexes([
          { key: { name: 1 } },
          { key: { age: -1 } }
        ])
        expect(result).to eq(%w[index_1 index_2])
      end
    end

    describe '#list_indexes' do
      it 'lists indexes' do
        indexes = collection.list_indexes
        expect(indexes).to be_an(Array)
        expect(indexes.first['name']).to eq('_id_')
      end
    end

    describe '#drop_index' do
      it 'drops an index' do
        expect { collection.drop_index('my_index') }.not_to raise_error
      end
    end

    describe '#drop_indexes' do
      it 'drops all indexes' do
        expect { collection.drop_indexes }.not_to raise_error
      end
    end
  end

  describe '#drop' do
    it 'drops the collection' do
      result = collection.drop
      expect(result).to be(true)
    end
  end

  describe '#rename' do
    before do
      collection.insert_one(name: 'test')
    end

    it 'renames the collection' do
      collection.rename('new_users')
      expect(collection.name).to eq('new_users')
    end
  end

  describe '#bulk_write' do
    it 'executes bulk operations' do
      result = collection.bulk_write([
        { insertOne: { document: { name: 'Alice' } } },
        { insertOne: { document: { name: 'Bob' } } },
        { updateOne: { filter: { name: 'Alice' }, update: { '$set' => { age: 25 } } } },
        { deleteOne: { filter: { name: 'Bob' } } }
      ])

      expect(result).to be_a(Mongo::BulkWriteResult)
      expect(result.inserted_count).to eq(2)
      expect(result.modified_count).to eq(1)
      expect(result.deleted_count).to eq(1)
    end
  end
end
