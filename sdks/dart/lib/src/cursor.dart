/// MongoDB cursor for mongo.do
library;

import 'dart:async';
import 'types.dart';

/// A cursor for iterating over MongoDB query results
class MongoCursor<T extends Document> implements Stream<T> {
  final RpcTransport _transport;
  final String _dbName;
  final String _collectionName;
  final Map<String, dynamic> _filter;
  final Map<String, dynamic> _options;
  final T Function(Map<String, dynamic>)? _decoder;

  bool _executed = false;
  List<T>? _results;
  int _currentIndex = 0;

  MongoCursor(
    this._transport,
    this._dbName,
    this._collectionName,
    this._filter,
    this._options, {
    T Function(Map<String, dynamic>)? decoder,
  }) : _decoder = decoder;

  /// Create a copy of this cursor with modified options
  MongoCursor<T> _copyWith({
    Map<String, dynamic>? filter,
    Map<String, dynamic>? options,
  }) {
    return MongoCursor<T>(
      _transport,
      _dbName,
      _collectionName,
      filter ?? Map.from(_filter),
      {..._options, ...?options},
      decoder: _decoder,
    );
  }

  /// Set sort order
  MongoCursor<T> sort(Map<String, dynamic> sort) {
    return _copyWith(options: {'sort': sort});
  }

  /// Limit number of documents
  MongoCursor<T> limit(int limit) {
    return _copyWith(options: {'limit': limit});
  }

  /// Skip documents
  MongoCursor<T> skip(int skip) {
    return _copyWith(options: {'skip': skip});
  }

  /// Project fields
  MongoCursor<T> project(Map<String, dynamic> projection) {
    return _copyWith(options: {'projection': projection});
  }

  /// Add a hint
  MongoCursor<T> hint(String hint) {
    return _copyWith(options: {'hint': hint});
  }

  /// Set max time
  MongoCursor<T> maxTimeMS(int maxTimeMS) {
    return _copyWith(options: {'maxTimeMS': maxTimeMS});
  }

  /// Set batch size
  MongoCursor<T> batchSize(int batchSize) {
    return _copyWith(options: {'batchSize': batchSize});
  }

  /// Allow disk use
  MongoCursor<T> allowDiskUse(bool allowDiskUse) {
    return _copyWith(options: {'allowDiskUse': allowDiskUse});
  }

  /// Execute the query and return all documents as a list
  Future<List<T>> toList() async {
    if (!_executed) {
      await _execute();
    }
    return List.from(_results!);
  }

  /// Execute the query and return first document or null
  Future<T?> first() async {
    if (!_executed) {
      await _execute();
    }
    return _results!.isEmpty ? null : _results!.first;
  }

  /// Count matching documents
  Future<int> count() async {
    final result = await _transport.call('countDocuments', [
      _dbName,
      _collectionName,
      _filter,
      _options,
    ]);
    return result as int;
  }

  /// Check if any documents match
  Future<bool> hasNext() async {
    if (!_executed) {
      await _execute();
    }
    return _currentIndex < _results!.length;
  }

  /// Get next document
  Future<T?> next() async {
    if (!_executed) {
      await _execute();
    }
    if (_currentIndex < _results!.length) {
      return _results![_currentIndex++];
    }
    return null;
  }

  /// Apply a function to each document
  Future<void> forEach(void Function(T doc) fn) async {
    if (!_executed) {
      await _execute();
    }
    for (final doc in _results!) {
      fn(doc);
    }
  }

  /// Map documents to a new type
  Future<List<R>> map<R>(R Function(T doc) fn) async {
    if (!_executed) {
      await _execute();
    }
    return _results!.map(fn).toList();
  }

  /// Filter documents
  Future<List<T>> filter(bool Function(T doc) test) async {
    if (!_executed) {
      await _execute();
    }
    return _results!.where(test).toList();
  }

  /// Close the cursor
  Future<void> close() async {
    _results = null;
    _executed = false;
  }

  /// Execute the query
  Future<void> _execute() async {
    if (_executed) return;

    final result = await _transport.call('find', [
      _dbName,
      _collectionName,
      _filter,
      _options,
    ]);

    final rawResults = result as List<dynamic>;
    _results = rawResults.map((doc) {
      final docMap = doc as Map<String, dynamic>;
      if (_decoder != null) {
        return _decoder(docMap);
      }
      return docMap as T;
    }).toList();
    _executed = true;
    _currentIndex = 0;
  }

