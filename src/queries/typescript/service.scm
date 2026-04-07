; Class or function decorated with @Injectable, @Service, @Component (dependency injection frameworks)
(decorator
  (call_expression
    function: (identifier) @_dec
    (#match? @_dec "^(Injectable|Service|Component|Provider|Singleton|UseCase)$")))

(decorator
  (identifier) @_dec
  (#match? @_dec "^(Injectable|Service|Component|Provider|Singleton|UseCase)$"))
