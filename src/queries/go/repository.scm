; Method on a struct that calls a field named db/conn/pool/tx/store/client via selector
(method_declaration
  body: (block
    (expression_statement
      (call_expression
        function: (selector_expression
          operand: (selector_expression
            field: (field_identifier) @_field
            (#match? @_field "^(db|conn|pool|tx|store|client|DB|Pool|Conn|Tx)$"))
          field: (field_identifier) @_verb
          (#match? @_verb "^(Query|QueryRow|Exec|QueryContext|ExecContext|QueryRowContext|Begin|BeginTx|Prepare|Find|First|Create|Save|Delete|Update|Updates|Upsert|Where|Select|Raw|Scan|Count|Pluck)$"))))))

; Direct field method call: self.db.Query(...)
(call_expression
  function: (selector_expression
    operand: (selector_expression
      field: (field_identifier) @_field
      (#match? @_field "^(db|pool|conn|tx|store|DB|Pool|Conn|Tx)$")))
  @call)
