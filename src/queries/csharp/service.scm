; Class with service lifetime attributes
(class_declaration
  (attribute_list
    (attribute
      name: (identifier) @_attr
      (#match? @_attr "^(Service|Scoped|Transient|Singleton|UseCase|ApplicationService)$")))
  @class)

; Class name ending in Service, UseCase, Manager, or Processor
(class_declaration
  name: (identifier) @_name
  (#match? @_name "(Service|UseCase|Manager|Processor|Interactor)$")) @class
