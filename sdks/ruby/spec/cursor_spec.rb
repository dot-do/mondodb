# frozen_string_literal: true

require 'spec_helper'

RSpec.describe Mongo::FindCursor do
  let(:transport) { MongoDo::MockRpcTransport.new }
  let(:collection) { Mongo::Collection.new(transport, 'testdb', 'users') }

  before do
    collection.insert_many([
      { name: 'Alice', age: 25, status: 'active' },
      { name: 'Bob', age: 30, status: 'active' },
      { name: 'Charlie', age: 35, status: 'inactive' },
      { name: 'Diana', age: 28, status: 'active' },
      { name: 'Eve', age: 22, status: 'inactive' }
    ])
  end

  after do
    transport.close
  end

  describe 'Enumerable integration' do
    it 'includes Enumerable' do
      expect(described_class.ancestors).to include(Enumerable)
    end

    it 'supports each' do
      names = []
      collection.find.each { |doc| names << doc['name'] }
      expect(names.sort).to eq(%w[Alice Bob Charlie Diana Eve])
    end

    it 'supports map' do
      names = collection.find.map { |doc| doc['name'] }
      expect(names.sort).to eq(%w[Alice Bob Charlie Diana Eve])
    end

    it 'supports select' do
      active = collection.find.select { |doc| doc['status'] == 'active' }
      expect(active.length).to eq(3)
    end

    it 'supports reject' do
      inactive = collection.find.reject { |doc| doc['status'] == 'active' }
      expect(inactive.length).to eq(2)
    end

    it 'supports first' do
      doc = collection.find.sort(name: 1).first
      expect(doc['name']).to eq('Alice')
    end

    it 'supports take' do
      docs = collection.find.sort(age: 1).take(3)
      expect(docs.length).to eq(3)
    end

    it 'supports count/size/length' do
      cursor = collection.find(status: 'active')
      expect(cursor.count).to eq(3)
      expect(cursor.size).to eq(3)
      expect(cursor.length).to eq(3)
    end
  end

  describe '#to_a' do
    it 'converts to array' do
      docs = collection.find.to_a
      expect(docs).to be_an(Array)
      expect(docs.length).to eq(5)
    end

    it 'closes cursor after conversion' do
      cursor = collection.find
      cursor.to_a
      expect(cursor).to be_closed
    end
  end

  describe '#each with block' do
    it 'iterates with block' do
      count = 0
      cursor = collection.find
      cursor.each { |_doc| count += 1 }
      expect(count).to eq(5)
    end

    it 'returns self when block given' do
      cursor = collection.find
      result = cursor.each { |_doc| }
      expect(result).to be(cursor)
    end

    it 'returns Enumerator without block' do
      cursor = collection.find
      enum = cursor.each
      expect(enum).to be_an(Enumerator)
    end

    it 'supports early termination with false' do
      count = 0
      collection.find.each do |_doc|
        count += 1
        false if count == 2
      end
      # Note: The break happens after returning false
      expect(count).to eq(2)
    end
  end

  describe '#next' do
    it 'returns documents one at a time' do
      cursor = collection.find.sort(name: 1)
      expect(cursor.next['name']).to eq('Alice')
      expect(cursor.next['name']).to eq('Bob')
    end

    it 'returns nil when exhausted' do
      cursor = collection.find.limit(2)
      cursor.next
      cursor.next
      expect(cursor.next).to be_nil
    end

    it 'returns nil when closed' do
      cursor = collection.find
      cursor.close
      expect(cursor.next).to be_nil
    end
  end

  describe '#has_next?' do
    it 'returns true when documents remain' do
      cursor = collection.find.limit(2)
      expect(cursor).to have_next
    end

    it 'returns false when exhausted' do
      cursor = collection.find.limit(1)
      cursor.next
      expect(cursor).not_to have_next
    end

    it 'returns false when closed' do
      cursor = collection.find
      cursor.close
      expect(cursor).not_to have_next
    end
  end

  describe '#sort' do
    it 'sorts ascending' do
      docs = collection.find.sort(age: 1).to_a
      ages = docs.map { |d| d['age'] }
      expect(ages).to eq([22, 25, 28, 30, 35])
    end

    it 'sorts descending' do
      docs = collection.find.sort(age: -1).to_a
      ages = docs.map { |d| d['age'] }
      expect(ages).to eq([35, 30, 28, 25, 22])
    end

    it 'is chainable' do
      cursor = collection.find.sort(age: 1)
      expect(cursor).to be_a(described_class)
    end
  end

  describe '#limit' do
    it 'limits results' do
      docs = collection.find.limit(3).to_a
      expect(docs.length).to eq(3)
    end

    it 'raises for negative limit' do
      expect { collection.find.limit(-1) }.to raise_error(ArgumentError)
    end

    it 'is chainable' do
      cursor = collection.find.limit(5)
      expect(cursor).to be_a(described_class)
    end
  end

  describe '#skip' do
    it 'skips results' do
      all_docs = collection.find.sort(age: 1).to_a
      skipped = collection.find.sort(age: 1).skip(2).to_a

      expect(skipped.length).to eq(3)
      expect(skipped.first['age']).to eq(all_docs[2]['age'])
    end

    it 'raises for negative skip' do
      expect { collection.find.skip(-1) }.to raise_error(ArgumentError)
    end

    it 'is chainable' do
      cursor = collection.find.skip(5)
      expect(cursor).to be_a(described_class)
    end
  end

  describe '#project' do
    it 'includes specified fields' do
      docs = collection.find.project(name: 1).to_a
      expect(docs.first).to have_key('name')
      expect(docs.first).to have_key('_id')
      expect(docs.first).not_to have_key('age')
    end

    it 'excludes specified fields' do
      docs = collection.find.project(age: 0).to_a
      expect(docs.first).to have_key('name')
      expect(docs.first).not_to have_key('age')
    end

    it 'can exclude _id' do
      docs = collection.find.project(name: 1, _id: 0).to_a
      expect(docs.first).to have_key('name')
      expect(docs.first).not_to have_key('_id')
    end
  end

  describe '#clone' do
    it 'creates a new cursor with same options' do
      original = collection.find(status: 'active').sort(age: 1).limit(5)
      cloned = original.clone

      expect(cloned).not_to be(original)
      expect(cloned.to_a).to eq(original.to_a)
    end
  end

  describe '#rewind' do
    it 'rewinds the cursor' do
      cursor = collection.find.sort(name: 1)
      first_doc = cursor.next
      cursor.next
      cursor.rewind

      expect(cursor.next).to eq(first_doc)
    end

    it 'allows re-iteration' do
      cursor = collection.find
      first_pass = cursor.to_a.dup
      cursor.rewind
      second_pass = cursor.to_a

      expect(second_pass).to eq(first_pass)
    end
  end

  describe '#close' do
    it 'closes the cursor' do
      cursor = collection.find
      cursor.close
      expect(cursor).to be_closed
    end

    it 'clears the buffer' do
      cursor = collection.find
      cursor.to_a # Fetch data
      cursor.close
      expect(cursor.count).to eq(0)
    end
  end
