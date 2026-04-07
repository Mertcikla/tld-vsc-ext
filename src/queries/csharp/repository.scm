; Class implementing IRepository<T> or extending DbContext
(class_declaration
  (base_list
    (identifier) @_base
    (#match? @_base "^(IRepository|IGenericRepository|DbContext|IdentityDbContext|DataContext|ApplicationDbContext)$"))
  @class)

; Invocation on _context.Set<T>(), _context.SaveChanges(), etc.
(invocation_expression
  expression: (member_access_expression
    expression: (identifier) @_field
    (#match? @_field "^(_context|context|_db|db|_dbContext|dbContext|_repository|repository|_store|store)$"))
  @call)