  // Stream implementation
  @override
  StreamSubscription<T> listen(
    void Function(T event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    final controller = StreamController<T>();

    _execute().then((_) {
      for (final doc in _results!) {
        if (!controller.isClosed) {
          controller.add(doc);
        }
      }
      if (!controller.isClosed) {
        controller.close();
      }
    }).catchError((Object error) {
      if (!controller.isClosed) {
        controller.addError(error);
        controller.close();
      }
    });

    return controller.stream.listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }

  @override
  Future<bool> any(bool Function(T element) test) async {
    if (!_executed) await _execute();
    return _results!.any(test);
  }

  @override
  Stream<T> asBroadcastStream({
    void Function(StreamSubscription<T> subscription)? onListen,
    void Function(StreamSubscription<T> subscription)? onCancel,
  }) {
    final controller = StreamController<T>.broadcast(onListen: (sub) {
      onListen?.call(sub);
    }, onCancel: () {
      // onCancel doesn't receive subscription in broadcast controller
    });

    _execute().then((_) {
      for (final doc in _results!) {
        controller.add(doc);
      }
      controller.close();
    }).catchError((Object error) {
      controller.addError(error);
      controller.close();
    });

    return controller.stream;
  }

  @override
  Stream<E> asyncExpand<E>(Stream<E>? Function(T event) convert) {
    return Stream.fromFuture(toList()).expand((list) => list).asyncExpand(convert);
  }

  @override
  Stream<E> asyncMap<E>(FutureOr<E> Function(T event) convert) {
    return Stream.fromFuture(toList()).expand((list) => list).asyncMap(convert);
  }

  @override
  Stream<R> cast<R>() {
    return Stream.fromFuture(toList()).expand((list) => list).cast<R>();
  }

  @override
  Future<bool> contains(Object? needle) async {
    if (!_executed) await _execute();
    return _results!.contains(needle);
  }

  @override
  Stream<T> distinct([bool Function(T previous, T next)? equals]) {
    return Stream.fromFuture(toList()).expand((list) => list).distinct(equals);
  }

  @override
  Future<E> drain<E>([E? futureValue]) async {
    if (!_executed) await _execute();
    return futureValue as E;
  }

  @override
  Future<T> elementAt(int index) async {
    if (!_executed) await _execute();
    return _results![index];
  }

  @override
  Future<bool> every(bool Function(T element) test) async {
    if (!_executed) await _execute();
    return _results!.every(test);
  }

  @override
  Stream<S> expand<S>(Iterable<S> Function(T element) convert) {
    return Stream.fromFuture(toList()).expand((list) => list).expand(convert);
  }

  @override
  Future<T> get firstFuture async {
    if (!_executed) await _execute();
    return _results!.first;
  }

  @override
  Future<T> firstWhere(bool Function(T element) test, {T Function()? orElse}) async {
    if (!_executed) await _execute();
    return _results!.firstWhere(test, orElse: orElse);
  }

  @override
  Future<S> fold<S>(S initialValue, S Function(S previous, T element) combine) async {
    if (!_executed) await _execute();
    return _results!.fold(initialValue, combine);
  }

  @override
  Stream<T> handleError(Function onError, {bool Function(dynamic error)? test}) {
    return Stream.fromFuture(toList()).expand((list) => list).handleError(onError, test: test);
  }

  @override
  Future<bool> get isEmpty async {
    if (!_executed) await _execute();
    return _results!.isEmpty;
  }

  @override
  Future<bool> get isBroadcast => Future.value(false);

  @override
  Future<String> join([String separator = '']) async {
    if (!_executed) await _execute();
    return _results!.join(separator);
  }

  @override
  Future<T> get last async {
    if (!_executed) await _execute();
    return _results!.last;
  }

  @override
  Future<T> lastWhere(bool Function(T element) test, {T Function()? orElse}) async {
    if (!_executed) await _execute();
    return _results!.lastWhere(test, orElse: orElse);
  }

  @override
  Future<int> get length async {
    if (!_executed) await _execute();
    return _results!.length;
  }

  @override
  Stream<S> map2<S>(S Function(T event) convert) {
    return Stream.fromFuture(toList()).expand((list) => list).map(convert);
  }

  @override
  Future pipe(StreamConsumer<T> streamConsumer) {
    return Stream.fromFuture(toList()).expand((list) => list).pipe(streamConsumer);
  }

  @override
  Future<T> reduce(T Function(T previous, T element) combine) async {
    if (!_executed) await _execute();
    return _results!.reduce(combine);
  }

  @override
  Future<T> get single async {
    if (!_executed) await _execute();
    return _results!.single;
  }

  @override
  Future<T> singleWhere(bool Function(T element) test, {T Function()? orElse}) async {
    if (!_executed) await _execute();
    return _results!.singleWhere(test, orElse: orElse);
  }

  @override
  Stream<T> skip(int count) {
    return Stream.fromFuture(toList()).expand((list) => list).skip(count);
  }

  @override
  Stream<T> skipWhile(bool Function(T element) test) {
    return Stream.fromFuture(toList()).expand((list) => list).skipWhile(test);
  }

  @override
  Stream<T> take(int count) {
    return Stream.fromFuture(toList()).expand((list) => list).take(count);
  }

  @override
  Stream<T> takeWhile(bool Function(T element) test) {
    return Stream.fromFuture(toList()).expand((list) => list).takeWhile(test);
  }

  @override
  Stream<T> timeout(Duration timeLimit, {void Function(EventSink<T> sink)? onTimeout}) {
    return Stream.fromFuture(toList()).expand((list) => list).timeout(timeLimit, onTimeout: onTimeout);
  }

  @override
  Future<Set<T>> toSet() async {
    if (!_executed) await _execute();
    return _results!.toSet();
  }

  @override
  Stream<S> transform<S>(StreamTransformer<T, S> streamTransformer) {
    return Stream.fromFuture(toList()).expand((list) => list).transform(streamTransformer);
  }

  @override
  Stream<T> where(bool Function(T event) test) {
    return Stream.fromFuture(toList()).expand((list) => list).where(test);
  }
}

// Extension to add renamed method to avoid conflict with Stream.map
extension MongoCursorExtension<T extends Document> on MongoCursor<T> {
  Stream<S> map2<S>(S Function(T event) convert) {
    return Stream.fromFuture(toList()).expand((list) => list).map(convert);
  }

  Future<T> get firstFuture async {
    final doc = await first();
    if (doc == null) {
      throw StateError('No element');
    }
    return doc;
  }
}
