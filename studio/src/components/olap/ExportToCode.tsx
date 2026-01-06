/**
 * ExportToCode Component
 *
 * Converts MongoDB aggregation pipelines to driver code in various languages.
 * Supports Node.js, Python, Java, C#, Go, Ruby, PHP, and MongoDB Shell.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { css } from '@leafygreen-ui/emotion'
import { palette } from '@leafygreen-ui/palette'
import { H3, Body } from '@leafygreen-ui/typography'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import type { AggregationStage, MatchStage, GroupStage, SortStage, LimitStage, SkipStage, ProjectStage, LookupStage, UnwindStage, AddFieldsStage, CountStage } from '@components/stage-editor/types'

export interface ExportToCodeProps {
  open: boolean
  onClose: () => void
  database: string
  collection: string
  pipeline: AggregationStage[]
}

type Language = 'nodejs' | 'python' | 'java' | 'csharp' | 'go' | 'php' | 'ruby' | 'shell'

interface LanguageOption {
  id: Language
  label: string
  extension: string
}

const LANGUAGES: LanguageOption[] = [
  { id: 'nodejs', label: 'Node.js', extension: '.js' },
  { id: 'python', label: 'Python', extension: '.py' },
  { id: 'java', label: 'Java', extension: '.java' },
  { id: 'csharp', label: 'C#', extension: '.cs' },
  { id: 'go', label: 'Go', extension: '.go' },
  { id: 'php', label: 'PHP', extension: '.php' },
  { id: 'ruby', label: 'Ruby', extension: '.rb' },
  { id: 'shell', label: 'MongoDB Shell', extension: '.js' },
]

// Styles
const backdropStyles = css`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
`

const dialogStyles = css`
  background: ${palette.white};
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
`

const headerStyles = css`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid ${palette.gray.light2};
`

const headerLeftStyles = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const contextStyles = css`
  font-size: 13px;
  color: ${palette.gray.dark1};
`

const contentStyles = css`
  flex: 1;
  display: flex;
  padding: 24px;
  gap: 24px;
  overflow: hidden;
`

const sidebarStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 200px;
`

const languageSelectorStyles = css`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const languageOptionStyles = css`
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
  border: none;
  background: transparent;
  text-align: left;
  width: 100%;

  &:hover {
    background: ${palette.gray.light3};
  }

  &:focus {
    outline: 2px solid ${palette.blue.base};
    outline-offset: -2px;
  }
`

const languageOptionSelectedStyles = css`
  background: ${palette.green.light3};
  color: ${palette.green.dark2};
  font-weight: 600;

  &:hover {
    background: ${palette.green.light3};
  }
`

const optionsContainerStyles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid ${palette.gray.light2};
`

const optionLabelStyles = css`
  font-size: 12px;
  font-weight: 600;
  color: ${palette.gray.dark2};
  margin-bottom: 4px;
`

const optionRowStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const toggleButtonStyles = css`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid ${palette.gray.light2};
  background: ${palette.white};
  cursor: pointer;
  font-size: 12px;
  color: ${palette.gray.dark1};

  &:hover {
    background: ${palette.gray.light3};
  }
`

const toggleButtonActiveStyles = css`
  background: ${palette.green.light3};
  border-color: ${palette.green.dark1};
  color: ${palette.green.dark2};
`

const mainContentStyles = css`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
`

const codeContainerStyles = css`
  flex: 1;
  display: flex;
  border: 1px solid ${palette.gray.light2};
  border-radius: 6px;
  background: ${palette.gray.dark4};
  overflow: hidden;
`

const lineNumbersStyles = css`
  padding: 12px 8px;
  background: ${palette.gray.dark3};
  color: ${palette.gray.light1};
  font-family: 'Source Code Pro', monospace;
  font-size: 12px;
  line-height: 1.6;
  text-align: right;
  user-select: none;
  min-width: 40px;
`

const codeOutputStyles = css`
  flex: 1;
  padding: 12px;
  color: ${palette.gray.light1};
  font-family: 'Source Code Pro', monospace;
  font-size: 12px;
  line-height: 1.6;
  overflow: auto;
  white-space: pre;
  margin: 0;
`

const emptyStateStyles = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: ${palette.gray.dark1};
  text-align: center;
  gap: 8px;
`

const actionsContainerStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
`

const footerStyles = css`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 16px 24px;
  border-top: 1px solid ${palette.gray.light2};
  gap: 12px;
`

const statusMessageStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${palette.green.dark2};
`

const errorMessageStyles = css`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: ${palette.red.dark2};
  background: ${palette.red.light3};
  padding: 6px 10px;
  border-radius: 4px;
`

const warningStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.yellow.light3};
  border-radius: 4px;
  font-size: 12px;
  color: ${palette.yellow.dark2};
`

const errorBannerStyles = css`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: ${palette.red.light3};
  border-radius: 4px;
  font-size: 12px;
  color: ${palette.red.dark2};
`

// Syntax highlighting styles
const syntaxKeywordStyles = css`
  color: ${palette.purple.base};
`

const syntaxStringStyles = css`
  color: ${palette.green.base};
`

const syntaxNumberStyles = css`
  color: ${palette.blue.light1};
`

const syntaxOperatorStyles = css`
  color: ${palette.yellow.dark2};
`

const syntaxCommentStyles = css`
  color: ${palette.gray.base};
  font-style: italic;
`

// Stage conversion functions
function convertStageToObject(stage: AggregationStage): Record<string, unknown> | null {
  switch (stage.type) {
    case '$match': {
      const matchStage = stage as MatchStage
      if (matchStage.useRawJson && matchStage.rawJson) {
        try {
          return { $match: JSON.parse(matchStage.rawJson) }
        } catch {
          return null
        }
      }
      const conditions = matchStage.conditions.map(cond => {
        if (cond.operator === '$eq') {
          return { [cond.field]: cond.value }
        }
        return { [cond.field]: { [cond.operator]: cond.value } }
      })
      if (matchStage.logicalOperator === '$or' && conditions.length > 1) {
        return { $match: { $or: conditions } }
      }
      return { $match: Object.assign({}, ...conditions) }
    }

    case '$group': {
      const groupStage = stage as GroupStage
      if (groupStage.useRawJson && groupStage.rawJson) {
        try {
          return { $group: JSON.parse(groupStage.rawJson) }
        } catch {
          return null
        }
      }
      const groupObj: Record<string, unknown> = {
        _id: groupStage.groupByField ? `$${groupStage.groupByField}` : null
      }
      for (const acc of groupStage.accumulators) {
        if (acc.useConstant) {
          groupObj[acc.outputField] = { [acc.operator]: acc.constantValue }
        } else {
          groupObj[acc.outputField] = { [acc.operator]: `$${acc.inputField}` }
        }
      }
      return { $group: groupObj }
    }

    case '$sort': {
      const sortStage = stage as SortStage
      const sortObj: Record<string, number> = {}
      for (const field of sortStage.fields) {
        sortObj[field.field] = field.direction
      }
      return { $sort: sortObj }
    }

    case '$limit': {
      const limitStage = stage as LimitStage
      return { $limit: limitStage.limit }
    }

    case '$skip': {
      const skipStage = stage as SkipStage
      return { $skip: skipStage.skip }
    }

    case '$project': {
      const projectStage = stage as ProjectStage
      if (projectStage.useRawJson && projectStage.rawJson) {
        try {
          return { $project: JSON.parse(projectStage.rawJson) }
        } catch {
          return null
        }
      }
      const projectObj: Record<string, number> = {}
      if (projectStage.excludeId) {
        projectObj._id = 0
      }
      for (const field of projectStage.fields) {
        projectObj[field.field] = field.include ? 1 : 0
      }
      return { $project: projectObj }
    }

    case '$lookup': {
      const lookupStage = stage as LookupStage
      const lookupObj: Record<string, unknown> = {
        from: lookupStage.config.from,
        localField: lookupStage.config.localField,
        foreignField: lookupStage.config.foreignField,
        as: lookupStage.config.as
      }
      if (lookupStage.usePipeline && lookupStage.pipelineJson) {
        try {
          lookupObj.pipeline = JSON.parse(lookupStage.pipelineJson)
        } catch {
          // Invalid pipeline JSON
        }
      }
      if (lookupStage.letVariables) {
        try {
          lookupObj.let = JSON.parse(lookupStage.letVariables)
        } catch {
          // Invalid let JSON
        }
      }
      return { $lookup: lookupObj }
    }

    case '$unwind': {
      const unwindStage = stage as UnwindStage
      if (unwindStage.config.preserveNullAndEmptyArrays || unwindStage.config.includeArrayIndex) {
        const unwindObj: Record<string, unknown> = {
          path: unwindStage.config.path
        }
        if (unwindStage.config.preserveNullAndEmptyArrays) {
          unwindObj.preserveNullAndEmptyArrays = true
        }
        if (unwindStage.config.includeArrayIndex) {
          unwindObj.includeArrayIndex = unwindStage.config.includeArrayIndex
        }
        return { $unwind: unwindObj }
      }
      return { $unwind: unwindStage.config.path }
    }

    case '$addFields': {
      const addFieldsStage = stage as AddFieldsStage
      if (addFieldsStage.useRawJson && addFieldsStage.rawJson) {
        try {
          return { $addFields: JSON.parse(addFieldsStage.rawJson) }
        } catch {
          return null
        }
      }
      const addFieldsObj: Record<string, unknown> = {}
      for (const field of addFieldsStage.fields) {
        try {
          addFieldsObj[field.field] = JSON.parse(field.expression)
        } catch {
          addFieldsObj[field.field] = field.expression
        }
      }
      return { $addFields: addFieldsObj }
    }

    case '$count': {
      const countStage = stage as CountStage
      return { $count: countStage.outputField }
    }

    default:
      return null
  }
}

function convertPipelineToArray(
  pipeline: AggregationStage[],
  includeDisabled: boolean
): { stages: Record<string, unknown>[], errors: string[], warnings: string[] } {
  const stages: Record<string, unknown>[] = []
  const errors: string[] = []
  const warnings: string[] = []

  for (const stage of pipeline) {
    if (!stage.enabled && !includeDisabled) continue

    // Validate incomplete stages
    if (stage.type === '$lookup') {
      const lookupStage = stage as LookupStage
      if (!lookupStage.config.from && !lookupStage.config.localField && !lookupStage.config.foreignField && !lookupStage.config.as) {
        warnings.push(`$lookup stage is incomplete`)
      }
    }

    const converted = convertStageToObject(stage)
    if (converted === null) {
      errors.push(`Failed to convert ${stage.type} stage`)
    } else {
      stages.push(converted)
    }
  }

  return { stages, errors, warnings }
}

// Code generation functions
function generateNodeJsCode(
  database: string,
  collection: string,
  pipelineStages: Record<string, unknown>[],
  pipelineOnly: boolean,
  useAsync: boolean
): string {
  const pipelineStr = JSON.stringify(pipelineStages, null, 2)
    .split('\n')
    .map((line, i) => i === 0 ? line : '  ' + line)
    .join('\n')

  if (pipelineOnly) {
    return `const pipeline = ${pipelineStr};`
  }

  if (useAsync) {
    return `const MongoClient = require('mongodb').MongoClient;

// Connection URI
const uri = 'mongodb://localhost:27017';

// Aggregation pipeline
const pipeline = ${pipelineStr};

async function runAggregation() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('${database}');
    const collection = db.collection('${collection}');

    const results = await collection.aggregate(pipeline).toArray();
    console.log(results);
    return results;
  } finally {
    await client.close();
  }
}

runAggregation();`
  }

  return `const MongoClient = require('mongodb').MongoClient;

// Connection URI
const uri = 'mongodb://localhost:27017';

// Aggregation pipeline
const pipeline = ${pipelineStr};

MongoClient.connect(uri, function(err, client) {
  if (err) throw err;

  const db = client.db('${database}');
  const collection = db.collection('${collection}');

  collection.aggregate(pipeline).toArray(function(err, results) {
    if (err) throw err;
    console.log(results);
    client.close();
  });
});`
}

function generatePythonCode(
  database: string,
  collection: string,
  pipelineStages: Record<string, unknown>[],
  pipelineOnly: boolean
): string {
  const pipelineStr = JSON.stringify(pipelineStages, null, 2)
    .split('\n')
    .map((line, i) => i === 0 ? line : '    ' + line)
    .join('\n')

  if (pipelineOnly) {
    return `pipeline = ${pipelineStr}`
  }

  return `from pymongo import MongoClient

# Connection URI
uri = 'mongodb://localhost:27017'

# Aggregation pipeline
pipeline = ${pipelineStr}

# Connect and run aggregation
client = MongoClient(uri)
db = client['${database}']
collection = db['${collection}']

results = collection.aggregate(pipeline)
for doc in results:
    print(doc)

client.close()`
}

function generateJavaCode(
  database: string,
  collection: string,
  pipelineStages: Record<string, unknown>[],
  pipelineOnly: boolean
): string {
  // Convert a value to Java Document representation
  function valueToJava(obj: unknown, indent: number = 0): string {
    if (obj === null) return 'null'
    if (typeof obj === 'number') return String(obj)
    if (typeof obj === 'string') return `"${obj}"`
    if (typeof obj === 'boolean') return String(obj)

    if (Array.isArray(obj)) {
      if (obj.length === 0) return 'Arrays.asList()'
      const indentStr = '    '.repeat(indent)
      const nextIndent = '    '.repeat(indent + 1)
      const items = obj.map(item => valueToJava(item, indent + 1))
      return `Arrays.asList(\n${nextIndent}${items.join(',\n' + nextIndent)}\n${indentStr})`
    }

    if (typeof obj === 'object') {
      return objectToDocument(obj as Record<string, unknown>, indent)
    }

    return String(obj)
  }

  // Convert an object to Document using append pattern
  function objectToDocument(obj: Record<string, unknown>, indent: number = 0): string {
    const entries = Object.entries(obj)
    if (entries.length === 0) return 'new Document()'

    // Always use append pattern for idiomatic Java code
    const parts: string[] = []
    for (const [key, value] of entries) {
      parts.push(`.append("${key}", ${valueToJava(value, indent)})`)
    }
    return `new Document()${parts.join('')}`
  }

  const stagesJava = pipelineStages.map(stage => objectToDocument(stage, 2)).join(',\n        ')

  if (pipelineOnly) {
    return `List<Document> pipeline = Arrays.asList(
        ${stagesJava}
);`
  }

  return `import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoDatabase;
import org.bson.Document;
import java.util.Arrays;
import java.util.List;

public class AggregationExample {
    public static void main(String[] args) {
        // Connection URI
        String uri = "mongodb://localhost:27017";

        try (MongoClient client = MongoClients.create(uri)) {
            MongoDatabase database = client.getDatabase("${database}");
            MongoCollection<Document> collection = database.getCollection("${collection}");

            // Aggregation pipeline
            List<Document> pipeline = Arrays.asList(
                ${stagesJava}
            );

            // Run aggregation
            collection.aggregate(pipeline).forEach(doc -> System.out.println(doc.toJson()));
        }
    }
}`
}

function generateCSharpCode(
  database: string,
  collection: string,
  pipelineStages: Record<string, unknown>[],
  pipelineOnly: boolean
): string {
  const pipelineStr = JSON.stringify(pipelineStages, null, 2)
  const bsonStages = pipelineStages.map(() => 'BsonDocument.Parse(@"...")').join(',\n            ')

  if (pipelineOnly) {
    return `var pipeline = new BsonDocument[]
{
${pipelineStages.map(s => `    BsonDocument.Parse(@"${JSON.stringify(s).replace(/"/g, '""')}")`).join(',\n')}
};`
  }

  return `using MongoDB.Driver;
using MongoDB.Bson;
using System;

class Program
{
    static void Main(string[] args)
    {
        // Connection URI
        var uri = "mongodb://localhost:27017";
        var client = new MongoClient(uri);
        var database = client.GetDatabase("${database}");
        var collection = database.GetCollection<BsonDocument>("${collection}");

        // Aggregation pipeline
        var pipeline = new BsonDocument[]
        {
${pipelineStages.map(s => `            BsonDocument.Parse(@"${JSON.stringify(s).replace(/"/g, '""')}")`).join(',\n')}
        };

        // Run aggregation
        var results = collection.Aggregate<BsonDocument>(pipeline).ToList();
        foreach (var doc in results)
        {
            Console.WriteLine(doc);
        }
    }
}`
}

function generateGoCode(
  database: string,
  collection: string,
  pipelineStages: Record<string, unknown>[],
  pipelineOnly: boolean
): string {
  function jsonToGoBson(obj: unknown, indent: number = 0): string {
    const indentStr = '\t'.repeat(indent)
    const nextIndent = '\t'.repeat(indent + 1)

    if (obj === null) return 'nil'
    if (typeof obj === 'number') return String(obj)
    if (typeof obj === 'string') return `"${obj}"`
    if (typeof obj === 'boolean') return String(obj)

    if (Array.isArray(obj)) {
      if (obj.length === 0) return 'bson.A{}'
      const items = obj.map(item => jsonToGoBson(item, indent + 1))
      return `bson.A{\n${nextIndent}${items.join(',\n' + nextIndent)},\n${indentStr}}`
    }

    if (typeof obj === 'object') {
      const entries = Object.entries(obj as Record<string, unknown>)
      if (entries.length === 0) return 'bson.D{}'
      const items = entries.map(([k, v]) => `{"${k}", ${jsonToGoBson(v, indent + 1)}}`)
      return `bson.D{\n${nextIndent}${items.join(',\n' + nextIndent)},\n${indentStr}}`
    }

    return String(obj)
  }

  const stagesGo = pipelineStages.map(stage => jsonToGoBson(stage, 2)).join(',\n\t\t')

  if (pipelineOnly) {
    return `pipeline := mongo.Pipeline{
\t\t${stagesGo},
}`
  }

  return `package main

import (
\t"context"
\t"fmt"
\t"log"
\t"go.mongodb.org/mongo-driver/bson"
\t"go.mongodb.org/mongo-driver/mongo"
\t"go.mongodb.org/mongo-driver/mongo/options"
)

func main() {
\t// Connection URI
\turi := "mongodb://localhost:27017"
\tclient, err := mongo.Connect(context.TODO(), options.Client().ApplyURI(uri))
\tif err != nil {
\t\tlog.Fatal(err)
\t}
\tdefer client.Disconnect(context.TODO())

\tcollection := client.Database("${database}").Collection("${collection}")

\t// Aggregation pipeline
\tpipeline := mongo.Pipeline{
\t\t${stagesGo},
\t}

\t// Run aggregation
\tcursor, err := collection.Aggregate(context.TODO(), pipeline)
\tif err != nil {
\t\tlog.Fatal(err)
\t}
\tdefer cursor.Close(context.TODO())

\tvar results []bson.M
\tif err = cursor.All(context.TODO(), &results); err != nil {
\t\tlog.Fatal(err)
\t}
\tfor _, result := range results {
\t\tfmt.Println(result)
\t}
}`
}

function generatePhpCode(
  database: string,
  collection: string,
  pipelineStages: Record<string, unknown>[],
  pipelineOnly: boolean
): string {
  const pipelineStr = JSON.stringify(pipelineStages, null, 4)
    .replace(/\{/g, '[')
    .replace(/\}/g, ']')
    .replace(/:/g, ' =>')

  if (pipelineOnly) {
    return `$pipeline = ${pipelineStr};`
  }

  return `<?php
require 'vendor/autoload.php';

// Connection URI
$uri = 'mongodb://localhost:27017';
$client = new MongoDB\\Client($uri);

$collection = $client->selectDatabase('${database}')->selectCollection('${collection}');

// Aggregation pipeline
$pipeline = ${pipelineStr};

// Run aggregation
$results = $collection->aggregate($pipeline);

foreach ($results as $doc) {
    var_dump($doc);
}
?>`
}

function generateRubyCode(
  database: string,
  collection: string,
  pipelineStages: Record<string, unknown>[],
  pipelineOnly: boolean
): string {
  const pipelineStr = JSON.stringify(pipelineStages, null, 2)
    .replace(/:/g, ' =>')
    .replace(/\bnull\b/g, 'nil')

  if (pipelineOnly) {
    return `pipeline = ${pipelineStr}`
  }

  return `require 'mongo'

# Connection URI
uri = 'mongodb://localhost:27017'
client = Mongo::Client.new(uri, database: '${database}')

collection = client[:${collection}]

# Aggregation pipeline
pipeline = ${pipelineStr}

# Run aggregation
results = collection.aggregate(pipeline)

results.each do |doc|
  puts doc
end

client.close`
}

function generateShellCode(
  collection: string,
  pipelineStages: Record<string, unknown>[]
): string {
  const pipelineStr = JSON.stringify(pipelineStages, null, 2)
  return `db.${collection}.aggregate(${pipelineStr})`
}

// Syntax highlighting
function highlightSyntax(code: string, language: Language): JSX.Element[] {
  const lines = code.split('\n')
  const elements: JSX.Element[] = []

  const mongoOps = /(\$match|\$group|\$sort|\$limit|\$skip|\$project|\$lookup|\$unwind|\$addFields|\$count|\$sum|\$avg|\$min|\$max|\$first|\$last|\$push|\$addToSet|\$eq|\$ne|\$gt|\$gte|\$lt|\$lte|\$in|\$nin|\$and|\$or|\$concat)/g
  const keywords = language === 'python'
    ? /\b(from|import|def|class|return|if|else|for|while|with|as|try|except|finally)\b/g
    : language === 'java'
    ? /\b(import|public|private|class|void|new|try|catch|finally|return|static|final)\b/g
    : language === 'csharp'
    ? /\b(using|class|static|void|var|new|foreach|return)\b/g
    : language === 'go'
    ? /\b(package|import|func|var|defer|if|err|for|range|return)\b/g
    : language === 'ruby'
    ? /\b(require|def|class|end|do|each|puts)\b/g
    : language === 'php'
    ? /\b(require|function|foreach|as|echo|var_dump)\b/g
    : /\b(const|let|var|function|async|await|try|catch|finally|return|if|else|for|while)\b/g
  const strings = /("[^"]*"|'[^']*')/g
  const numbers = /\b(\d+)\b/g
  const comments = language === 'python' || language === 'ruby'
    ? /(#.*)$/gm
    : /\/\/.*/g

  lines.forEach((line, lineIndex) => {
    const lineElements: (string | JSX.Element)[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    interface Match {
      index: number
      length: number
      text: string
      type: 'comment' | 'string' | 'operator' | 'keyword' | 'number'
    }
    const matches: Match[] = []

    // Find comments first (highest priority)
    const commentRegex = language === 'python' || language === 'ruby'
      ? /#.*/g
      : /\/\/.*/g
    while ((match = commentRegex.exec(line)) !== null) {
      matches.push({ index: match.index, length: match[0].length, text: match[0], type: 'comment' })
    }

    // Find strings first, then look for operators inside them
    const stringMatches: Array<{index: number, length: number, text: string}> = []
    while ((match = strings.exec(line)) !== null) {
      stringMatches.push({ index: match.index, length: match[0].length, text: match[0] })
    }
    strings.lastIndex = 0

    // For each string, check if it contains MongoDB operators and split accordingly
    for (const strMatch of stringMatches) {
      const strContent = strMatch.text
      const operatorInString = mongoOps.exec(strContent)
      mongoOps.lastIndex = 0

      if (operatorInString) {
        // String contains an operator - split into quote, operator, rest
        const opIndex = operatorInString.index
        const opText = operatorInString[0]

        // Before the operator (including opening quote)
        if (opIndex > 0) {
          matches.push({
            index: strMatch.index,
            length: opIndex,
            text: strContent.substring(0, opIndex),
            type: 'string'
          })
        }

        // The operator itself
        matches.push({
          index: strMatch.index + opIndex,
          length: opText.length,
          text: opText,
          type: 'operator'
        })

        // After the operator (including closing quote)
        const afterOp = opIndex + opText.length
        if (afterOp < strContent.length) {
          matches.push({
            index: strMatch.index + afterOp,
            length: strContent.length - afterOp,
            text: strContent.substring(afterOp),
            type: 'string'
          })
        }
      } else {
        // No operator in string, add as normal string
        matches.push({ index: strMatch.index, length: strMatch.length, text: strMatch.text, type: 'string' })
      }
    }

    // Find MongoDB operators NOT in strings
    while ((match = mongoOps.exec(line)) !== null) {
      // Check if this operator is inside any string we already processed
      const isInString = stringMatches.some(sm =>
        match!.index >= sm.index && match!.index < sm.index + sm.length
      )
      if (!isInString) {
        matches.push({ index: match.index, length: match[0].length, text: match[0], type: 'operator' })
      }
    }
    mongoOps.lastIndex = 0

    // Find keywords
    while ((match = keywords.exec(line)) !== null) {
      matches.push({ index: match.index, length: match[0].length, text: match[0], type: 'keyword' })
    }
    keywords.lastIndex = 0

    // Find numbers
    while ((match = numbers.exec(line)) !== null) {
      matches.push({ index: match.index, length: match[0].length, text: match[0], type: 'number' })
    }
    numbers.lastIndex = 0

    // Sort matches by index and remove overlaps
    matches.sort((a, b) => a.index - b.index)
    const nonOverlapping: Match[] = []
    for (const m of matches) {
      const last = nonOverlapping[nonOverlapping.length - 1]
      if (!last || m.index >= last.index + last.length) {
        nonOverlapping.push(m)
      }
    }

    // Build line elements
    for (const m of nonOverlapping) {
      if (m.index > lastIndex) {
        lineElements.push(line.substring(lastIndex, m.index))
      }
      const className = m.type === 'keyword' ? syntaxKeywordStyles
        : m.type === 'string' ? syntaxStringStyles
        : m.type === 'number' ? syntaxNumberStyles
        : m.type === 'operator' ? syntaxOperatorStyles
        : syntaxCommentStyles
      const testId = m.type === 'keyword' ? 'syntax-keyword'
        : m.type === 'string' ? 'syntax-string'
        : m.type === 'number' ? 'syntax-number'
        : m.type === 'operator' ? 'syntax-operator'
        : 'syntax-comment'
      lineElements.push(
        <span key={`${lineIndex}-${m.index}`} className={className} data-testid={testId}>
          {m.text}
        </span>
      )
      lastIndex = m.index + m.length
    }

    if (lastIndex < line.length) {
      lineElements.push(line.substring(lastIndex))
    }

    elements.push(
      <div key={lineIndex}>
        {lineElements.length > 0 ? lineElements : '\u00A0'}
      </div>
    )
  })

  return elements
}

