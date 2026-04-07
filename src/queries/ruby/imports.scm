; require 'path' or require_relative 'path' with or without parenthesis
(call
  method: (identifier) @_m
  (#match? @_m "^require")
  arguments: (argument_list
    (string
      (string_content) @import_path)?
    (string)? @import_path_fallback))
