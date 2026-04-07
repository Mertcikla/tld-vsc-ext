; Static import: import ... from '...'
(import_statement
  source: (string
    (string_fragment) @import_path))

; Dynamic import: import('...')
(call_expression
  function: (import)
  arguments: (arguments
    (string
      (string_fragment) @import_path)))

; require('...')
(call_expression
  function: (identifier) @_req
  (#eq? @_req "require")
  arguments: (arguments
    (string
      (string_fragment) @import_path)))
