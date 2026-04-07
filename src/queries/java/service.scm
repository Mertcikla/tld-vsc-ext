; Class annotated with Spring/Jakarta service/component annotations
(class_declaration
  (modifiers
    (annotation
      name: (identifier) @_ann
      (#match? @_ann "^(Service|Component|Bean|Transactional|UseCase|ApplicationService|DomainService|Stateless|Singleton)$")))
  @class)