export function ExportToCode({
  open,
  onClose,
  database,
  collection,
  pipeline,
}: ExportToCodeProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('nodejs')
  const [showLineNumbers, setShowLineNumbers] = useState(true)
  const [includeDisabled, setIncludeDisabled] = useState(false)
  const [pipelineOnly, setPipelineOnly] = useState(false)
  const [useAsync, setUseAsync] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const dialogRef = useRef<HTMLDivElement>(null)
  const firstFocusableRef = useRef<HTMLButtonElement>(null)

  // Filter enabled stages and convert
  const { stages, errors, warnings } = useMemo(() => {
    return convertPipelineToArray(pipeline, includeDisabled)
  }, [pipeline, includeDisabled])

  const hasValidPipeline = stages.length > 0 && errors.length === 0
  const isEmpty = pipeline.length === 0 || stages.length === 0

  // Generate code
  const generatedCode = useMemo(() => {
    if (!hasValidPipeline) return ''

    switch (selectedLanguage) {
      case 'nodejs':
        return generateNodeJsCode(database, collection, stages, pipelineOnly, useAsync)
      case 'python':
        return generatePythonCode(database, collection, stages, pipelineOnly)
      case 'java':
        return generateJavaCode(database, collection, stages, pipelineOnly)
      case 'csharp':
        return generateCSharpCode(database, collection, stages, pipelineOnly)
      case 'go':
        return generateGoCode(database, collection, stages, pipelineOnly)
      case 'php':
        return generatePhpCode(database, collection, stages, pipelineOnly)
      case 'ruby':
        return generateRubyCode(database, collection, stages, pipelineOnly)
      case 'shell':
        return generateShellCode(collection, stages)
      default:
        return ''
    }
  }, [selectedLanguage, stages, database, collection, pipelineOnly, useAsync, hasValidPipeline])

  const lineCount = generatedCode.split('\n').length

  // Highlighted code
  const highlightedCode = useMemo(() => {
    if (!generatedCode) return null
    return highlightSyntax(generatedCode, selectedLanguage)
  }, [generatedCode, selectedLanguage])

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedCode)
      setCopyStatus('success')
      setTimeout(() => setCopyStatus('idle'), 2000)
    } catch {
      setCopyStatus('error')
    }
  }, [generatedCode])

  // Download file
  const handleDownload = useCallback(() => {
    const langInfo = LANGUAGES.find(l => l.id === selectedLanguage)
    const extension = langInfo?.extension || '.txt'
    const filename = `aggregation_${collection}${extension}`

    const blob = new Blob([generatedCode], { type: 'text/plain' })
    const a = document.createElement('a')

    // Use URL.createObjectURL if available (browser), otherwise use data URL (test env)
    if (typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob)
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      // Fallback for test environment
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }, [generatedCode, selectedLanguage, collection])

  // Refs for language buttons
  const languageButtonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Keyboard navigation for language selector
  const handleLanguageKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (index + 1) % LANGUAGES.length
      languageButtonRefs.current[nextIndex]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (index - 1 + LANGUAGES.length) % LANGUAGES.length
      languageButtonRefs.current[prevIndex]?.focus()
    }
  }, [])

  // Handle keyboard navigation on the selector container
  const handleSelectorKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIndex = LANGUAGES.findIndex(l => l.id === selectedLanguage)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (currentIndex + 1) % LANGUAGES.length
      languageButtonRefs.current[nextIndex]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (currentIndex - 1 + LANGUAGES.length) % LANGUAGES.length
      languageButtonRefs.current[prevIndex]?.focus()
    }
  }, [selectedLanguage])

  // Focus trap
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return

        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  if (!open) return null

  return (
    <div
      className={backdropStyles}
      data-testid="modal-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={dialogStyles}
        data-testid="export-to-code-dialog"
        role="dialog"
        aria-label="Export to Code"
        aria-modal="true"
      >
        {/* Header */}
        <div className={headerStyles}>
          <div className={headerLeftStyles}>
            <H3>Export to Code</H3>
            <span className={contextStyles}>{database}.{collection}</span>
          </div>
          <IconButton
            ref={firstFocusableRef}
            aria-label="Close dialog"
            onClick={onClose}
            data-testid="close-export-dialog"
          >
            <Icon glyph="X" />
          </IconButton>
        </div>

        {/* Content */}
        <div className={contentStyles}>
          {/* Sidebar */}
          <div className={sidebarStyles}>
            <div
              className={languageSelectorStyles}
              data-testid="language-selector"
              role="listbox"
              aria-label="Select programming language"
              tabIndex={0}
              onKeyDown={handleSelectorKeyDown}
            >
              {LANGUAGES.map((lang, index) => (
                <button
                  key={lang.id}
                  ref={(el) => { languageButtonRefs.current[index] = el }}
                  className={`${languageOptionStyles} ${selectedLanguage === lang.id ? languageOptionSelectedStyles : ''}`}
                  data-testid={`language-option-${lang.id}`}
                  onClick={() => setSelectedLanguage(lang.id)}
                  onKeyDown={(e) => handleLanguageKeyDown(e, index)}
                  role="option"
                  aria-selected={selectedLanguage === lang.id}
                  tabIndex={selectedLanguage === lang.id ? 0 : -1}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <div className={optionsContainerStyles}>
              <div className={optionLabelStyles}>Output Format</div>
              <button
                className={`${toggleButtonStyles} ${!pipelineOnly ? toggleButtonActiveStyles : ''}`}
                onClick={() => setPipelineOnly(false)}
                data-testid="format-driver-code"
              >
                Driver Code
              </button>
              <button
                className={`${toggleButtonStyles} ${pipelineOnly ? toggleButtonActiveStyles : ''}`}
                onClick={() => setPipelineOnly(true)}
                data-testid="format-pipeline-only"
              >
                Pipeline Only
              </button>

              <div className={optionLabelStyles} style={{ marginTop: 8 }}>Options</div>
              <button
                className={`${toggleButtonStyles} ${useAsync ? toggleButtonActiveStyles : ''}`}
                onClick={() => setUseAsync(!useAsync)}
                data-testid="async-await-toggle"
              >
                {useAsync ? '✓ ' : ''}Async/Await
              </button>
              <button
                className={`${toggleButtonStyles} ${showLineNumbers ? toggleButtonActiveStyles : ''}`}
                onClick={() => setShowLineNumbers(!showLineNumbers)}
                data-testid="toggle-line-numbers"
              >
                {showLineNumbers ? '✓ ' : ''}Line Numbers
              </button>
              <button
                className={`${toggleButtonStyles} ${includeDisabled ? toggleButtonActiveStyles : ''}`}
                onClick={() => setIncludeDisabled(!includeDisabled)}
                data-testid="include-disabled-toggle"
              >
                {includeDisabled ? '✓ ' : ''}Include Disabled
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className={mainContentStyles}>
            {/* Warnings */}
            {warnings.length > 0 && (
              <div className={warningStyles} data-testid="validation-warning">
                <Icon glyph="Warning" />
                <span>{warnings.join('. ')}</span>
              </div>
            )}

            {/* Errors */}
            {errors.length > 0 && (
              <div className={errorBannerStyles} data-testid="code-generation-error">
                <Icon glyph="Warning" />
                <span>{errors.join('. ')}</span>
              </div>
            )}

            {/* Actions */}
            <div className={actionsContainerStyles}>
              <Button
                variant="default"
                size="small"
                leftGlyph={copyStatus === 'success' ? <Icon glyph="Checkmark" data-testid="copy-success-icon" /> : <Icon glyph="Copy" />}
                onClick={handleCopy}
                disabled={isEmpty}
                aria-disabled={isEmpty}
                data-testid="copy-code-button"
              >
                Copy
              </Button>
              <Button
                variant="default"
                size="small"
                leftGlyph={<Icon glyph="Download" />}
                onClick={handleDownload}
                disabled={isEmpty}
                aria-disabled={isEmpty}
                data-testid="download-code-button"
              >
                Download
              </Button>

              {copyStatus === 'success' && (
                <span className={statusMessageStyles} role="status">
                  Copied to clipboard
                </span>
              )}
              {copyStatus === 'error' && (
                <span className={errorMessageStyles} data-testid="copy-error">
                  <Icon glyph="Warning" />
                  Failed to copy
                </span>
              )}
            </div>

            {/* Code output */}
            <div className={codeContainerStyles}>
              {showLineNumbers && !isEmpty && (
                <div className={lineNumbersStyles} data-testid="line-numbers">
                  {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
                </div>
              )}

              {isEmpty && (
                <div className={emptyStateStyles} data-testid="empty-pipeline-message">
                  <Icon glyph="InfoWithCircle" />
                  <Body>No pipeline stages to export</Body>
                </div>
              )}

              <pre
                className={`${codeOutputStyles} syntax-highlighted`}
                data-testid="code-output"
                aria-label="Generated code"
                style={{ display: isEmpty ? 'none' : undefined }}
              >
                {highlightedCode}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={footerStyles}>
          <Button
            variant="default"
            onClick={onClose}
            data-testid="cancel-button"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
