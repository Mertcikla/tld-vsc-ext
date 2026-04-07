; Business logic classes
(class
  name: (constant) @_name
  (#match? @_name "Service$|Manager$|Processor$|UseCase$")) @class

(module
  name: (constant) @_name
  (#match? @_name "Services$|UseCases$")) @module
