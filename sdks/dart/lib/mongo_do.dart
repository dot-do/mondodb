/// MongoDB-compatible Dart client for mongo.do
///
/// Natural language first, AI-native database operations with promise pipelining.
///
/// ```dart
/// import 'package:mongo_do/mongo_do.dart';
///
/// // Natural language queries
/// final users = await mongo("users who haven't logged in this month");
/// final vips = await mongo("customers with orders over \$1000");
///
/// // MongoDB-compatible API
/// final client = await MongoClient.connect('https://your-worker.workers.dev');
/// final db = client.db('myapp');
/// final users = db.collection('users');
/// await users.insertOne({'name': 'Alice', 'email': 'alice@example.com'});
/// ```
library mongo_do;

export 'src/types.dart';
export 'src/client.dart';
export 'src/database.dart';
export 'src/collection.dart';
export 'src/cursor.dart';
export 'src/query.dart';
export 'src/selector.dart';
export 'src/exceptions.dart';
