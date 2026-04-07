; Method on a receiver type whose name contains Service, UseCase, Manager, or Processor
(method_declaration
  receiver: (parameter_list
    (parameter_declaration
      type: (pointer_type
        (type_identifier) @_t
        (#match? @_t "(Service|UseCase|Manager|Processor|Interactor)"))))
  @method)

(method_declaration
  receiver: (parameter_list
    (parameter_declaration
      type: (type_identifier) @_t
      (#match? @_t "(Service|UseCase|Manager|Processor|Interactor)")))
  @method)
