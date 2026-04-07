export const TREE_SITTER_ROLE_QUERY_FILES = ['api_entry', 'repository', 'service'] as const

export type TreeSitterMatchedRole = (typeof TREE_SITTER_ROLE_QUERY_FILES)[number]