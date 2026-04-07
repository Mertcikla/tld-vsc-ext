; import block: import ( "path" )
(import_spec
  path: (interpreted_string_literal) @import_path)

; Single import: import "path"
(import_declaration
  (import_spec
    path: (interpreted_string_literal) @import_path))
