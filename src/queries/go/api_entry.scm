; Function with http.ResponseWriter and *http.Request parameters (standard library handler)
(function_declaration
  parameters: (parameter_list
    (parameter_declaration
      type: (pointer_type
        (qualified_type
          package: (package_identifier)
          name: (type_identifier) @_t
          (#eq? @_t "Request")))))
  @fn)

; Method that takes a *http.Request or equivalent named req/r/ctx/c
(method_declaration
  parameters: (parameter_list
    (parameter_declaration
      name: (identifier) @_p
      (#match? @_p "^(req|r|ctx|c|request|w|rw)$")))
  @method)

; Call to router registration methods: router.GET, r.POST, app.Route, mux.Handle
(call_expression
  function: (selector_expression
    field: (field_identifier) @_verb
    (#match? @_verb "^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Handle|HandleFunc|Use|Route|Register|Group|Static)$")))
