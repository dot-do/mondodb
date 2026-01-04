import defaultComponents from 'fumadocs-ui/mdx';
import { Card, Cards } from 'fumadocs-ui/components/card';
import type { MDXComponents } from 'mdx/types';

// For Next.js App Router MDX support
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    Card,
    Cards,
    ...components,
  };
}

// For Fumadocs MDX support
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultComponents,
    Card,
    Cards,
    ...components,
  };
}
