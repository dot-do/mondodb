import { docs } from 'fumadocs-mdx:collections/server';
import { loader } from 'fumadocs-core/source';

export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
});

// Helper functions for page access
export const getPage = source.getPage;
export const getPages = source.getPages;
export const pageTree = source.pageTree;
