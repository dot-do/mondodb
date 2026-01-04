/**
 * Query and Update translators
 *
 * Translates MongoDB query syntax to SQL for the SQLite backend
 */

export { QueryTranslator } from './query-translator'
export { UpdateTranslator } from './update-translator'
export { SearchTranslator } from './search-translator'
export type { AutocompleteOperator } from './search-translator'
export { HybridSearchTranslator } from './hybrid-translator'
export { buildHighlightSQL, buildSnippetSQL, buildHighlightSelectClause, buildSnippetSelectClause } from './search-highlight'
export type { HighlightOptions, SnippetOptions } from './search-highlight'