end

RSpec.describe Mongo::AggregationCursor do
  let(:transport) { MongoDo::MockRpcTransport.new }
  let(:collection) { Mongo::Collection.new(transport, 'testdb', 'sales') }

  before do
    collection.insert_many([
      { product: 'A', category: 'Electronics', amount: 100 },
      { product: 'B', category: 'Electronics', amount: 200 },
      { product: 'C', category: 'Books', amount: 50 },
      { product: 'D', category: 'Books', amount: 75 }
    ])
  end

  after do
    transport.close
  end

  describe 'Enumerable integration' do
    it 'includes Enumerable' do
      expect(described_class.ancestors).to include(Enumerable)
    end

    it 'supports each' do
      results = []
      collection.aggregate([]).each { |doc| results << doc }
      expect(results.length).to eq(4)
    end

    it 'supports map' do
      products = collection.aggregate([]).map { |doc| doc['product'] }
      expect(products.sort).to eq(%w[A B C D])
    end
  end

  describe '#to_a' do
    it 'converts pipeline results to array' do
      results = collection.aggregate([
        { '$match' => { category: 'Electronics' } }
      ]).to_a

      expect(results.length).to eq(2)
    end
  end

  describe 'pipeline stages' do
    it 'executes $match' do
      results = collection.aggregate([
        { '$match' => { category: 'Books' } }
      ]).to_a

      expect(results.length).to eq(2)
      expect(results.all? { |r| r['category'] == 'Books' }).to be true
    end

    it 'executes $group with $sum' do
      results = collection.aggregate([
        { '$group' => { _id: '$category', total: { '$sum' => '$amount' } } }
      ]).to_a

      electronics = results.find { |r| r['_id'] == 'Electronics' }
      books = results.find { |r| r['_id'] == 'Books' }

      expect(electronics['total']).to eq(300)
      expect(books['total']).to eq(125)
    end

    it 'executes $group with $count' do
      results = collection.aggregate([
        { '$group' => { _id: '$category', count: { '$sum' => 1 } } }
      ]).to_a

      electronics = results.find { |r| r['_id'] == 'Electronics' }
      expect(electronics['count']).to eq(2)
    end

    it 'executes $sort' do
      results = collection.aggregate([
        { '$sort' => { amount: -1 } }
      ]).to_a

      amounts = results.map { |r| r['amount'] }
      expect(amounts).to eq([200, 100, 75, 50])
    end

    it 'executes $limit' do
      results = collection.aggregate([
        { '$sort' => { amount: -1 } },
        { '$limit' => 2 }
      ]).to_a

      expect(results.length).to eq(2)
    end

    it 'executes $skip' do
      results = collection.aggregate([
        { '$sort' => { amount: -1 } },
        { '$skip' => 2 }
      ]).to_a

      expect(results.length).to eq(2)
      expect(results.first['amount']).to eq(75)
    end

    it 'executes $project' do
      results = collection.aggregate([
        { '$project' => { product: 1, _id: 0 } }
      ]).to_a

      expect(results.first).to have_key('product')
      expect(results.first).not_to have_key('_id')
      expect(results.first).not_to have_key('category')
    end

    it 'executes $count' do
      results = collection.aggregate([
        { '$match' => { category: 'Electronics' } },
        { '$count' => 'total' }
      ]).to_a

      expect(results.first['total']).to eq(2)
    end

    it 'executes complex pipeline' do
      results = collection.aggregate([
        { '$match' => { amount: { '$gte' => 50 } } },
        { '$group' => { _id: '$category', total: { '$sum' => '$amount' } } },
        { '$sort' => { total: -1 } },
        { '$limit' => 1 }
      ]).to_a

      expect(results.length).to eq(1)
      expect(results.first['_id']).to eq('Electronics')
      expect(results.first['total']).to eq(300)
    end
  end
end
