; Struct whose name contains Service, UseCase, Manager, or Processor
(struct_item
  name: (type_identifier) @_name
  (#match? @_name "(Service|UseCase|Manager|Processor|Interactor)$")) @struct

; impl block for a type whose name contains Service etc.
(impl_item
  type: (type_identifier) @_name
  (#match? @_name "(Service|UseCase|Manager|Processor|Interactor)$")) @impl
