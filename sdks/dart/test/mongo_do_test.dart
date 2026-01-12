import 'package:test/test.dart';
import 'package:mongo_do/mongo_do.dart';

void main() {
  group('MongoClient', () {
    late MongoClient client;

    setUp(() async {
      client = MongoClient('mock://localhost');
      await client.connect();
    });

    tearDown(() async {
      await client.close();
    });

    test('connects successfully', () {
      expect(client.isConnected, isTrue);
    });

    test('gets database', () {
      final db = client.db('test');
      expect(db.name, equals('test'));
    });

    test('uses default database from URI', () {
      final c = MongoClient('mock://localhost/mydb');
      c.setTransport(MockRpcTransport());
      final db = c.db();
      expect(db.name, equals('mydb'));
    });
  });

  group('MongoCollection', () {
    late MongoClient client;
    late MongoDatabase db;
    late MongoCollection users;

    setUp(() async {
      client = MongoClient('mock://localhost');
      await client.connect();
      db = client.db('test');
      users = db.collection('users');
    });

    tearDown(() async {
      await client.close();
    });

    test('insertOne adds document', () async {
      final result = await users.insertOne({
        'name': 'Alice',
        'email': 'alice@example.com',
      });

      expect(result.acknowledged, isTrue);
      expect(result.insertedId, isNotNull);
    });

    test('insertMany adds multiple documents', () async {
      final result = await users.insertMany([
        {'name': 'Bob', 'email': 'bob@example.com'},
        {'name': 'Charlie', 'email': 'charlie@example.com'},
      ]);

      expect(result.acknowledged, isTrue);
      expect(result.insertedCount, equals(2));
    });

    test('find returns documents', () async {
      await users.insertMany([
        {'name': 'Alice', 'age': 30},
        {'name': 'Bob', 'age': 25},
        {'name': 'Charlie', 'age': 35},
      ]);

      final cursor = users.find();
      final docs = await cursor.toList();

      expect(docs.length, equals(3));
    });

    test('find with filter returns matching documents', () async {
      await users.insertMany([
        {'name': 'Alice', 'age': 30},
        {'name': 'Bob', 'age': 25},
        {'name': 'Charlie', 'age': 35},
      ]);

      final cursor = users.find(where.gt('age', 28));
      final docs = await cursor.toList();

      expect(docs.length, equals(2));
      expect(docs.every((d) => (d['age'] as int) > 28), isTrue);
    });

    test('findOne returns single document', () async {
      await users.insertOne({'name': 'Alice', 'email': 'alice@example.com'});

      final doc = await users.findOne(where.eq('name', 'Alice'));

      expect(doc, isNotNull);
      expect(doc!['name'], equals('Alice'));
    });

    test('updateOne modifies document', () async {
      await users.insertOne({'name': 'Alice', 'age': 30});

      final result = await users.updateOne(
        where.eq('name', 'Alice'),
        modify.set('age', 31),
      );

      expect(result.acknowledged, isTrue);
      expect(result.matchedCount, equals(1));
      expect(result.modifiedCount, equals(1));

      final doc = await users.findOne(where.eq('name', 'Alice'));
      expect(doc!['age'], equals(31));
    });

    test('updateMany modifies multiple documents', () async {
      await users.insertMany([
        {'name': 'Alice', 'status': 'active'},
        {'name': 'Bob', 'status': 'active'},
        {'name': 'Charlie', 'status': 'inactive'},
      ]);

      final result = await users.updateMany(
        where.eq('status', 'active'),
        modify.set('verified', true),
      );

      expect(result.acknowledged, isTrue);
      expect(result.matchedCount, equals(2));
    });

    test('deleteOne removes document', () async {
      await users.insertOne({'name': 'Alice'});

      final result = await users.deleteOne(where.eq('name', 'Alice'));

      expect(result.acknowledged, isTrue);
      expect(result.deletedCount, equals(1));

      final doc = await users.findOne(where.eq('name', 'Alice'));
      expect(doc, isNull);
    });

    test('deleteMany removes multiple documents', () async {
      await users.insertMany([
        {'name': 'Alice', 'status': 'inactive'},
        {'name': 'Bob', 'status': 'inactive'},
        {'name': 'Charlie', 'status': 'active'},
      ]);

      final result = await users.deleteMany(where.eq('status', 'inactive'));

      expect(result.acknowledged, isTrue);
      expect(result.deletedCount, equals(2));
    });

    test('countDocuments returns count', () async {
      await users.insertMany([
        {'name': 'Alice'},
        {'name': 'Bob'},
        {'name': 'Charlie'},
      ]);

      final count = await users.countDocuments();
      expect(count, equals(3));
    });

    test('countDocuments with filter returns filtered count', () async {
      await users.insertMany([
        {'name': 'Alice', 'age': 30},
        {'name': 'Bob', 'age': 25},
        {'name': 'Charlie', 'age': 35},
      ]);

      final count = await users.countDocuments(where.gt('age', 28));
      expect(count, equals(2));
    });

    test('distinct returns unique values', () async {
      await users.insertMany([
        {'name': 'Alice', 'city': 'NYC'},
        {'name': 'Bob', 'city': 'LA'},
        {'name': 'Charlie', 'city': 'NYC'},
      ]);

      final cities = await users.distinct('city');
      expect(cities.length, equals(2));
      expect(cities, containsAll(['NYC', 'LA']));
    });

    test('findOneAndUpdate returns and updates document', () async {
      await users.insertOne({'name': 'Alice', 'age': 30});

      final doc = await users.findOneAndUpdate(
        where.eq('name', 'Alice'),
        modify.inc('age', 1),
        returnDocument: true,
      );

      expect(doc, isNotNull);
      expect(doc!['age'], equals(31));
    });

    test('findOneAndDelete returns and removes document', () async {
      await users.insertOne({'name': 'Alice', 'age': 30});

      final doc = await users.findOneAndDelete(where.eq('name', 'Alice'));

      expect(doc, isNotNull);
      expect(doc!['name'], equals('Alice'));

      final check = await users.findOne(where.eq('name', 'Alice'));
      expect(check, isNull);
    });

    test('aggregate runs pipeline', () async {
      await users.insertMany([
        {'name': 'Alice', 'age': 30},
        {'name': 'Bob', 'age': 25},
        {'name': 'Charlie', 'age': 35},
      ]);

      final results = await users.aggregate([
        {'\$match': {'age': {'\$gt': 28}}},
        {'\$count': 'total'},
      ]);

      expect(results.length, equals(1));
      expect(results.first['total'], equals(2));
    });
  });

  group('SelectorBuilder', () {
    test('eq creates equality filter', () {
      final selector = where.eq('name', 'Alice');
      expect(selector.map, equals({'name': 'Alice'}));
    });

    test('gt creates greater than filter', () {
      final selector = where.gt('age', 25);
      expect(selector.map, equals({'age': {'\$gt': 25}}));
    });

    test('inList creates in filter', () {
      final selector = where.inList('status', ['active', 'pending']);
      expect(selector.map, equals({'status': {'\$in': ['active', 'pending']}}));
    });

    test('regex creates regex filter', () {
      final selector = where.regex('email', r'@example\.com$');
      expect(selector.map['email']['\$regex'], equals(r'@example\.com$'));
    });

    test('and combines conditions', () {
      final selector = where.and([
        {'age': {'\$gt': 25}},
        {'status': 'active'},
      ]);
      expect(selector.map['\$and'], isNotNull);
      expect((selector.map['\$and'] as List).length, equals(2));
    });

    test('or combines conditions', () {
      final selector = where.or([
        {'status': 'active'},
        {'status': 'pending'},
      ]);
      expect(selector.map['\$or'], isNotNull);
    });

    test('chained operations', () {
      final selector = where
          .gt('age', 25)
          .lt('age', 65)
          .eq('status', 'active');

      expect(selector.map['age']['\$gt'], equals(25));
      expect(selector.map['age']['\$lt'], equals(65));
      expect(selector.map['status'], equals('active'));
    });
  });

  group('ModifierBuilder', () {
    test('set creates set modifier', () {
      final modifier = modify.set('name', 'Alice');
      expect(modifier.map, equals({'\$set': {'name': 'Alice'}}));
    });

    test('inc creates increment modifier', () {
      final modifier = modify.inc('count', 1);
      expect(modifier.map, equals({'\$inc': {'count': 1}}));
    });

    test('unset creates unset modifier', () {
      final modifier = modify.unset('oldField');
      expect(modifier.map, equals({'\$unset': {'oldField': ''}}));
    });

    test('push creates push modifier', () {
      final modifier = modify.push('tags', 'new');
      expect(modifier.map, equals({'\$push': {'tags': 'new'}}));
    });

    test('addToSet creates addToSet modifier', () {
      final modifier = modify.addToSet('tags', 'unique');
      expect(modifier.map, equals({'\$addToSet': {'tags': 'unique'}}));
    });

    test('chained operations', () {
      final modifier = modify
          .set('name', 'Alice')
          .inc('age', 1)
          .push('tags', 'updated');

      expect(modifier.map['\$set'], equals({'name': 'Alice'}));
      expect(modifier.map['\$inc'], equals({'age': 1}));
      expect(modifier.map['\$push'], equals({'tags': 'updated'}));
    });
  });

  group('MongoCursor', () {
    late MongoClient client;
    late MongoDatabase db;
    late MongoCollection users;

    setUp(() async {
      client = MongoClient('mock://localhost');
      await client.connect();
      db = client.db('test');
      users = db.collection('users');

      await users.insertMany([
        {'name': 'Alice', 'age': 30},
        {'name': 'Bob', 'age': 25},
        {'name': 'Charlie', 'age': 35},
        {'name': 'Diana', 'age': 28},
      ]);
    });

    tearDown(() async {
      await client.close();
    });

    test('limit restricts results', () async {
      final docs = await users.find().limit(2).toList();
      expect(docs.length, equals(2));
    });

    test('skip skips results', () async {
      final docs = await users.find().skip(2).toList();
      expect(docs.length, equals(2));
    });

    test('sort orders results', () async {
      final docs = await users.find().sort({'age': 1}).toList();
      expect(docs.first['name'], equals('Bob'));
      expect(docs.last['name'], equals('Charlie'));
    });

    test('chained operations', () async {
      final docs = await users
          .find()
          .sort({'age': -1})
          .skip(1)
          .limit(2)
          .toList();

      expect(docs.length, equals(2));
      expect(docs.first['name'], equals('Alice'));
    });

    test('can be used as Stream', () async {
      final names = <String>[];

      await for (final doc in users.find()) {
        names.add(doc['name'] as String);
      }

      expect(names.length, equals(4));
      expect(names, containsAll(['Alice', 'Bob', 'Charlie', 'Diana']));
    });

    test('first returns first document', () async {
      final doc = await users.find().sort({'age': 1}).first();
      expect(doc!['name'], equals('Bob'));
    });

    test('count returns document count', () async {
      final count = await users.find(where.gt('age', 27)).count();
      expect(count, equals(3));
    });
  });

  group('TypedCollection', () {
    late MongoClient client;
    late MongoDatabase db;
    late TypedCollection<User> users;

    setUp(() async {
      client = MongoClient('mock://localhost');
      await client.connect();
      db = client.db('test');
      users = db.typedCollection<User>(
        'users',
        User.fromJson,
        (user) => user.toJson(),
      );
    });

    tearDown(() async {
      await client.close();
    });

    test('insertOne with typed document', () async {
      final result = await users.insertOne(User(
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      ));

      expect(result.acknowledged, isTrue);
    });

    test('find returns typed documents', () async {
      await users.insertMany([
        User(name: 'Alice', email: 'alice@example.com', age: 30),
        User(name: 'Bob', email: 'bob@example.com', age: 25),
      ]);

      final results = await users.find();

      expect(results.length, equals(2));
      expect(results.first, isA<User>());
      expect(results.first.name, equals('Alice'));
    });

    test('findOne returns typed document', () async {
      await users.insertOne(User(
        name: 'Alice',
        email: 'alice@example.com',
        age: 30,
      ));

      final user = await users.findOne(where.eq('name', 'Alice'));

      expect(user, isNotNull);
      expect(user!.name, equals('Alice'));
      expect(user.email, equals('alice@example.com'));
    });
  });

  group('ObjectId', () {
    test('creates from string', () {
      final id = ObjectId('507f1f77bcf86cd799439011');
      expect(id.oid, equals('507f1f77bcf86cd799439011'));
    });

    test('serializes to JSON', () {
      final id = ObjectId('507f1f77bcf86cd799439011');
      expect(id.toJson(), equals({'\$oid': '507f1f77bcf86cd799439011'}));
    });

    test('deserializes from JSON', () {
      final id = ObjectId.fromJson({'\$oid': '507f1f77bcf86cd799439011'});
      expect(id.oid, equals('507f1f77bcf86cd799439011'));
    });

    test('equality works', () {
      final id1 = ObjectId('507f1f77bcf86cd799439011');
      final id2 = ObjectId('507f1f77bcf86cd799439011');
      final id3 = ObjectId('507f1f77bcf86cd799439012');

      expect(id1, equals(id2));
      expect(id1, isNot(equals(id3)));
    });
  });

  group('parseConnectionUri', () {
    test('parses simple URI', () {
      final result = parseConnectionUri('mongodb://localhost:27017');
      expect(result.protocol, equals('mongodb'));
      expect(result.host, equals('localhost'));
      expect(result.port, equals(27017));
    });

    test('parses URI with database', () {
      final result = parseConnectionUri('mongodb://localhost:27017/mydb');
      expect(result.database, equals('mydb'));
    });

    test('parses URI with credentials', () {
      final result = parseConnectionUri('mongodb://user:pass@localhost:27017/mydb');
      expect(result.username, equals('user'));
      expect(result.password, equals('pass'));
    });

    test('parses URI with query params', () {
      final result = parseConnectionUri('mongodb://localhost:27017/mydb?authSource=admin&ssl=true');
      expect(result.options['authSource'], equals('admin'));
      expect(result.options['ssl'], equals('true'));
    });

    test('parses HTTPS URI', () {
      final result = parseConnectionUri('https://mongo.example.com/mydb');
      expect(result.protocol, equals('https'));
      expect(result.host, equals('mongo.example.com'));
      expect(result.database, equals('mydb'));
    });
  });
}

/// Test user class
class User {
  final String? id;
  final String name;
  final String email;
  final int age;

  User({
    this.id,
    required this.name,
    required this.email,
    required this.age,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['_id']?.toString(),
      name: json['name'] as String,
      email: json['email'] as String,
      age: json['age'] as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (id != null) '_id': id,
      'name': name,
      'email': email,
      'age': age,
    };
  }
}
