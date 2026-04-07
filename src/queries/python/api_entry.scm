; Function with a parameter named request/req/r (Django/Flask/FastAPI convention)
(function_definition
  parameters: (parameters
    (identifier) @_p
    (#match? @_p "^(request|req|r)$"))
  @fn)

; Method decorated with route/app/router decorator
(decorated_definition
  (decorator
    (call
      function: (attribute
        attribute: (identifier) @_attr
        (#match? @_attr "^(route|get|post|put|patch|delete|head|options|view|api_view|action)$"))))
  definition: (_) @fn)

(decorated_definition
  (decorator
    (attribute
      attribute: (identifier) @_attr
      (#match? @_attr "^(route|get|post|put|patch|delete|head|options|view|api_view)$")))
  definition: (_) @fn)
