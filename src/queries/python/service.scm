; Class decorated with DI/service decorators
(decorated_definition
  (decorator
    (call
      function: (identifier) @_dec
      (#match? @_dec "^(injectable|service|component|singleton|provider|dataclass)$")))
  definition: (class_definition) @class)

(decorated_definition
  (decorator
    (identifier) @_dec
    (#match? @_dec "^(injectable|service|component|singleton|provider)$"))
  definition: (class_definition) @class)

; Class with Service, UseCase, Manager, or Interactor in its name
(class_definition
  name: (identifier) @_name
  (#match? @_name "(Service|UseCase|Manager|Processor|Interactor)$")) @class
