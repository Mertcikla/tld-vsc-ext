; Function that takes a parameter of type with db/pool/conn/store in the name
(function_item
  parameters: (parameters
    (parameter
      pattern: (_)
      type: (_) @_t
      (#match? @_t "^.*(Pool|Conn|Connection|Db|Store|Repository|Client|Database).*$")))
  @fn)

; Method call chain with query/execute/fetch verbs
(call_expression
  function: (field_expression
    field: (field_identifier) @_m
    (#match? @_m "^(query|execute|fetch|fetch_one|fetch_all|fetch_optional|insert|update|delete|begin|commit|rollback|prepare|bind|acquire|release)$")))
