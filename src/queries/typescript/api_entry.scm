; Function/method that receives req/res/ctx/request/response/c/w/r as first param
; These are the conventional names for HTTP handler parameters across all frameworks.
(function_declaration
  parameters: (formal_parameters
    (required_parameter
      pattern: (identifier) @_p
      (#match? @_p "^(req|res|ctx|request|response|c|w|r)$"))) @fn)

(arrow_function
  parameters: (formal_parameters
    (required_parameter
      pattern: (identifier) @_p
      (#match? @_p "^(req|res|ctx|request|response|c|w|r)$"))) @fn)

; Method calls on an object where the method name is an HTTP verb or route registration
(call_expression
  function: (member_expression
    property: (property_identifier) @_verb
    (#match? @_verb "^(get|post|put|patch|delete|head|options|handle|use|route|register|all|group)$")))

; Class method with decorator pattern (NestJS, Angular — decorator name contains route keyword)
(decorator
  (call_expression
    function: (identifier) @_dec
    (#match? @_dec "^(Get|Post|Put|Patch|Delete|Controller|Route|Router|Handler|Endpoint)$")))
